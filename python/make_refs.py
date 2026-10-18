#!/usr/bin/env python3
"""Tạo clip giọng mẫu (reference) bằng VieNeu để OmniVoice clone.

Kết quả: <VOICE_TTS_HOME>/refs/<tên>.wav + presets.json
Mặc định VOICE_TTS_HOME là thư mục chứa script này.
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
RUNTIME = os.environ.get("VOICE_TTS_HOME") or HERE
REFS = os.path.join(RUNTIME, "refs")

TEXT = (
    "Xin chào, tôi là trợ lý giọng nói của bạn. "
    "Tôi sẽ đọc tóm tắt kết quả công việc và những việc cần làm tiếp theo."
)

VOICES = [
    ("nu-bac", "Ngọc Huyền", "Nữ · Bắc"),
    ("nam-bac", "Hải Đăng", "Nam · Bắc"),
    ("nu-trung", "Ngọc Trân", "Nữ · Trung"),
    ("nam-trung", "Quang Sơn", "Nam · Trung"),
    ("nu-nam", "Thùy Dung", "Nữ · Nam"),
    ("nam-nam", "Thái Sơn", "Nam · Nam"),
]


def main() -> int:
    from vieneu import Vieneu

    os.makedirs(REFS, exist_ok=True)
    tts = Vieneu()
    presets = {}
    for slug, voice, label in VOICES:
        audio = tts.infer(TEXT, voice=voice)
        filename = f"{slug}.wav"
        path = os.path.join(REFS, filename)
        tts.save(audio, path)
        # Chỉ lưu tên file để bộ cài mang sang máy khác được
        presets[slug] = {"label": label, "vieneu_voice": voice, "path": filename, "ref_text": TEXT}
        print(f"{slug}: {voice} -> {path} ({len(audio) / 48000:.2f}s)", flush=True)

    with open(os.path.join(REFS, "presets.json"), "w", encoding="utf-8") as handle:
        json.dump(presets, handle, ensure_ascii=False, indent=2)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
