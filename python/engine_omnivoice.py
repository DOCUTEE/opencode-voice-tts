"""Engine OmniVoice (MLX, .venv-mlx) cho daemon.py.

Giọng gồm hai loại:
  - clone:<slug>  — clone từ clip mẫu trong refs/ (giọng vùng miền)
  - design:<slug>  — thiết kế sẵn bằng thuộc tính (nam/nữ, tuổi, cao độ)
"""

from __future__ import annotations

import json
import os
import time

HERE = os.path.dirname(os.path.abspath(__file__))
RUNTIME = os.environ.get("VOICE_TTS_HOME") or HERE
REFS_DIR = os.path.join(RUNTIME, "refs")
if not os.path.isdir(REFS_DIR):
    REFS_DIR = os.path.join(HERE, "refs")
REFS_JSON = os.path.join(REFS_DIR, "presets.json")


def _default_model() -> str:
    override = os.environ.get("OMNIVOICE_MODEL")
    if override:
        return override
    for base in (RUNTIME, HERE):
        local_8bit = os.path.join(base, "models", "OmniVoice-8bit")
        if os.path.isdir(local_8bit):
            return local_8bit
    return "mlx-community/OmniVoice-bf16"


MODEL = _default_model()
NUM_STEPS = int(os.environ.get("OMNIVOICE_STEPS", "0") or 0)
LANGUAGE = "vietnamese"

DESIGN_PRESETS = {
    "design:nu-tre": ("Nữ trẻ · giọng thiết kế", "female, young adult, moderate pitch"),
    "design:nam-tram": ("Nam trung niên · giọng thiết kế", "male, middle-aged, low pitch"),
    "design:nu-am": ("Nữ · giọng ấm", "female, middle-aged, low pitch"),
    "design:nam-tre": ("Nam trẻ · giọng thiết kế", "male, young adult, moderate pitch"),
}


def _voice_list(state) -> list[list[str]]:
    voices: list[list[str]] = []
    for slug, entry in state.clone_refs.items():
        voices.append([f"{entry['label']} (clone)", f"clone:{slug}"])
    for voice_id, (label, _) in DESIGN_PRESETS.items():
        voices.append([label, voice_id])
    return voices


def load(state, log) -> None:
    from mlx_audio.tts.models.omnivoice.utils import create_voice_clone_prompt
    from mlx_audio.tts.utils import load_model

    log(f"đang nạp model OmniVoice {MODEL}...")
    started = time.time()
    state.tts = load_model(MODEL)
    log(f"nạp model xong sau {time.time() - started:.1f}s")

    state.clone_refs = {}
    if os.path.exists(REFS_JSON):
        with open(REFS_JSON, encoding="utf-8") as handle:
            presets = json.load(handle)
        tokenizer = getattr(state.tts, "audio_tokenizer", None)
        for slug, entry in presets.items():
            path = os.path.join(REFS_DIR, f"{slug}.wav")
            if not os.path.exists(path):
                legacy = entry.get("path")
                if legacy and os.path.exists(legacy):
                    path = legacy
                else:
                    continue
            try:
                tokens = create_voice_clone_prompt(path, tokenizer=tokenizer)
                import mlx.core as mx

                mx.eval(tokens)
                state.clone_refs[slug] = {
                    "label": entry.get("label", slug),
                    "ref_text": entry.get("ref_text", ""),
                    "tokens": tokens,
                }
                log(f"nạp giọng mẫu {slug} ({entry.get('label', slug)})")
            except Exception as error:
                log(f"bỏ qua giọng mẫu {slug}: {error}")

    state.voices = _voice_list(state)
    if not state.voice and state.voices:
        state.voice = state.voices[0][1]


def _generate(state, text: str, voice: str):
    extra = {"num_steps": NUM_STEPS} if NUM_STEPS > 0 else {}
    results = None
    if voice.startswith("clone:"):
        slug = voice.split(":", 1)[1]
        entry = state.clone_refs.get(slug)
        if entry is None:
            raise ValueError(f"không có giọng mẫu '{slug}'")
        results = list(
            state.tts.generate(
                text=text,
                language=LANGUAGE,
                ref_tokens=entry["tokens"],
                ref_text=entry["ref_text"],
                **extra,
            )
        )
    else:
        preset = DESIGN_PRESETS.get(voice)
        if preset is None:
            raise ValueError(f"không có giọng '{voice}'")
        results = list(state.tts.generate(text=text, language=LANGUAGE, instruct=preset[1], **extra))
    if not results:
        raise RuntimeError("model không trả về audio")
    return results[0]


def synthesize(state, text: str, log) -> tuple[str, int]:
    from mlx_audio.audio_io import write as audio_write
    import numpy as np

    try:
        result = _generate(state, text, state.voice)
    except Exception as error:
        if state.voice and state.voices:
            log(f"giọng '{state.voice}' lỗi ({error}); thử lại bằng giọng mặc định")
            state.voice = state.voices[0][1]
            result = _generate(state, text, state.voice)
        else:
            raise
    path = os.path.join(state.tmpdir, f"speech-{int(time.time() * 1000)}.wav")
    audio_write(path, np.array(result.audio), result.sample_rate)
    return path, int(result.sample_rate)
