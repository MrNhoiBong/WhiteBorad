# WhiteBorad — Giấy nháp Claude

Bảng trắng local làm **giấy nháp chung giữa bạn và [Claude Code](https://claude.com/claude-code)**. Bạn vẽ ý tưởng hoặc viết công thức LaTeX, khoanh một vùng rồi hỏi. Claude trong terminal chỉ đọc đúng vùng đó, phân tích trên máy (đọc file, chạy code), rồi trả lời và vẽ lại lên bảng.

- Server Python **chỉ dùng thư viện chuẩn**, chạy trong virtualenv (`./wb` tự tạo).
- Công thức hiển thị bằng **MathJax** (`$…$`, `$$…$$`).
- **Tiết kiệm token:** Claude chỉ đọc vùng được khoanh. Ảnh PNG của vùng chỉ được gửi khi vùng có nét vẽ hoặc hình.
- Đóng gói sẵn thành **Claude Code skill**: Claude tự dựng server khi bạn yêu cầu.

## Yêu cầu

Python ≥ 3.10 (có module `venv`) và một trình duyệt. Không cần `pip`.

## Dùng như một skill của Claude Code

```bash
git clone https://github.com/MrNhoiBong/WhiteBorad.git ~/.claude/skills/whiteboard
```

Sau đó nói với Claude Code, ví dụ "mở bảng trắng để mình vẽ ý tưởng". Claude sẽ khởi động server, đưa bạn đường link và chờ yêu cầu từ bảng.

## Dùng thủ công

```bash
./wb start              # http://127.0.0.1:8765
./wb wait               # chờ một yêu cầu khoanh vùng (Claude chạy lệnh này ở nền)
./wb reply "Đáp: $x^2$" --done
./wb tex '$$\sum_{i=1}^n i = \tfrac{n(n+1)}{2}$$'
./wb svg --file hinh.svg --title "Sơ đồ"
./wb stop
```

Đặt `WB_DATA=/đường/dẫn` để mỗi dự án có bảng riêng (mặc định là `data/` cạnh mã nguồn).
Đặt `WB_UPLOADS=/đường/dẫn` để chọn nơi lưu file tải lên (mặc định `$WB_DATA/uploads`).

Truy cập từ máy khác trong mạng LAN:

```bash
./wb start --host 0.0.0.0   # mở http://<IP LAN>:8765 trên máy khác
./wb files                  # liệt kê file đã tải lên
```

## Trên bảng

| Phím | Công cụ |
|---|---|
| V / H | chọn / kéo bảng |
| P / E | bút / tẩy |
| N / T / M | ghi chú / chữ / công thức LaTeX |
| R / A | khung / mũi tên |
| **C** | **khoanh vùng và hỏi Claude** |
| Ctrl+Z | hoàn tác |

Khung chat bên phải dùng để nhắn mà không khoanh vùng.

Nút **tải lên** (hoặc kéo thả file vào bảng) gửi file cho Claude: file được lưu trên máy chạy server, bảng hiện thẻ 📎 có nút tải về, và Claude nhận được đường dẫn file.

Trong hình SVG, chữ trong `<text>` có thể chứa `$…$`; bảng sẽ render công thức bằng MathJax.

## Tài liệu

- [`SKILL.md`](SKILL.md): quy trình Claude dùng để phục vụ bảng.
- [`docs/architecture.md`](docs/architecture.md): kiến trúc và API.
- [`docs/notes.md`](docs/notes.md): ghi chú thiết kế, chi phí token, giới hạn hiện tại.

## Bảo mật

Mặc định server chỉ nghe trên `127.0.0.1` và không có xác thực. `--host 0.0.0.0` chỉ nên dùng trong mạng LAN tin cậy: mọi người trong mạng đều xem, sửa bảng và tải file lên được. Đừng mở cổng ra Internet.

File tải lên: tên được làm sạch (không thể ghi ra ngoài thư mục upload), tối đa 512 MB, và luôn được trả về dạng tải xuống (`attachment`, `nosniff`) để trình duyệt không thực thi.
