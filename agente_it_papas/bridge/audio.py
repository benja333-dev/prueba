"""Utilidades de audio: PCM, remuestreo, WAV y detección de voz."""
import struct
from io import BytesIO
from typing import Optional

import numpy as np

try:
    import webrtcvad
    _HAS_WEBRTCVAD = True
except ImportError:  # pragma: no cover - fallback si no compila la extensión
    _HAS_WEBRTCVAD = False


# --------------------------------------------------------------------------
# Conversiones de formato
# --------------------------------------------------------------------------

def pcm_to_array(data: bytes) -> np.ndarray:
    """bytes PCM16 little-endian -> np.int16."""
    return np.frombuffer(data, dtype='<i2')


def stereo_to_mono(data: bytes) -> bytes:
    """Mezcla los dos canales promediándolos. Entra y sale PCM16."""
    buf = pcm_to_array(data)
    if buf.size % 2:
        buf = buf[:-1]
    mono = buf.reshape(-1, 2).mean(axis=1)
    return mono.astype('<i2').tobytes()


def mono_to_stereo(data: bytes) -> bytes:
    """Duplica el canal mono en L y R."""
    buf = pcm_to_array(data)
    return np.repeat(buf, 2).astype('<i2').tobytes()


def resample(data: bytes, src_rate: int, dst_rate: int) -> bytes:
    """Remuestreo lineal mono. Suficiente para voz y sin dependencias pesadas."""
    if src_rate == dst_rate:
        return data
    buf = pcm_to_array(data).astype(np.float32)
    if buf.size == 0:
        return b''
    n_out = int(round(buf.size * dst_rate / src_rate))
    if n_out <= 0:
        return b''
    idx = np.linspace(0, buf.size - 1, n_out, dtype=np.float32)
    out = np.interp(idx, np.arange(buf.size, dtype=np.float32), buf)
    return np.clip(out, -32768, 32767).astype('<i2').tobytes()


def to_wav(pcm: bytes, sample_rate: int, channels: int = 1) -> bytes:
    """Envuelve PCM16 crudo en un contenedor WAV."""
    byte_rate = sample_rate * channels * 2
    header = struct.pack(
        '<4sI4s4sIHHIIHH4sI',
        b'RIFF', 36 + len(pcm), b'WAVE',
        b'fmt ', 16, 1, channels, sample_rate,
        byte_rate, channels * 2, 16,
        b'data', len(pcm),
    )
    return header + pcm


def wav_bytes(pcm: bytes, sample_rate: int, channels: int = 1) -> BytesIO:
    bio = BytesIO(to_wav(pcm, sample_rate, channels))
    bio.seek(0)
    return bio


# --------------------------------------------------------------------------
# Detección de actividad de voz
# --------------------------------------------------------------------------

VAD_RATE = 16000          # webrtcvad solo acepta 8k/16k/32k/48k
VAD_FRAME_MS = 20
VAD_FRAME_BYTES = VAD_RATE * 2 * VAD_FRAME_MS // 1000


class VoiceDetector:
    """Dice, frame a frame, si hay alguien hablando.

    Usa webrtcvad cuando está disponible. Si no, cae a un detector por
    energía con piso de ruido adaptativo, que anda bien porque Telegram ya
    aplica supresión de ruido antes de entregarnos el audio.
    """

    def __init__(self, aggressiveness: int = 2):
        self._vad = webrtcvad.Vad(aggressiveness) if _HAS_WEBRTCVAD else None
        self._noise_floor: Optional[float] = None
        self._buf = b''

    @property
    def backend(self) -> str:
        return 'webrtcvad' if self._vad else 'rms'

    def _rms_is_speech(self, frame: bytes) -> bool:
        buf = pcm_to_array(frame).astype(np.float32) / 32768.0
        if buf.size == 0:
            return False
        rms = float(np.sqrt(np.mean(np.square(buf))))
        if self._noise_floor is None:
            self._noise_floor = rms
            return False
        # El piso sube lento y baja rápido, para adaptarse sin comerse la voz.
        if rms < self._noise_floor:
            self._noise_floor = 0.9 * self._noise_floor + 0.1 * rms
        else:
            self._noise_floor = 0.995 * self._noise_floor + 0.005 * rms
        return rms > max(self._noise_floor * 3.0, 0.006)

    def is_speech(self, frame_16k_mono: bytes) -> bool:
        if len(frame_16k_mono) != VAD_FRAME_BYTES:
            return False
        if self._vad:
            try:
                return self._vad.is_speech(frame_16k_mono, VAD_RATE)
            except Exception:
                return self._rms_is_speech(frame_16k_mono)
        return self._rms_is_speech(frame_16k_mono)

    def feed(self, pcm_16k_mono: bytes):
        """Parte el audio en frames de 20 ms y devuelve (frame, hay_voz)."""
        self._buf += pcm_16k_mono
        while len(self._buf) >= VAD_FRAME_BYTES:
            frame, self._buf = (
                self._buf[:VAD_FRAME_BYTES],
                self._buf[VAD_FRAME_BYTES:],
            )
            yield frame, self.is_speech(frame)

    def reset(self):
        self._buf = b''
