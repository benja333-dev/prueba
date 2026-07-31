"""Configuración por variables de entorno."""
import os


def _req(name: str) -> str:
    v = os.getenv(name, '').strip()
    if not v:
        raise RuntimeError(
            f'Falta la variable de entorno {name}. '
            f'Revisa el .env.example para saber de dónde se saca.',
        )
    return v


class Config:
    # --- Telegram (cuenta de usuario dedicada, NO un bot) ---
    API_ID = int(_req('TG_API_ID'))
    API_HASH = _req('TG_API_HASH')
    SESSION_NAME = os.getenv('TG_SESSION_NAME', 'agente_it')
    # Sesión Pyrogram exportada como string (para no subir archivos a Railway)
    SESSION_STRING = os.getenv('TG_SESSION_STRING', '').strip()

    # Chats autorizados a hablar con el agente. IDs separados por coma.
    # Vacío = acepta a cualquiera (útil solo para pruebas).
    ALLOWED_CHATS = {
        int(x) for x in os.getenv('TG_ALLOWED_CHATS', '').replace(' ', '').split(',') if x
    }

    # --- Gemini (el cerebro) ---
    GEMINI_KEY = _req('GEMINI_API_KEY')
    GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-flash-latest')

    # --- Fish Audio (la voz) ---
    FISH_KEY = _req('FISH_API_KEY')
    FISH_MODEL = os.getenv('FISH_MODEL', 's2.1-pro-free')
    # reference_id del modelo de voz clonada (lo entrega scripts/clonar_voz.py)
    FISH_VOICE_ID = os.getenv('FISH_VOICE_ID', '').strip()

    # --- n8n (tickets y alertas) ---
    N8N_TICKET_URL = os.getenv('N8N_TICKET_URL', '').strip()
    N8N_TICKET_SECRET = os.getenv('N8N_TICKET_SECRET', '').strip()

    # --- Audio ---
    SAMPLE_RATE = 48000       # lo que exige pytgcalls
    CHANNELS = 2
    FRAME_MS = 10
    # bytes de un frame de 10 ms en 48 kHz estéreo PCM16
    FRAME_BYTES = SAMPLE_RATE * 2 * CHANNELS // 100

    # --- Detección de turno ---
    # Silencio necesario para dar por terminado lo que dijo la persona.
    # Los adultos mayores hacen pausas largas: no bajar de 700 ms.
    SILENCE_MS = int(os.getenv('SILENCE_MS', '900'))
    # Habla mínima para considerar que dijeron algo (filtra toses, golpes)
    MIN_SPEECH_MS = int(os.getenv('MIN_SPEECH_MS', '350'))
    # Habla detectada durante la respuesta del agente que gatilla la interrupción
    BARGE_IN_MS = int(os.getenv('BARGE_IN_MS', '450'))
    VAD_AGGRESSIVENESS = int(os.getenv('VAD_AGGRESSIVENESS', '2'))

    # Corta la llamada tras este silencio total (segundos)
    IDLE_HANGUP_S = int(os.getenv('IDLE_HANGUP_S', '120'))

    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')


cfg = Config
