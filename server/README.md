# Kokoro TTS service

This is a self-hosted HTTP service for the app's online Kokoro speech mode. The API accepts a model ID and speaker ID, and returns WAV audio. The service keeps the model weights on the server; no third-party speech API key is required by this self-hosted implementation.

## Run with Docker

From the repository root:

```bash
# Windows PowerShell:
Copy-Item .env.example .env
# Generate a random code:
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
# Paste the generated value into SPEECH_ENROLLMENT_CODE in .env, then:
docker compose up -d --build

# macOS/Linux alternative:
# cp .env.example .env
# openssl rand -hex 24
```

The Compose file keeps model weights and enrolled-device token hashes in persistent Docker volumes. By default, the HTTP port is bound to localhost only. Put it behind an HTTPS reverse proxy on the same host, then expose that proxy only through your private VPN or another access-controlled path; do not expose port 8000 directly to the public internet.

The first start downloads the upstream sherpa-onnx Kokoro int8 archive (about 147 MB), verifies its pinned SHA-256 digest, extracts it into the volume, and checks that all model, dictionary, lexicon, and rule-FST assets exist before starting the service. Later starts reuse the verified model.

- Health: `GET /health`
- Device enrollment: `POST /v1/devices/enroll` (server enrollment code required)
- Revoke a device: `POST /v1/devices/revoke` (bearer device token required)
- Synthesis: `POST /v1/audio/speech` (bearer device token required)
- Model ID: `kokoro-multi-lang-v1_1`
- Speaker IDs: `0..102`
- Text limit: 420 characters per request
- Speed: `0.5..2.0`
- Response: `audio/wav`

Example:

```bash
curl -X POST http://localhost:8000/v1/audio/speech \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $DEVICE_TOKEN" \
  -d '{"model":"kokoro-multi-lang-v1_1","speaker_id":3,"text":"你好，欢迎使用私人小说。","speed":1.0}' \
  --output sample.wav
```

## Deployment and security

Do not expose this service directly to the public internet without an authenticated reverse proxy, HTTPS, request limits, and monitoring. Set a long random `SPEECH_ENROLLMENT_CODE` on the server and keep it private. In the app, enter the server URL and this enrollment code once to bind the device. The returned device token is stored in iOS SecureStore/Keychain; it is not an upstream AI provider API key. The server stores only token hashes in the persistent `/data` volume, and a device can be revoked from the app. Do not put a provider API key or server enrollment code in the iOS app. This service runs Kokoro itself, so it does not need a paid upstream TTS API key.

This service is an independently deployable backend; creating the files does not deploy it. The app already includes the HTTPS endpoint setting, secure device enrollment, chunked request client, WAV cache writer, and audio playback queue. Deploy this backend first, then enter its HTTPS base URL and server enrollment code in the app's Voice settings before online synthesis can be used.

After the iPhone is bound, you can clear `SPEECH_ENROLLMENT_CODE` in the server environment and restart the service. Existing device tokens continue to work, but new device enrollment is disabled until you configure a new code.
