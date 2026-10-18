"""Engine VieNeu-TTS (ONNX, .venv) cho daemon.py."""

from __future__ import annotations

import os
import time


def load(state, log) -> None:
    from vieneu import Vieneu

    log("đang nạp model VieNeu-TTS...")
    started = time.time()
    state.tts = Vieneu()
    log(f"nạp model xong sau {time.time() - started:.1f}s")

    voices = state.tts.list_preset_voices()
    state.voices = [[str(label), str(voice_id)] for label, voice_id in voices]
    if not state.voice and state.voices:
        state.voice = state.voices[0][1]


def synthesize(state, text: str, log) -> tuple[str, int]:
    assert state.tts is not None
    try:
        audio = state.tts.infer(text, voice=state.voice or None)
    except Exception as error:
        if state.voice:
            log(f"giọng '{state.voice}' lỗi ({error}); thử lại bằng giọng mặc định")
            state.voice = ""
            audio = state.tts.infer(text)
        else:
            raise
    path = os.path.join(state.tmpdir, f"speech-{int(time.time() * 1000)}.wav")
    state.tts.save(audio, path)
    return path, 48000
