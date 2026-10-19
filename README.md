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

## Tài liệu

- [`SKILL.md`](SKILL.md): quy trình Claude dùng để phục vụ bảng.
- [`docs/architecture.md`](docs/architecture.md): kiến trúc và API.
- [`docs/notes.md`](docs/notes.md): ghi chú thiết kế, chi phí token, giới hạn hiện tại.

## Bảo mật

Server chỉ nghe trên `127.0.0.1` và không có xác thực. Đừng mở cổng ra mạng ngoài.
