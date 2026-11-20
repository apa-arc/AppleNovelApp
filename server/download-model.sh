#!/usr/bin/env sh
set -eu

MODEL_DIR="${KOKORO_MODEL_DIR:-/models/kokoro}"
ARCHIVE_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-multi-lang-v1_1.tar.bz2"
mkdir -p "$MODEL_DIR"

if find "$MODEL_DIR" -type f \( -name model.int8.onnx -o -name model.onnx \) -print -quit | grep -q .; then
  echo "Kokoro model already exists in $MODEL_DIR"
  exit 0
fi

ARCHIVE="/tmp/kokoro-int8-multi-lang-v1_1.tar.bz2"
echo "Downloading Kokoro int8 model archive (~147 MB)..."
curl --fail --location --retry 3 --retry-delay 2 "$ARCHIVE_URL" --output "$ARCHIVE"
tar -xjf "$ARCHIVE" -C "$MODEL_DIR"
rm -f "$ARCHIVE"

find "$MODEL_DIR" -type f \( -name model.int8.onnx -o -name model.onnx \) -print -quit | grep -q . || {
  echo "Archive extraction completed but model.onnx was not found." >&2
  exit 1
}
echo "Kokoro model assets are ready."
