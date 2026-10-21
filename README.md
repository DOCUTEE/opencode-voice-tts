# opencode-voice-tts

Plugin OpenCode đọc **tóm tắt** câu trả lời bằng **giọng tiếng Việt tự nhiên**,
kèm phần cài đặt **nhập bằng giọng nói** (Handy + Whisper).

- Engine đọc: **VieNeu-TTS** (nhanh, 48 kHz, 25 giọng) và **OmniVoice** (MLX, giọng thiết kế + clone vùng miền)
- Nhập liệu: **Handy** + Whisper large-v3-turbo, ngôn ngữ cố định `vi`, từ vựng kỹ thuật
- Tất cả chạy **offline** trên máy, không gửi dữ liệu đi đâu

## Cài đặt

Repo công khai — cài bằng một lệnh, không cần đăng nhập GitHub:

```bash
opencode plugin add github:DOCUTEE/opencode-voice-tts

# Cách 2: khai báo trong ~/.config/opencode/opencode.jsonc
{
  "plugins": ["github:DOCUTEE/opencode-voice-tts"]
}
```

Sau đó mở OpenCode và gõ:

```
/tts-setup                # cài runtime Python (VieNeu + OmniVoice) + Handy
/tts-setup --with-8bit    # thêm model OmniVoice 8-bit (nhẹ, nhanh hơn)
/tts-setup --warm         # tải trước model và phát thử giọng
```

Lần cuối, cấp quyền **Microphone + Accessibility** cho Handy trong
System Settings → Privacy & Security.

## Sử dụng

| Lệnh | Tác dụng |
| --- | --- |
| `/tts` | Bật/tắt đọc tự động |
| `/tts-stop` | Dừng câu đang đọc |
| `/tts-summary on\|off` | Tắt/bật tóm tắt trước khi đọc |
| `/tts-prefix [câu\|off]` | Đổi/tắt câu mở đầu trước phần tóm tắt |
| `/tts-engine omnivoice\|vieneu\|say` | Chọn engine |
| `/tts-voice [tên]` | Chọn giọng (không tên = xem danh sách) |
| `/tts-rate <80-400>` | Tốc độ cho engine `say` |
| `/tts-setup` | Cài/cập nhật runtime |

**Nhập bằng giọng nói:** giữ `Option + Space`, nói, thả ra — chữ tự dán vào ô prompt
(huỷ bằng `Option + Escape`).

Giọng OmniVoice (clone vùng miền): `clone:nam-nam` (Nam · Nam, mặc định), `clone:nu-nam`,
`clone:nam-trung`, `clone:nu-trung`, `clone:nam-bac`, `clone:nu-bac`;
thiết kế sẵn: `design:nu-tre`, `design:nam-tram`, `design:nu-am`, `design:nam-tre`.

## Kiến trúc

```
src/index.ts              plugin OpenCode (server runtime)
src/speech.ts             ghép câu mở đầu + đọc câu hỏi của form
python/daemon.py          daemon TTS dùng chung, singleton qua Unix socket
python/engine_vieneu.py   engine VieNeu (ONNX)
python/engine_omnivoice.py engine OmniVoice (MLX) + clone giọng mẫu
python/refs/              6 clip giọng mẫu vùng miền
scripts/setup.sh          cài runtime vào ~/.local/share/opencode-voice-tts
scripts/setup_handy.sh    áp cấu hình Handy tối ưu tiếng Việt
```

Runtime (venv, model, log, socket) nằm ngoài package tại
`~/.local/share/opencode-voice-tts` (đổi bằng biến môi trường `VOICE_TTS_HOME`),
nên nâng cấp plugin không mất dữ liệu.

## Giấy phép

Mã nguồn: MIT. Model tải về có giấy phép riêng: VieNeu-TTS (Apache 2.0 phần code),
OmniVoice base (CC-BY-NC — dùng cá nhân/phi thương mại), Whisper (MIT).
