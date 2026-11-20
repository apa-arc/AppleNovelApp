FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    KOKORO_MODEL_DIR=/models/kokoro \
    SPEECH_TOKEN_DB=/data/device-tokens.sqlite3 \
    TTS_NUM_THREADS=2 \
    TTS_MAX_CONCURRENT=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl bzip2 libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /data /models/kokoro

WORKDIR /app
COPY server/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY server ./server
RUN chmod +x ./server/download-model.sh

EXPOSE 8000
CMD ["sh", "-c", "./server/download-model.sh && uvicorn server.app:app --host 0.0.0.0 --port 8000"]
