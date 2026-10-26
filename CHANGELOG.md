# Nhật ký thay đổi

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
