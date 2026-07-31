"""Agente de soporte IT por voz en Telegram.

Se queda esperando. Cuando llaman (llamada privada) o lo invitan a un chat de
voz de grupo, contesta, escucha, piensa y responde con la voz clonada.

Flujo de un turno:
    audio del papá -> VAD detecta que terminó -> Gemini (audio directo)
    -> texto en streaming -> Fish Audio -> PCM -> de vuelta a la llamada
"""
import asyncio
import logging
import time
from typing import Dict, Optional

import aiohttp
import numpy as np
from pyrogram import Client

from pytgcalls import filters as fl
from pytgcalls import PyTgCalls
from pytgcalls.types import (
    ChatUpdate,
    Device,
    Direction,
    ExternalMedia,
    MediaStream,
    RecordStream,
    StreamFrames,
)
from pytgcalls.types.raw import AudioParameters

from . import audio as A
from .brain import Cerebro, Conversacion, avisar_n8n
from .config import cfg
from .voice import VozFish

logging.basicConfig(
    level=getattr(logging, cfg.LOG_LEVEL, logging.INFO),
    format='%(asctime)s %(levelname)s %(name)s: %(message)s',
)
log = logging.getLogger('agente')

SALUDO = (
    'Hola, soy el asistente de Benjamín. '
    'Cuénteme con calma qué le está pasando con el computador.'
)
DESPEDIDA_ESCALADA = (
    'Mire, esto mejor que lo vea Benjamín directamente. '
    'Ya le voy a avisar para que lo llame. Quédese tranquilo.'
)

AUDIO_PARAMS = AudioParameters(bitrate=cfg.SAMPLE_RATE, channels=cfg.CHANNELS)

# Frames de VAD que hay que juntar para cada umbral
_FRAMES_SILENCIO = cfg.SILENCE_MS // A.VAD_FRAME_MS
_FRAMES_MIN_HABLA = cfg.MIN_SPEECH_MS // A.VAD_FRAME_MS
_FRAMES_BARGE_IN = cfg.BARGE_IN_MS // A.VAD_FRAME_MS


class Sesion:
    """Todo el estado de una llamada en curso."""

    ESCUCHANDO = 'escuchando'
    PENSANDO = 'pensando'
    HABLANDO = 'hablando'

    def __init__(self, chat_id: int, cerebro: Cerebro, http: aiohttp.ClientSession):
        self.chat_id = chat_id
        self.cerebro = cerebro
        self.http = http
        self.conv = Conversacion(chat_id=chat_id)
        self.vad = A.VoiceDetector(cfg.VAD_AGGRESSIVENESS)

        self.estado = self.ESCUCHANDO
        self.turno = bytearray()      # audio del turno actual (16k mono)
        self.frames_silencio = 0
        self.frames_habla = 0

        self.salida: asyncio.Queue = asyncio.Queue()
        self.tarea_turno: Optional[asyncio.Task] = None
        self.inicio = time.time()
        self.ultimo_evento = time.time()
        self.cerrando = False

    # -- entrada -----------------------------------------------------------

    def alimentar(self, pcm_48k_estereo: bytes) -> Optional[bytes]:
        """Procesa audio entrante. Devuelve el turno completo si terminó."""
        mono = A.stereo_to_mono(pcm_48k_estereo)
        pcm16k = A.resample(mono, cfg.SAMPLE_RATE, A.VAD_RATE)

        listo = None
        for frame, hay_voz in self.vad.feed(pcm16k):
            if self.estado == self.HABLANDO:
                # Nos están interrumpiendo
                if hay_voz:
                    self.frames_habla += 1
                    if self.frames_habla >= _FRAMES_BARGE_IN:
                        self._interrumpir()
                        self.turno.extend(frame)
                else:
                    self.frames_habla = 0
                continue

            if self.estado == self.PENSANDO:
                # Guardamos lo que diga mientras pensamos, para no perderlo
                if hay_voz:
                    self.turno.extend(frame)
                continue

            # ESCUCHANDO
            if hay_voz:
                self.frames_habla += 1
                self.frames_silencio = 0
                self.turno.extend(frame)
                self.ultimo_evento = time.time()
            else:
                if self.frames_habla:
                    self.frames_silencio += 1
                    self.turno.extend(frame)   # cola de silencio, ayuda al modelo
                    if (
                        self.frames_silencio >= _FRAMES_SILENCIO
                        and self.frames_habla >= _FRAMES_MIN_HABLA
                    ):
                        listo = bytes(self.turno)
                        self._reset_turno()
                elif len(self.turno) == 0:
                    self.frames_silencio += 1
        return listo

    def _reset_turno(self):
        self.turno = bytearray()
        self.frames_habla = 0
        self.frames_silencio = 0

    def _interrumpir(self):
        log.info('[%s] interrumpido por el usuario', self.chat_id)
        if self.tarea_turno and not self.tarea_turno.done():
            self.tarea_turno.cancel()
        while not self.salida.empty():
            try:
                self.salida.get_nowait()
            except asyncio.QueueEmpty:
                break
        self.estado = self.ESCUCHANDO
        self._reset_turno()
        self.ultimo_evento = time.time()

    @property
    def inactiva_hace(self) -> float:
        return time.time() - self.ultimo_evento


class Agente:
    def __init__(self):
        kwargs = dict(api_id=cfg.API_ID, api_hash=cfg.API_HASH)
        if cfg.SESSION_STRING:
            # En Railway no hay disco persistente: la sesión viaja en una env var.
            kwargs.update(session_string=cfg.SESSION_STRING, in_memory=True)
        self.app = Client(cfg.SESSION_NAME, **kwargs)
        self.calls = PyTgCalls(self.app)
        self.sesiones: Dict[int, Sesion] = {}
        self.http: Optional[aiohttp.ClientSession] = None
        self.cerebro: Optional[Cerebro] = None
        self.voz = VozFish()

    # -- autorización ------------------------------------------------------

    def autorizado(self, chat_id: int) -> bool:
        if not cfg.ALLOWED_CHATS:
            return True
        return chat_id in cfg.ALLOWED_CHATS

    # -- ciclo de vida de la llamada --------------------------------------

    async def atender(self, chat_id: int):
        if chat_id in self.sesiones:
            return
        if not self.autorizado(chat_id):
            log.warning('Llamada rechazada de %s (no está en TG_ALLOWED_CHATS)', chat_id)
            return

        log.info('[%s] contestando', chat_id)
        sesion = Sesion(chat_id, self.cerebro, self.http)
        self.sesiones[chat_id] = sesion

        try:
            await self.calls.play(
                chat_id,
                MediaStream(ExternalMedia.AUDIO, AUDIO_PARAMS),
            )
            await self.calls.record(
                chat_id,
                RecordStream(audio=True, audio_parameters=AUDIO_PARAMS),
            )
        except Exception as e:  # noqa: BLE001
            log.error('[%s] no se pudo entrar a la llamada: %s', chat_id, e)
            self.sesiones.pop(chat_id, None)
            return

        asyncio.create_task(self._bombear_salida(sesion))
        asyncio.create_task(self._vigilar_inactividad(sesion))
        # Saludo, ya con la voz clonada
        sesion.tarea_turno = asyncio.create_task(self._decir(sesion, SALUDO))

    async def colgar(self, chat_id: int, motivo: str = ''):
        sesion = self.sesiones.pop(chat_id, None)
        if not sesion:
            return
        sesion.cerrando = True
        if sesion.tarea_turno and not sesion.tarea_turno.done():
            sesion.tarea_turno.cancel()
        log.info('[%s] llamada terminada (%s)', chat_id, motivo or 'normal')
        try:
            await self.calls.leave_call(chat_id)
        except Exception:
            pass
        await avisar_n8n(
            self.http,
            sesion.conv,
            int(time.time() - sesion.inicio),
        )

    # -- salida de audio ---------------------------------------------------

    async def _bombear_salida(self, sesion: Sesion):
        """Empuja frames de 10 ms a ritmo constante.

        Cuando no hay nada que decir manda silencio, así el stream nunca se
        queda sin datos y no se escuchan cortes ni chasquidos.
        """
        silencio = b'\x00' * cfg.FRAME_BYTES
        pendiente = b''
        siguiente = time.monotonic()

        while not sesion.cerrando:
            while len(pendiente) < cfg.FRAME_BYTES and not sesion.salida.empty():
                try:
                    pendiente += sesion.salida.get_nowait()
                except asyncio.QueueEmpty:
                    break

            if len(pendiente) >= cfg.FRAME_BYTES:
                frame, pendiente = (
                    pendiente[:cfg.FRAME_BYTES],
                    pendiente[cfg.FRAME_BYTES:],
                )
            else:
                frame = silencio

            try:
                await self.calls.send_frame(sesion.chat_id, Device.MICROPHONE, frame)
            except Exception as e:  # noqa: BLE001
                log.debug('[%s] send_frame falló: %s', sesion.chat_id, e)
                return

            siguiente += cfg.FRAME_MS / 1000
            dormir = siguiente - time.monotonic()
            if dormir > 0:
                await asyncio.sleep(dormir)
            else:
                # Nos atrasamos: reenganchamos el reloj para no acumular deuda
                siguiente = time.monotonic()

    async def _encolar(self, sesion: Sesion, pcm_mono_48k: bytes):
        if pcm_mono_48k:
            await sesion.salida.put(A.mono_to_stereo(pcm_mono_48k))

    # -- turnos ------------------------------------------------------------

    async def _decir(self, sesion: Sesion, frase: str):
        """Dice una frase fija (saludo, despedida)."""
        sesion.estado = Sesion.HABLANDO

        async def uno():
            yield frase

        try:
            async for pcm in self.voz.sintetizar(uno()):
                await self._encolar(sesion, pcm)
            await self._esperar_a_terminar(sesion)
        except asyncio.CancelledError:
            raise
        finally:
            if sesion.estado == Sesion.HABLANDO:
                sesion.estado = Sesion.ESCUCHANDO
                sesion.ultimo_evento = time.time()

    async def _procesar_turno(self, sesion: Sesion, pcm_turno: bytes):
        sesion.estado = Sesion.PENSANDO
        t0 = time.monotonic()
        primer_audio = None

        try:
            texto = self.cerebro.responder(sesion.conv, pcm_turno)
            sesion.estado = Sesion.HABLANDO
            async for pcm in self.voz.sintetizar(texto):
                if primer_audio is None:
                    primer_audio = time.monotonic() - t0
                    log.info('[%s] primer audio en %.0f ms',
                             sesion.chat_id, primer_audio * 1000)
                await self._encolar(sesion, pcm)

            await self._esperar_a_terminar(sesion)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            log.exception('[%s] falló el turno: %s', sesion.chat_id, e)
        finally:
            if sesion.estado == Sesion.HABLANDO:
                sesion.estado = Sesion.ESCUCHANDO
                sesion.ultimo_evento = time.time()

        estado = sesion.conv.estado
        if estado.codigo in ('escalar', 'estafa'):
            await avisar_n8n(
                self.http, sesion.conv,
                int(time.time() - sesion.inicio),
            )
            if estado.codigo == 'escalar':
                sesion.tarea_turno = asyncio.create_task(
                    self._decir(sesion, DESPEDIDA_ESCALADA),
                )

    async def _esperar_a_terminar(self, sesion: Sesion):
        """Espera a que se vacíe la cola de audio antes de volver a escuchar."""
        while not sesion.salida.empty() and not sesion.cerrando:
            await asyncio.sleep(0.05)
        # Colchón para que salgan los últimos frames en vuelo
        await asyncio.sleep(0.25)

    async def _vigilar_inactividad(self, sesion: Sesion):
        while not sesion.cerrando:
            await asyncio.sleep(5)
            if sesion.inactiva_hace > cfg.IDLE_HANGUP_S:
                await self.colgar(sesion.chat_id, 'inactividad')
                return

    # -- registro de handlers ---------------------------------------------

    def registrar(self):
        calls = self.calls

        @calls.on_update(fl.chat_update(ChatUpdate.Status.INCOMING_CALL))
        async def _entrante(_, update: ChatUpdate):
            await self.atender(update.chat_id)

        @calls.on_update(fl.chat_update(ChatUpdate.Status.INVITED_VOICE_CHAT))
        async def _invitado(_, update: ChatUpdate):
            await self.atender(update.chat_id)

        @calls.on_update(fl.chat_update(ChatUpdate.Status.LEFT_CALL))
        async def _terminada(_, update: ChatUpdate):
            await self.colgar(update.chat_id, 'la otra parte colgó')

        @calls.on_update(
            fl.stream_frame(Direction.INCOMING, Device.MICROPHONE),
        )
        async def _audio(_, update: StreamFrames):
            sesion = self.sesiones.get(update.chat_id)
            if not sesion or sesion.cerrando:
                return

            pcm = _mezclar(update)
            if not pcm:
                return

            turno = sesion.alimentar(pcm)
            if turno and sesion.estado == Sesion.ESCUCHANDO:
                sesion.estado = Sesion.PENSANDO
                sesion.tarea_turno = asyncio.create_task(
                    self._procesar_turno(sesion, turno),
                )

        # Comando manual para entrar a un chat de voz de grupo
        from pyrogram import filters as pf
        from pyrogram.types import Message

        @self.app.on_message(pf.command('soporte', prefixes=['!', '/']))
        async def _soporte(_, message: Message):
            await self.atender(message.chat.id)

    async def correr(self):
        self.http = aiohttp.ClientSession()
        self.cerebro = Cerebro(self.http)
        self.registrar()

        if not cfg.FISH_VOICE_ID:
            log.warning(
                'FISH_VOICE_ID vacío: se usará una voz genérica de Fish. '
                'Corre scripts/clonar_voz.py para clonar la tuya.',
            )
        log.info('VAD: %s | modelo: %s | voz: %s',
                 A.VoiceDetector().backend, cfg.GEMINI_MODEL,
                 cfg.FISH_VOICE_ID or '(genérica)')

        await self.calls.start()
        yo = await self.app.get_me()
        log.info('Escuchando como %s (id %s). Listo para recibir llamadas.',
                 yo.first_name, yo.id)
        await asyncio.Event().wait()


def _mezclar(update: StreamFrames) -> bytes:
    """Suma los frames de todos los participantes que hablaron a la vez."""
    frames = [f.frame for f in update.frames if f.frame]
    if not frames:
        return b''
    if len(frames) == 1:
        return frames[0]
    n = min(len(f) for f in frames)
    acc = np.zeros(n // 2, dtype=np.int32)
    for f in frames:
        acc += np.frombuffer(f[:n], dtype='<i2').astype(np.int32)
    return np.clip(acc, -32768, 32767).astype('<i2').tobytes()


def main():
    agente = Agente()
    loop = asyncio.get_event_loop()
    try:
        loop.run_until_complete(agente.correr())
    except KeyboardInterrupt:
        log.info('Chao.')


if __name__ == '__main__':
    main()
