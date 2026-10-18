#!/usr/bin/env bash
# Áp cấu hình Handy tối ưu cho tiếng Việt (nhập bằng giọng nói).
#
#   bash setup_handy.sh              # chỉ áp cấu hình
#   bash setup_handy.sh --with-model # tải trước model Whisper 1.5 GB
set -euo pipefail

SUPPORT="$HOME/Library/Application Support/com.pais.handy"
SETTINGS="$SUPPORT/settings_store.json"
MODEL="$SUPPORT/models/ggml-large-v3-turbo.bin"
WITH_MODEL=0
[[ "${1:-}" == "--with-model" ]] && WITH_MODEL=1

if [[ ! -d /Applications/Handy.app ]]; then
  echo "Chưa cài Handy. Cài bằng: brew install --cask handy" >&2
  exit 1
fi

if [[ "$WITH_MODEL" == "1" && ! -s "$MODEL" ]]; then
  echo "==> Tải model Whisper large-v3-turbo (~1.5 GB)"
  mkdir -p "$SUPPORT/models"
  curl -L --fail -o "$MODEL.part" https://blob.handy.computer/ggml-large-v3-turbo.bin
  mv "$MODEL.part" "$MODEL"
fi

echo "==> Đóng Handy để áp cấu hình"
osascript -e 'tell application "Handy" to quit' 2>/dev/null || true
for _ in $(seq 1 20); do
  pgrep -f "Handy.app/Contents/MacOS/handy" >/dev/null || break
  sleep 0.5
done

echo "==> Ghi cấu hình"
python3 - "$SETTINGS" <<'PY'
import json, pathlib, shutil, sys, time

path = pathlib.Path(sys.argv[1])
if path.exists():
    backup = path.with_suffix(f".bak-{time.strftime('%Y%m%d%H%M%S')}")
    shutil.copy2(path, backup)
    data = json.loads(path.read_text())
else:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = {"settings": {}}

settings = data.setdefault("settings", {})
default_words = [
    "OpenCode", "opencode", "plugin", "prompt", "commit", "build", "API", "TUI",
    "refactor", "agent", "terminal", "macOS", "daemon", "socket", "Whisper",
    "OmniVoice", "VieNeu", "MLX", "mặc định", "nhận dạng", "chính xác", "vùng miền",
    "thiết kế", "giọng nam", "giọng nữ", "8-bit", "bản 8 bit", "text sang speech",
    "micro", "loa", "âm thanh", "dán chữ", "ghi âm", "từ vựng",
    "neslie", "scraper", "smartstore", "naver", "proxy", "schema", "jsonl",
]
existing_words = settings.get("custom_words") or []
merged_words = list(dict.fromkeys(list(existing_words) + default_words))

settings.update({
    "onboarding_completed": True,
    "selected_model": "turbo",
    "selected_language": "vi",
    "translate_to_english": False,
    "extra_recording_buffer_ms": 250,
    "vad_enabled": True,
    "vad_backend": "silero",
    "filler_word_removal_enabled": True,
    "shortcut_activation": "push_to_talk",
    "auto_submit": False,
    "audio_feedback": True,
    "autostart_enabled": True,
    "reliable_paste": False,
    "custom_words": merged_words,
})

bindings = settings.setdefault("bindings", {})
transcribe = bindings.setdefault("transcribe", {})
transcribe.setdefault("id", "transcribe")
transcribe.setdefault("name", "Transcribe")
transcribe.setdefault("description", "Converts your speech into text.")
transcribe["default_binding"] = "option+space"
transcribe["current_binding"] = "option+space"

cancel = bindings.setdefault("cancel", {})
cancel.setdefault("id", "cancel")
cancel.setdefault("name", "Cancel")
cancel.setdefault("description", "Cancels the current recording.")
cancel["default_binding"] = "escape"
cancel["current_binding"] = "option+escape"

path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
print("  đã ghi:", path)
PY

echo "==> Mở lại Handy"
open -a "/Applications/Handy.app"
sleep 3

cat <<'EOF'

Đã áp cấu hình Handy:
  • Model      : Whisper large-v3-turbo (tự tải khi dùng lần đầu)
  • Ngôn ngữ   : cố định tiếng Việt
  • Phím nói   : giữ Option + Space (thả ra là dán chữ)
  • Huỷ        : Option + Escape
  • Từ vựng    : ~35 từ kỹ thuật, sẽ nạp khi mở app
  • Tự chạy khi mở máy: bật

Nhớ cấp quyền cho Handy nếu máy mới:
  System Settings → Privacy & Security → Microphone + Accessibility
EOF
