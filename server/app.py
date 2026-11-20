import asyncio
import os
from contextlib import asynccontextmanager

import sherpa_onnx
import soundfile as sf
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .auth import is_device_token_valid, issue_device_token, revoke_device_token
from .tts_core import LOGICAL_MODEL_ID, find_model_assets, validate_synthesis_payload

MODEL_ROOT = os.getenv("KOKORO_MODEL_DIR", "/models/kokoro")
NUM_THREADS = max(1, int(os.getenv("TTS_NUM_THREADS", "2")))
MAX_CONCURRENT = max(1, int(os.getenv("TTS_MAX_CONCURRENT", "1")))
ENROLLMENT_CODE = os.getenv("SPEECH_ENROLLMENT_CODE", "")
TOKEN_DB_PATH = os.getenv("SPEECH_TOKEN_DB", "/data/device-tokens.sqlite3")

_tts = None
_tts_lock = asyncio.Semaphore(MAX_CONCURRENT)


class SpeechRequest(BaseModel):
    model: str = LOGICAL_MODEL_ID
    speaker_id: int = Field(ge=0, le=102)
    text: str = Field(min_length=1, max_length=420)
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


class EnrollmentRequest(BaseModel):
    enrollment_code: str = Field(min_length=8, max_length=256)


def load_tts():
    assets = find_model_assets(MODEL_ROOT)
    config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
                model=assets["model"],
                voices=assets["voices"],
                tokens=assets["tokens"],
                data_dir=assets["data_dir"],
                lexicon=assets["lexicon"],
            ),
            num_threads=NUM_THREADS,
            debug=False,
        ),
        rule_fsts=assets["rule_fsts"],
        max_num_sentences=1,
    )
    if not config.validate():
        raise RuntimeError("Kokoro model configuration is invalid.")
    return sherpa_onnx.OfflineTts(config)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _tts
    _tts = await asyncio.to_thread(load_tts)
    yield
    _tts = None


app = FastAPI(title="Private Novel Kokoro TTS", version="1.0.0", lifespan=lifespan)


def get_bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="A bound device token is required.")
    token = authorization[7:].strip()
    if not token or not is_device_token_valid(token, TOKEN_DB_PATH):
        raise HTTPException(status_code=401, detail="Device token is invalid or revoked.")
    return token


@app.get("/health")
async def health():
    return {
        "status": "ok" if _tts is not None else "model-not-ready",
        "model": LOGICAL_MODEL_ID,
        "speaker_count": 103,
    }


@app.post("/v1/devices/enroll")
async def enroll_device(request: EnrollmentRequest):
    try:
        token = issue_device_token(request.enrollment_code, ENROLLMENT_CODE, TOKEN_DB_PATH)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail="Device enrollment is not configured on this server.") from error
    except PermissionError as error:
        raise HTTPException(status_code=401, detail="Enrollment code is incorrect.") from error
    return {"access_token": token, "token_type": "bearer"}


@app.post("/v1/devices/revoke")
async def revoke_device(authorization: str | None = Header(default=None)):
    token = get_bearer_token(authorization)
    revoke_device_token(token, TOKEN_DB_PATH)
    return {"revoked": True}


def synthesize_wav(text: str, speaker_id: int, speed: float) -> bytes:
    if _tts is None:
        raise RuntimeError("Speech model is not initialized.")
    generation = sherpa_onnx.GenerationConfig()
    generation.sid = speaker_id
    generation.speed = speed
    audio = _tts.generate(text, generation)
    if len(audio.samples) == 0:
        raise RuntimeError("Kokoro returned empty audio.")
    import io
    output = io.BytesIO()
    sf.write(output, audio.samples, samplerate=audio.sample_rate, format="WAV", subtype="PCM_16")
    return output.getvalue()


@app.post("/v1/audio/speech")
async def create_speech(request: SpeechRequest, authorization: str | None = Header(default=None)):
    get_bearer_token(authorization)
    try:
        payload = validate_synthesis_payload(request.model_dump())
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    if _tts is None:
        raise HTTPException(status_code=503, detail="Speech model is not ready.")

    try:
        async with _tts_lock:
            wav_bytes = await asyncio.to_thread(
                synthesize_wav,
                payload["text"],
                payload["speaker_id"],
                payload["speed"],
            )
    except Exception as error:
        raise HTTPException(status_code=500, detail="Speech synthesis failed.") from error

    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={
            "Cache-Control": "no-store",
            "X-Speech-Model": LOGICAL_MODEL_ID,
            "X-Speech-Speaker": str(payload["speaker_id"]),
        },
    )
