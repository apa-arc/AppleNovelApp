# Kokoro TTS service

This is a self-hosted HTTP service for the app's online Kokoro speech mode. The API accepts a model ID and speaker ID, and returns WAV audio. The service keeps the model weights on the server; no third-party speech API key is required by this self-hosted implementation.

## Run with Docker

From the repository root:

```bash
docker build -f server/Dockerfile -t private-novel-tts .
docker run --rm -p 8000:8000 -v kokoro-models:/models private-novel-tts
```

The first start downloads the upstream sherpa-onnx Kokoro int8 archive (about 147 MB) into the volume, then starts the service. Later starts reuse the downloaded model.

- Health: `GET /health`
- Synthesis: `POST /v1/audio/speech`
- Model ID: `kokoro-multi-lang-v1_1`
- Speaker IDs: `0..102`
- Text limit: 420 characters per request
- Speed: `0.5..2.0`
- Response: `audio/wav`

Example:

```bash
curl -X POST http://localhost:8000/v1/audio/speech \
  -H 'Content-Type: application/json' \
  -d '{"model":"kokoro-multi-lang-v1_1","speaker_id":3,"text":"你好，欢迎使用私人小说。","speed":1.0}' \
  --output sample.wav
```

## Deployment and security

Do not expose this service directly to the public internet without an authenticated reverse proxy, HTTPS, request limits, and monitoring. The app must only be configured with the HTTPS URL of a deployment you control. Do not put a provider API key or server credential in the iOS app. This service runs Kokoro itself, so it does not need a paid upstream TTS API key.

This service is an independently deployable backend; creating the files does not deploy it or make cloud speech available in the app. The app-side endpoint setting and audio queue still need to be connected, and the backend must be deployed before online synthesis can be used.
