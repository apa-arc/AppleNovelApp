#!/usr/bin/env sh
set -eu

MODEL_DIR="${KOKORO_MODEL_DIR:-/models/kokoro}"
ARCHIVE_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-multi-lang-v1_1.tar.bz2"
EXPECTED_SHA256="259c9c8bc906d6078e4e0570421885dabb68b539c2f970fcbb890a58eeaf3e9c"
mkdir -p "$MODEL_DIR"

if find "$MODEL_DIR" -type f \( -name model.int8.onnx -o -name model.onnx \) -print -quit | grep -q .; then
  if python -c "from server.tts_core import find_model_assets; find_model_assets('$MODEL_DIR')" >/dev/null 2>&1; then
    echo "Verified Kokoro model assets already exist in $MODEL_DIR"
    exit 0
  fi
  echo "Existing Kokoro model directory is incomplete; replacing it."
  find "$MODEL_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
fi

ARCHIVE="/tmp/kokoro-int8-multi-lang-v1_1.tar.bz2"
echo "Downloading Kokoro int8 model archive (~147 MB)..."
curl --fail --location --retry 3 --retry-delay 2 --retry-all-errors "$ARCHIVE_URL" --output "$ARCHIVE"
echo "$EXPECTED_SHA256  $ARCHIVE" | sha256sum --check --status || {
  echo "Kokoro model archive SHA-256 verification failed." >&2
  rm -f "$ARCHIVE"
  exit 1
}
tar -xjf "$ARCHIVE" -C "$MODEL_DIR"
rm -f "$ARCHIVE"

find "$MODEL_DIR" -type f \( -name model.int8.onnx -o -name model.onnx \) -print -quit | grep -q . || {
  echo "Archive extraction completed but model.onnx was not found." >&2
  exit 1
}
python -c "from server.tts_core import find_model_assets; find_model_assets('$MODEL_DIR')"
echo "Kokoro model assets are ready and verified."
