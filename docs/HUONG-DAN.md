# Hướng dẫn dùng OpenCode bằng giọng nói

Tài liệu này hướng dẫn cách **nói để ra lệnh cho OpenCode** và **nghe OpenCode trả lời**
bằng giọng tiếng Việt tự nhiên, hoàn toàn trên máy của bạn (offline, không gửi dữ liệu đi đâu).

Cập nhật lần cuối: 18/10/2026

---

## 1. Tổng quan

```
  Bạn nói                   Handy                        OpenCode TUI
 ┌──────────┐   giữ phím   ┌───────────────┐   dán chữ   ┌──────────────┐
 │  Giọng   │ ───────────▶ │ Whisper       │ ──────────▶ │ ô nhập prompt│
 │  nói     │  Option+Space│ large-v3-turbo│             │  (bạn Enter) │
 └──────────┘              └───────────────┘             └──────┬───────┘
                                                                 │
                        ┌────────────────────────────┐           │ trả lời xong
                        │  voice-tts plugin          │ ◀─────────┘
                        │  tóm tắt 1–2 câu           │
                        │  VieNeu-TTS đọc to         │────▶ 🔊 loa
                        └────────────────────────────┘
```

Chỉ có **2 thao tác cần nhớ**:

1. **Giữ `Option` + `Space`** để nói, **thả ra** để chuyển thành chữ.
2. Nghe tóm tắt tự động — hoặc gõ `/tts-stop` nếu muốn dừng đọc.

---

## 2. Nói để nhập prompt (Handy)

### Thao tác cơ bản

| Bước | Việc làm |
| --- | --- |
| 1 | Nhấp vào **ô nhập prompt** của OpenCode (con trỏ phải nằm trong khung chat) |
| 2 | **Giữ `Option` (Alt) + `Space`** — nghe tiếng "tinh" là bắt đầu ghi âm |
| 3 | Nói bình thường, tốc độ tự nhiên |
| 4 | **Thả phím** — đợi 1–3 giây, chữ tự dán vào prompt |
| 5 | Xem lại, sửa nếu cần rồi nhấn **Enter** để gửi |

- Chữ được **dán vào đúng ô đang focus**, mà chỉ cần focus đúng chỗ, không cần bấm gì khác.
- Bấm `Option + Escape` nếu lỡ ghi âm và muốn **huỷ** (không dán gì).

### Lần đầu sử dụng

- Lần ghi âm đầu tiên macOS sẽ hỏi **quyền Micro** → bấm **Allow**.
- Nếu Handy hỏi **Accessibility** (để dán chữ) → mở System Settings và bật cho Handy.

### Mẹo nói cho chính xác

- **Nói như đang giao việc**, không cần câu lệnh kỹ thuật:
  > "Giúp tôi thêm kiểm tra cho hàm xử lý thanh toán, nhớ kiểm tra trường hợp số tiền âm."
- **Nói rõ tên file/dự án** nếu có: "trong file api, sửa hàm đăng nhập…".
- **Không cần đánh vần**: cứ nói tự nhiên; các thuật ngữ như *API, commit, build, test, prompt, OpenCode* đã được thêm vào từ vựng riêng của Handy.
- **Tránh** đọc ký tự đặc biệt, đường dẫn dài, đoạn code — cái đó nên gõ tay hoặc để OpenCode tự viết.

### Đổi phím nói / cài đặt Handy

Mở Handy (biểu tượng trên thanh menu) → **Settings**:

| Mục | Giá trị hiện tại | Ghi chú |
| --- | --- | --- |
| Shortcut → Transcribe | `Option + Space` | Có thể đổi sang phím khác |
| Chế độ | **Giữ để nói** (push-to-talk) | Thả là kết thúc, không cần bấm thêm |
| Model | Whisper Large v3 Turbo | Tự nhận diện ngôn ngữ (Việt + Anh) |
| Language | Auto | |
| Auto-submit | Tắt | Để bạn xem lại trước khi Enter |
| Reliable paste | Tắt | Bật lên nếu chữ không dán được vào terminal |
| Start at login | Bật | Handy tự chạy khi mở máy |

---

## 3. Nghe OpenCode trả lời (voice-tts)

### Cơ chế

Khi phiên chạy xong, plugin sẽ:

1. Lấy câu trả lời cuối cùng của OpenCode.
2. Nếu nội dung dài: gọi model của phiên để **tóm tắt tối đa 2 câu tiếng Việt**
   (chỉ kết quả chính, bỏ code/đường dẫn/bảng).
3. Đọc to bằng **VieNeu-TTS** (48 kHz, offline). Câu ngắn dưới 300 ký tự thì đọc nguyên văn.

Plugin cũng tự đọc khi OpenCode **xin quyền** hoặc **đặt câu hỏi cần bạn trả lời**
(chỉ đọc câu hỏi đầu tiên, kèm các lựa chọn của câu đó).

### Các lệnh điều khiển (gõ trong khung chat)

| Lệnh | Tác dụng |
| --- | --- |
| `/tts` | Bật/tắt đọc tự động |
| `/tts on` · `/tts off` | Bật hoặc tắt tường minh |
| `/tts status` | Xem trạng thái (engine, giọng, tóm tắt, câu mở đầu) |
| `/tts-stop` | **Dừng câu đang đọc** ngay lập tức |
| `/tts-summary on` · `off` | Bật/tắt tóm tắt trước khi đọc |
| `/tts-prefix [câu]` · `off` | Đổi/tắt câu mở đầu trước phần tóm tắt |
| `/tts-engine omnivoice` · `vieneu` · `say` | Đổi engine đọc (xem mục 4) |
| `/tts-voice [tên]` | Đổi giọng; gõ trống để xem danh sách |
| `/tts-rate 190` | Tốc độ đọc cho engine `say` (80–400) |

Câu mở đầu mặc định là *"Dạ anh Quang, nãy giờ em làm như thế này:"*; đổi bằng
`/tts-prefix <câu mới>`, tắt bằng `/tts-prefix off`.

### Danh sách giọng VieNeu (25 giọng)

Đổi bằng: `/tts-voice <tên>`, ví dụ `/tts-voice Mai Anh`

**Miền Bắc – tự nhiên (khuyên dùng hằng ngày)**
`Ngọc Huyền` (nữ, mặc định) · `Adam bựa` (nam) · `Trúc Ly` (nữ) ·
`Hải Đăng` (nam) · `Phạm Tuyên` (nam) · `Xuân Vĩnh` (nam) · `Đoan Trang` (nữ) ·
`Quốc Tuấn` (nam)

**Phong cách kể chuyện**
`Thiện Minh` · `Thiền Tâm Đức` · `Thanh Bình` · `Ngọc Linh` (nữ)

**Phong cách tin tức**
`Mai Anh` (nữ) · `Minh Đức` (nam)

**Miền Nam**
`Thùy Dung` (nữ) · `Thái Sơn` (nam) · `Thục Đoan` (nữ) · `Minh Triết` (nam) ·
`Mỹ Duyên` (nữ) · `Đức Trí` (nam) · `Kim Thanh` (nữ) · `Adam` (nam)

**Miền Trung**
`Quang Sơn` (nam) · `Ngọc Trân` (nữ)

**Đọc truyện**
`Quỳnh Anh` (nữ)

### Tắt / bật nhanh

- Muốn im lặng tạm thời: `/tts off`
- Muốn dừng đúng câu đang đọc: `/tts-stop`
- Muốn đọc lại nội dung dài: `/tts-summary off` để đọc nguyên văn (bỏ code).

---

## 4. Các engine đọc

| Engine | Chất lượng | Tốc độ | Khi nào dùng |
| --- | --- | --- | --- |
| `omnivoice` (mặc định) | Rất tự nhiên, 24 kHz, clone được giọng vùng miền | ~2–3 giây cho câu 4–8 giây (bản 8-bit) | Dùng hằng ngày |
| `vieneu` | Tự nhiên, 48 kHz, 25 giọng dựng sẵn | ~0,7–1,5 giây cho câu ngắn | Khi cần nhanh hơn |
| `say` | Giọng macOS (Linh) | Nhanh, nhẹ | Dự phòng khi hai engine kia bận/lỗi |

Plugin tự chuyển sang `say` cho câu đó nếu engine chính chưa nạp xong, rồi quay lại engine chính.
Đổi bằng: `/tts-engine omnivoice` · `/tts-engine vieneu` · `/tts-engine say`.

### Giọng của OmniVoice (mặc định: Nam · Miền Nam)

**Giọng clone theo vùng miền** — đổi bằng `/tts-voice <id>`:

| ID | Giọng | Nguồn |
| --- | --- | --- |
| `clone:nam-nam` | **Nam · Miền Nam** (mặc định) | clone từ "Thái Sơn" |
| `clone:nu-nam` | Nữ · Miền Nam | clone từ "Thùy Dung" |
| `clone:nam-trung` | Nam · Miền Trung | clone từ "Quang Sơn" |
| `clone:nu-trung` | Nữ · Miền Trung | clone từ "Ngọc Trân" |
| `clone:nam-bac` | Nam · Miền Bắc | clone từ "Hải Đăng" |
| `clone:nu-bac` | Nữ · Miền Bắc | clone từ "Ngọc Huyền" |

**Giọng thiết kế sẵn** (không cần clip mẫu):

| ID | Giọng |
| --- | --- |
| `design:nu-tre` | Nữ trẻ, Bắc |
| `design:nam-tram` | Nam trung niên, trầm |
| `design:nu-am` | Nữ, giọng ấm |
| `design:nam-tre` | Nam trẻ |

Muốn thêm giọng mới: gửi tôi clip 5–15 giây của giọng bạn thích là tôi clone thành giọng mới.

---

## 5. Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
| --- | --- | --- |
| Giữ phím mà không thấy gì | Chưa có quyền micro, hoặc Handy không chạy | System Settings → Privacy & Security → Microphone → bật Handy; kiểm tra biểu tượng Handy trên thanh menu |
| Có chữ nhưng không dán vào prompt | Ô nhập chưa focus, hoặc cổng dán bị chặn | Nhấp vào ô nhập rồi thử lại; Handy Settings → bật **Reliable paste** |
| Chữ dán ra app khác | App đang focus không phải OpenCode | Nhấp vào khung chat OpenCode trước khi nói |
| Không nghe OpenCode đọc | Đang tắt, hoặc âm lượng | Gõ `/tts status`; nếu tắt thì `/tts on`; kiểm tra âm lượng macOS |
| Đọc chậm vài giây | Máy đang bận (nhiều phiên, build, Chrome…) | Bình thường; muốn nhanh thì `/tts-engine say` |
| Giọng đọc sai/không đúng tên | Tên giọng gõ sai | Gõ `/tts-voice` để xem danh sách đúng |
| Muốn dừng câu đang đọc | — | `/tts-stop` |
| Nghe thấy giọng đọc cũ sau khi đổi | Câu cũ đang phát dở | `/tts-stop` rồi thử lại |

### Xem log khi cần

```bash
# Log Handy (nhận dạng giọng nói)
tail -50 ~/Library/Logs/com.pais.handy/handy.log

# Log engine đọc VieNeu
tail -20 ~/.config/opencode/plugins/voice-tts/tts/daemon.log

# Log OpenCode
tail -50 ~/.local/share/opencode/log/opencode.log
```

---

## 6. Quản trị & cài lại

### Khởi động lại OpenCode

```bash
opencode service restart
```

### Cấu hình đang nằm ở đâu

| Thành phần | Đường dẫn |
| --- | --- |
| Plugin đọc | `~/.config/opencode/plugins/voice-tts/` |
| Engine VieNeu (Python) | `~/.config/opencode/plugins/voice-tts/tts/.venv` |
| Model Handy (1,5 GB) | `~/Library/Application Support/com.pais.handy/models/` |
| Cài đặt Handy | `~/Library/Application Support/com.pais.handy/settings_store.json` |

### Tắt tính năng

```bash
# Chỉ tắt đọc: gõ /tts off trong OpenCode
# Tắt Handy tạm thời: thoát app trên thanh menu
# Gỡ hoàn toàn plugin đọc:
rm -rf ~/.config/opencode/plugins/voice-tts
opencode service restart

# Gỡ Handy:
brew uninstall --cask handy
```

### Cài lại engine VieNeu (nếu cần)

```bash
cd ~/.config/opencode/plugins/voice-tts/tts
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python vieneu sounddevice
```

---

## 7. Mẹo dùng hằng ngày

- **Vừa nói vừa xem**: OpenCode không tự gửi khi bạn nói. Chữ nằm trong prompt để bạn kiểm tra —
  đây là lợi thế lớn khi ra lệnh quan trọng.
- **Nói nhiều ý trong một câu**: "Sửa lỗi đăng nhập, thêm test cho trường hợp sai mật khẩu, rồi commit."
- **Dùng giọng để trả lời câu hỏi**: khi OpenCode hỏi lại, chỉ cần nói câu trả lời ngắn
  ("đồng ý", "dùng phương án hai") rồi Enter.
- **Phiên dài**: giữ `/tts-summary on` để không phải nghe giải thích dài dòng.
- **Khi làm việc nhóm**: `/tts off` để khỏi làm phiền người xung quanh.

---

## 8. Cài trên máy mới (kiểu plugin chuẩn)

Plugin đã được đóng gói chuẩn và **công khai** tại:
**github.com/DOCUTEE/opencode-voice-tts**

Trên máy mới chỉ cần:

```bash
opencode plugin add github:DOCUTEE/opencode-voice-tts
```

Rồi mở OpenCode gõ `/tts-setup` — plugin tự cài runtime Python và cấu hình Handy tiếng Việt.
Tuỳ chọn: `/tts-setup --with-8bit` (thêm model nhẹ), `/tts-setup --warm` (tải trước + phát thử).

Cuối cùng cấp quyền **Microphone + Accessibility** cho Handy là xong.

Runtime (venv, model, log) nằm ở `~/.local/share/opencode-voice-tts`, tách khỏi plugin —
cập nhật plugin không mất dữ liệu. Cập nhật phiên bản mới: `opencode plugin update`.

---

*Tài liệu liên quan: `~/.config/opencode/plugins/voice-tts/README.md` (chi tiết kỹ thuật của plugin).*
