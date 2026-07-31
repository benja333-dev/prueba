FROM python:3.12-slim

# ntgcalls (el motor de audio de pytgcalls) trae binarios precompilados, pero
# webrtcvad y tgcrypto pueden necesitar compilar. ffmpeg lo usa pytgcalls
# internamente para cualquier fuente que no sea PCM crudo.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        ffmpeg \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY bridge/ ./bridge/
COPY scripts/ ./scripts/

ENV PYTHONUNBUFFERED=1

CMD ["python", "-m", "bridge.main"]
