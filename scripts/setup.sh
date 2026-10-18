#!/usr/bin/env bash
# Cài runtime giọng đọc cho plugin opencode-voice-tts.
# Chạy tự động khi bạn gõ /tts-setup trong OpenCode, hoặc chạy tay:
#   bash scripts/setup.sh [--with-8bit] [--warm] [--no-handy]
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "$HERE/.." && pwd)"
PY_DIR="$PKG_ROOT/python"
RUNTIME="${VOICE_TTS_HOME:-$HOME/.local/share/opencode-voice-tts}"
WITH_8BIT=0
WARM=0
INSTALL_HANDY=1

for arg in "$@"; do
  case "$arg" in
    --with-8bit) WITH_8BIT=1 ;;
    --warm) WARM=1 ;;
    --no-handy) INSTALL_HANDY=0 ;;
    *) echo "Cờ không hỗ trợ: $arg" >&2; exit 1 ;;
  esac
done

say() { printf '\n==> %s\n' "$*"; }
warn() { printf '[!] %s\n' "$*"; }

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Plugin này chỉ hỗ trợ macOS." >&2
  exit 1
fi

command -v uv >/dev/null 2>&1 || {
  echo "Thiếu 'uv' (trình quản lý môi trường Python)." >&2
  echo "Cài bằng: brew install uv" >&2
  exit 1
}

say "Runtime: $RUNTIME"
mkdir -p "$RUNTIME/refs" "$RUNTIME/logs"

say "Môi trường VieNeu (venv-vieneu)"
[[ -x "$RUNTIME/venv-vieneu/bin/python" ]] || uv venv --python 3.12 "$RUNTIME/venv-vieneu"
uv pip install --python "$RUNTIME/venv-vieneu/bin/python" vieneu sounddevice >/dev/null
echo "  xong"

say "Môi trường OmniVoice (venv-mlx)"
[[ -x "$RUNTIME/venv-mlx/bin/python" ]] || uv venv --python 3.12 "$RUNTIME/venv-mlx"
uv pip install --python "$RUNTIME/venv-mlx/bin/python" mlx-audio >/dev/null
echo "  xong"

if [[ ! -s "$RUNTIME/refs/presets.json" ]]; then
  say "Chuẩn bị clip giọng mẫu"
  if compgen -G "$PY_DIR/refs/*.wav" >/dev/null; then
    cp "$PY_DIR/refs/"*.wav "$PY_DIR/refs/presets.json" "$RUNTIME/refs/"
    echo "  đã sao chép từ bộ cài"
  else
    VOICE_TTS_HOME="$RUNTIME" "$RUNTIME/venv-vieneu/bin/python" "$PY_DIR/make_refs.py"
  fi
fi

if [[ "$WITH_8BIT" == "1" && ! -d "$RUNTIME/models/OmniVoice-8bit" ]]; then
  say "Tạo model OmniVoice 8-bit (~1 GB, vài phút)"
  mkdir -p "$RUNTIME/models"
  "$RUNTIME/venv-mlx/bin/python" -m mlx_audio.convert \
    --hf-path mlx-community/OmniVoice-bf16 \
    --mlx-path "$RUNTIME/models/OmniVoice-8bit" \
    --quantize --q-bits 8 | tail -2
fi

if [[ "$WARM" == "1" ]]; then
  say "Chạy thử VieNeu"
  VOICE_TTS_HOME="$RUNTIME" "$RUNTIME/venv-vieneu/bin/python" - <<'PY'
from vieneu import Vieneu
import subprocess, time
t0 = time.time()
tts = Vieneu()
path = "/tmp/voice-tts-warm.wav"
tts.save(tts.infer("Cài đặt thành công. Đây là giọng đọc tiếng Việt.", voice="Thái Sơn"), path)
print(f"  VieNeu sẵn sàng sau {time.time() - t0:.1f}s")
subprocess.run(["afplay", path], check=False)
PY

  say "Chạy thử OmniVoice"
  VOICE_TTS_HOME="$RUNTIME" "$RUNTIME/venv-mlx/bin/python" - <<'PY'
import os, subprocess, time
from mlx_audio.audio_io import write as audio_write
from mlx_audio.tts.utils import load_model
import numpy as np
local = os.path.join(os.environ["VOICE_TTS_HOME"], "models", "OmniVoice-8bit")
model = load_model(local if os.path.isdir(local) else "mlx-community/OmniVoice-bf16")
t0 = time.time()
result = list(model.generate(text="OmniVoice sẵn sàng.", language="vietnamese", instruct="male, middle-aged, low pitch"))[0]
path = "/tmp/voice-tts-warm-mlx.wav"
audio_write(path, np.array(result.audio), result.sample_rate)
print(f"  OmniVoice sẵn sàng sau {time.time() - t0:.1f}s")
subprocess.run(["afplay", path], check=False)
PY
fi

if [[ "$INSTALL_HANDY" == "1" ]]; then
  say "Handy (nhập bằng giọng nói)"
  if [[ ! -d /Applications/Handy.app ]]; then
    if command -v brew >/dev/null 2>&1; then
      brew install --cask handy
    else
      warn "Chưa có Homebrew — tải Handy tại https://handy.computer"
    fi
  fi
  if [[ -d /Applications/Handy.app ]]; then
    bash "$HERE/setup_handy.sh" | tail -12
  fi
fi

say "Khởi động lại OpenCode"
opencode service restart >/dev/null 2>&1 || warn "Chạy tay: opencode service restart"

cat <<'EOF'

============================================================
XONG. Còn 2 việc làm tay (chỉ lần đầu):

1. Cấp quyền: System Settings → Privacy & Security →
   • Microphone    → bật Handy
   • Accessibility → bật Handy

2. Nói thử: giữ Option + Space, nói, thả ra.
   Chữ tự dán vào ô prompt OpenCode.

Lệnh trong OpenCode: /tts, /tts-stop, /tts-voice, /tts-engine
============================================================
EOF
