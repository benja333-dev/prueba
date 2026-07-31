"""La voz: streaming de texto a audio con Fish Audio por WebSocket.

Le vamos entregando el texto a medida que Gemini lo produce, y Fish nos va
devolviendo audio sin esperar a que la frase esté completa. Ahí está el truco
de que la respuesta se sienta inmediata: el primer audio llega en ~90 ms.
"""
import asyncio
import logging
from typing import AsyncIterator

import msgpack
import websockets

from .config import cfg

log = logging.getLogger('voice')

WS_URL = 'wss://api.fish.audio/v1/tts/live'
FISH_RATE = 48000   # se lo pedimos explícito para no tener que remuestrear


class VozFish:
    """Convierte un stream de texto en un stream de PCM16 mono a 48 kHz."""

    def __init__(self):
        self._headers = {
            'Authorization': f'Bearer {cfg.FISH_KEY}',
            'model': cfg.FISH_MODEL,
        }

    def _peticion_inicial(self) -> dict:
        req = {
            'text': '',
            'format': 'pcm',
            'sample_rate': FISH_RATE,
            'latency': 'low',
            'temperature': 0.7,
            'chunk_length': 120,   # trozos cortos => empieza a hablar antes
        }
        if cfg.FISH_VOICE_ID:
            req['reference_id'] = cfg.FISH_VOICE_ID
        return {'event': 'start', 'request': req}

    async def sintetizar(
        self,
        texto: AsyncIterator[str],
    ) -> AsyncIterator[bytes]:
        """Abre la conexión, empuja el texto y va soltando el PCM que llega."""
        try:
            async with websockets.connect(
                WS_URL,
                additional_headers=self._headers,
                ping_interval=20,
                close_timeout=5,
                max_size=None,
            ) as ws:
                await ws.send(msgpack.packb(self._peticion_inicial()))

                async def empujar_texto():
                    hubo_algo = False
                    try:
                        async for trozo in texto:
                            if not trozo:
                                continue
                            hubo_algo = True
                            await ws.send(msgpack.packb({
                                'event': 'text',
                                'text': trozo,
                            }))
                        if hubo_algo:
                            await ws.send(msgpack.packb({'event': 'flush'}))
                    except asyncio.CancelledError:
                        # Interrupción del usuario: cortamos limpio.
                        raise
                    finally:
                        try:
                            await ws.send(msgpack.packb({'event': 'stop'}))
                        except Exception:
                            pass

                tarea = asyncio.create_task(empujar_texto())
                try:
                    async for bruto in ws:
                        if isinstance(bruto, str):
                            continue
                        try:
                            msg = msgpack.unpackb(bruto, raw=False)
                        except Exception:
                            continue
                        evento = msg.get('event')
                        if evento == 'audio':
                            audio = msg.get('audio')
                            if audio:
                                yield audio
                        elif evento == 'finish':
                            razon = msg.get('reason')
                            if razon == 'error':
                                log.error('Fish terminó con error: %s', msg)
                            break
                        elif evento == 'log':
                            log.debug('Fish: %s', msg.get('message'))
                finally:
                    tarea.cancel()
                    try:
                        await tarea
                    except (asyncio.CancelledError, Exception):
                        pass

        except websockets.exceptions.InvalidStatus as e:
            log.error(
                'Fish rechazó la conexión (%s). Revisa FISH_API_KEY y que el '
                'modelo "%s" exista.', e, cfg.FISH_MODEL,
            )
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            log.error('Falló la síntesis de voz: %s', e)


async def texto_a_pcm_completo(frase: str) -> bytes:
    """Sintetiza una frase suelta de una vez. Para saludos y avisos fijos."""
    async def uno():
        yield frase

    trozos = []
    async for pcm in VozFish().sintetizar(uno()):
        trozos.append(pcm)
    return b''.join(trozos)
