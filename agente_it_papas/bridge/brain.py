"""El cerebro: manda el audio a Gemini y devuelve la respuesta en streaming.

Le pasamos el audio directamente al modelo (sin transcribir aparte). Eso nos
ahorra un salto completo de latencia y además le deja oír el tono: si el papá
suena frustrado o asustado, el modelo lo nota.
"""
import asyncio
import base64
import json
import logging
import re
from dataclasses import dataclass, field
from typing import AsyncIterator, List, Optional

import aiohttp

from .audio import to_wav
from .config import cfg
from .recetas import system_prompt

log = logging.getLogger('brain')

BASE = 'https://generativelanguage.googleapis.com/v1beta'
ESTADO_RE = re.compile(
    r'\[\[\s*ESTADO\s*:\s*([a-z_]+)\s*\|?\s*(.*?)\s*\]\]',
    re.IGNORECASE | re.DOTALL,
)

# Cuánto historial conserva. Una llamada de soporte no necesita más.
MAX_TURNOS = 24


@dataclass
class Estado:
    """Lo que el modelo reporta al final de cada respuesta."""
    codigo: str = 'en_curso'
    resumen: str = ''

    @property
    def necesita_aviso(self) -> bool:
        return self.codigo in ('escalar', 'estafa')


@dataclass
class Conversacion:
    chat_id: int
    contenidos: List[dict] = field(default_factory=list)
    estado: Estado = field(default_factory=Estado)
    transcripcion: List[str] = field(default_factory=list)

    def _recortar(self):
        if len(self.contenidos) > MAX_TURNOS:
            self.contenidos = self.contenidos[-MAX_TURNOS:]

    def agregar_audio_usuario(self, pcm_16k_mono: bytes):
        wav = to_wav(pcm_16k_mono, 16000, 1)
        self.contenidos.append({
            'role': 'user',
            'parts': [{
                'inline_data': {
                    'mime_type': 'audio/wav',
                    'data': base64.b64encode(wav).decode('ascii'),
                },
            }],
        })
        self._recortar()

    def agregar_respuesta(self, texto: str):
        self.contenidos.append({'role': 'model', 'parts': [{'text': texto}]})
        self.transcripcion.append(f'Agente: {texto}')
        self._recortar()

    def compactar_audio(self):
        """Reemplaza los audios viejos por un marcador de texto.

        Mandar veinte WAV en cada request es carísimo en tokens y en tiempo.
        Solo el último turno viaja como audio; los anteriores ya quedaron
        representados en las respuestas del modelo.
        """
        audios = [
            i for i, c in enumerate(self.contenidos)
            if c['role'] == 'user' and 'inline_data' in c['parts'][0]
        ]
        for i in audios[:-1]:
            self.contenidos[i] = {
                'role': 'user',
                'parts': [{'text': '(el usuario respondió por voz)'}],
            }


class Cerebro:
    def __init__(self, session: aiohttp.ClientSession):
        self._session = session
        self._system = system_prompt()

    async def responder(
        self,
        conv: Conversacion,
        pcm_16k_mono: bytes,
    ) -> AsyncIterator[str]:
        """Recibe el audio del turno y va soltando el texto a medida que llega.

        Los trozos salen listos para mandar al TTS. La etiqueta [[ESTADO]] se
        filtra acá: nunca llega a la voz.
        """
        conv.compactar_audio()
        conv.agregar_audio_usuario(pcm_16k_mono)

        payload = {
            'system_instruction': {'parts': [{'text': self._system}]},
            'contents': conv.contenidos,
            'generationConfig': {
                'temperature': 0.7,
                'maxOutputTokens': 400,
                'responseMimeType': 'text/plain',
            },
        }
        url = (
            f'{BASE}/models/{cfg.GEMINI_MODEL}:streamGenerateContent'
            f'?alt=sse&key={cfg.GEMINI_KEY}'
        )

        completo = ''
        visible = ''      # lo que ya soltamos hacia la voz
        cortado = False   # ya apareció la etiqueta, no emitimos más

        try:
            async with self._session.post(
                url,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=45),
            ) as resp:
                if resp.status != 200:
                    detalle = await resp.text()
                    log.error('Gemini %s: %s', resp.status, detalle[:400])
                    yield (
                        'Disculpe, se me cortó un segundo. '
                        '¿Me repite qué estaba pasando?'
                    )
                    return

                async for linea in resp.content:
                    txt = linea.decode('utf-8', 'ignore').strip()
                    if not txt.startswith('data:'):
                        continue
                    cuerpo = txt[5:].strip()
                    if not cuerpo or cuerpo == '[DONE]':
                        continue
                    try:
                        dato = json.loads(cuerpo)
                    except json.JSONDecodeError:
                        continue

                    for cand in dato.get('candidates', []):
                        for parte in cand.get('content', {}).get('parts', []):
                            trozo = parte.get('text', '')
                            if not trozo:
                                continue
                            completo += trozo
                            if cortado:
                                continue
                            # No emitir nada desde que aparece "[["
                            corte = completo.find('[[')
                            hablable = (
                                completo[:corte] if corte != -1 else completo
                            )
                            if corte != -1:
                                cortado = True
                            nuevo = hablable[len(visible):]
                            if nuevo:
                                visible = hablable
                                yield nuevo
        except asyncio.TimeoutError:
            log.warning('Gemini se demoró demasiado')
            yield 'Perdón, me quedé pensando. ¿Me lo repite?'
            return
        except aiohttp.ClientError as e:
            log.error('Error de red hacia Gemini: %s', e)
            yield 'Disculpe, tuve un problema de conexión. ¿Me repite?'
            return

        conv.estado = _leer_estado(completo, conv.estado)
        limpio = ESTADO_RE.sub('', completo).strip()
        if limpio:
            conv.agregar_respuesta(limpio)


def _leer_estado(texto: str, previo: Estado) -> Estado:
    m = ESTADO_RE.search(texto)
    if not m:
        return previo
    codigo = m.group(1).lower().strip()
    if codigo not in ('en_curso', 'resuelto', 'escalar', 'estafa'):
        codigo = previo.codigo
    return Estado(codigo=codigo, resumen=m.group(2).strip() or previo.resumen)


async def avisar_n8n(
    session: aiohttp.ClientSession,
    conv: Conversacion,
    duracion_s: int,
    quien: Optional[str] = None,
):
    """Manda el ticket a n8n. Si falla, la llamada igual fue útil."""
    if not cfg.N8N_TICKET_URL:
        return
    payload = {
        'chat_id': conv.chat_id,
        'quien': quien or str(conv.chat_id),
        'estado': conv.estado.codigo,
        'resumen': conv.estado.resumen,
        'duracion_segundos': duracion_s,
        'transcripcion': '\n'.join(conv.transcripcion),
        'requiere_atencion': conv.estado.necesita_aviso,
    }
    headers = {}
    if cfg.N8N_TICKET_SECRET:
        headers['X-Ticket-Secret'] = cfg.N8N_TICKET_SECRET
    try:
        async with session.post(
            cfg.N8N_TICKET_URL,
            json=payload,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=15),
        ) as r:
            if r.status >= 300:
                log.warning('n8n respondió %s', r.status)
    except Exception as e:  # noqa: BLE001 - nunca romper la llamada por esto
        log.warning('No se pudo avisar a n8n: %s', e)
