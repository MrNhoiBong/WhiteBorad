# Nhật ký thay đổi

## 2026-11-06

### Tài liệu
- `SKILL.md`: thêm cách Claude đưa file lên bảng thành thẻ và đóng yêu cầu tự sinh.
- `docs/architecture.md`: sửa mô tả cũ về địa chỉ nghe và loại thẻ của `/api/upload`.

## 2026-11-05

### Tính năng mới
- **Thẻ file văn bản (`codefile`):** tải lên file code hoặc văn bản đến 1 MB (`.py`, C/C++, `.md`, `.txt`, hoặc bất kỳ file UTF-8 nào) sẽ tạo thẻ hình chữ nhật có tên file và nút `+`/`−` để hiện hoặc che nội dung. Nội dung nằm trên đĩa, chỉ tải khi mở thẻ. File nhị phân hoặc lớn hơn 1 MB vẫn dùng thẻ 📎.

## 2026-10-31

### Thay đổi hành vi
- **Mỗi thư mục một bảng riêng hoàn toàn:** bỏ bảng chung `data/` và `.venv` trong thư mục skill. Mặc định `WB_DATA` là `./.whiteboard` của thư mục chạy lệnh; venv nằm ở `$WB_DATA/.venv`; `$WB_DATA/.gitignore` được tạo tự động.
- **Tự chọn cổng:** chưa có `--port` thì lấy cổng trống đầu tiên từ 8765 và lưu lại, để nhiều bảng chạy song song.
- `wb` chỉ coi server là đang chạy khi pid đã lưu của chính bảng đó còn sống, tránh gửi lệnh nhầm sang bảng của thư mục khác.

## 2026-10-29

### Thay đổi hành vi
- **Lăn chuột để zoom:** mỗi nấc lăn phóng to/thu nhỏ 10 điểm phần trăm quanh con trỏ (trước đây lăn chuột là kéo bảng, Ctrl+lăn mới zoom). Mức zoom tối thiểu giảm từ 15% xuống 10%.

## 2026-10-26

So với bản đầu tiên (`a3490a6`):

### Tính năng mới
- **Truy cập qua LAN:** `wb start --host 0.0.0.0` (mặc định vẫn là `127.0.0.1`).
- **Tải file lên:** nút tải lên trên thanh công cụ và kéo thả file vào bảng. File được lưu vào `WB_UPLOADS` (mặc định `$WB_DATA/uploads`), bảng hiện thẻ 📎 có nút "⬇ Tải về", và server tạo một yêu cầu để `wb wait` báo cho Claude kèm đường dẫn file.
  - API mới: `POST /api/upload`, `GET /api/files`, `GET /api/file/<tên>`.
  - Lệnh mới: `wb files`.
  - An toàn: tên file được làm sạch, trùng tên thì thêm ` (1)`, tối đa 512 MB, ghi qua file `.part` theo từng khối 1 MB, file trả về luôn là `attachment` + `nosniff`.
- **LaTeX trong SVG:** `$…$` trong `<text>` được render bằng MathJax thành `<svg>` lồng (có cache).
- Server gửi file tĩnh theo từng khối và nhận đúng URL UTF-8 chưa mã hoá `%`.

### Thay đổi hành vi
- Giao diện không còn gắn nhãn "✦ Claude" lên các mục trên bảng.

### Quy tắc trong SKILL.md
- Không để chữ "Claude" trên hình; lý thuyết ghi vào chat, bảng chỉ dùng để vẽ; chỉ vẽ khi người dùng yêu cầu hoặc khi thật sự cần.
- Hướng dẫn mở LAN, `WB_UPLOADS`, `wb files`, và chạy script Python trong venv.
