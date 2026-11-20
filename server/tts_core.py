from pathlib import Path
from typing import Any

LOGICAL_MODEL_ID = "kokoro-multi-lang-v1_1"
MAX_TEXT_LENGTH = 420
MIN_SPEED = 0.5
MAX_SPEED = 2.0
SPEAKER_COUNT = 103


def validate_synthesis_payload(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("model", LOGICAL_MODEL_ID) != LOGICAL_MODEL_ID:
        raise ValueError("Unsupported speech model.")
    text = payload.get("text")
    if not isinstance(text, str):
        raise ValueError("Text must be a string.")
    text = text.strip()
    if not text:
        raise ValueError("Text cannot be empty.")
    if len(text) > MAX_TEXT_LENGTH:
        raise ValueError(f"Text exceeds {MAX_TEXT_LENGTH} characters.")
    speaker_id = payload.get("speaker_id")
    if isinstance(speaker_id, bool) or not isinstance(speaker_id, int) or not 0 <= speaker_id < SPEAKER_COUNT:
        raise ValueError("speaker_id must be between 0 and 102.")
    speed = payload.get("speed", 1.0)
    if isinstance(speed, bool) or not isinstance(speed, (int, float)) or not MIN_SPEED <= float(speed) <= MAX_SPEED:
        raise ValueError("speed must be between 0.5 and 2.0.")
    return {
        "model": LOGICAL_MODEL_ID,
        "text": text,
        "speaker_id": speaker_id,
        "speed": float(speed),
    }


def find_model_assets(root: str | Path) -> dict[str, str]:
    base = Path(root)
    if not base.exists():
        raise FileNotFoundError(f"Model directory does not exist: {base}")

    def find_file(*names: str) -> Path:
        for name in names:
            matches = sorted(base.rglob(name))
            if matches:
                return matches[0]
        raise FileNotFoundError(f"Missing Kokoro model asset: one of {', '.join(names)}")

    model = find_file("model.int8.onnx", "model.onnx", "kokoro.onnx")
    voices = find_file("voices.bin")
    tokens = find_file("tokens.txt")
    espeak_dirs = sorted(path for path in base.rglob("espeak-ng-data") if path.is_dir())
    if not espeak_dirs:
        raise FileNotFoundError("Missing Kokoro espeak-ng-data directory")

    dict_dirs = sorted(path for path in base.rglob("dict") if path.is_dir())
    if not dict_dirs:
        raise FileNotFoundError("Missing Chinese Kokoro dictionary directory")
    lexicons = []
    for name in ("lexicon-zh.txt", "lexicon-us-en.txt"):
        matches = sorted(base.rglob(name))
        if matches:
            lexicons.append(str(matches[0]))
    if len(lexicons) < 2:
        raise FileNotFoundError("Missing Chinese and English Kokoro lexicons")

    rule_fsts = []
    for name in ("phone-zh.fst", "date-zh.fst", "number-zh.fst"):
        matches = sorted(base.rglob(name))
        if matches:
            rule_fsts.append(str(matches[0]))
    if len(rule_fsts) < 3:
        raise FileNotFoundError("Missing Chinese phone/date/number rule FST files")

    return {
        "model": str(model),
        "voices": str(voices),
        "tokens": str(tokens),
        "data_dir": str(espeak_dirs[0]),
        "dict_dir": str(dict_dirs[0]) if dict_dirs else "",
        "lexicon": ",".join(lexicons),
        "rule_fsts": ",".join(rule_fsts),
    }
