#!/bin/bash
# Idempotent whisper.cpp install for speaker-track transcription.
# Installs to /opt/whisper.cpp (binary + base.en model). Called from
# deploy.sh; safe to re-run -- exits fast once everything is in place.
set -euo pipefail

WH_DIR="${MP_WHISPER_DIR:-/opt/whisper.cpp}"
BIN="$WH_DIR/build/bin/whisper-cli"
MODEL="$WH_DIR/models/ggml-base.en.bin"

if [ -x "$BIN" ] && [ -f "$MODEL" ]; then
  echo "whisper: already installed ($BIN)"
  exit 0
fi

echo "whisper: installing to $WH_DIR ..."
command -v git >/dev/null || { echo "whisper: git missing; skipping"; exit 0; }
command -v cmake >/dev/null || apt-get install -y cmake >/dev/null 2>&1 || { echo "whisper: cmake missing; skipping"; exit 0; }

if [ ! -d "$WH_DIR/.git" ]; then
  git clone --depth 1 https://github.com/ggml-org/whisper.cpp "$WH_DIR"
fi

if [ ! -x "$BIN" ]; then
  cmake -B "$WH_DIR/build" -S "$WH_DIR" -DCMAKE_BUILD_TYPE=Release >/dev/null
  cmake --build "$WH_DIR/build" -j "$(nproc)" --config Release >/dev/null
fi

if [ ! -f "$MODEL" ]; then
  bash "$WH_DIR/models/download-ggml-model.sh" base.en "$WH_DIR/models"
fi

[ -x "$BIN" ] && [ -f "$MODEL" ] && echo "whisper: ready" || echo "whisper: install incomplete (transcription stays off)"
