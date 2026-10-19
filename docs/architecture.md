# Kiến trúc

```
trình duyệt (static/)  ── SSE /api/events ──►  cập nhật trực tiếp
        │  POST /api/items, /api/ask, /api/chat
        ▼
server.py (ThreadingHTTPServer, thư viện chuẩn)  ── $WB_DATA/board.json
        ▲                                         └─ $WB_DATA/requests/<id>.json (+ .png)
        │  HTTP (urllib)
wb.py  ◄── Claude trong terminal (./wb …)
```

- **Trạng thái:** `{"items": {...}, "chat": [...]}`, lưu trong `board.json` sau mỗi thay đổi.
- **Item:** `note`, `text`, `stroke`, `rect`, `arrow`, `image` (SVG). Mỗi item có `x, y, w, h, color, author`.
- **Yêu cầu:** khi người dùng khoanh vùng và hỏi, server chỉ lưu **các item nằm trong vùng**. Ảnh PNG của vùng (chụp bằng canvas ở trình duyệt) chỉ được lưu khi vùng có nét tay, khung, mũi tên hoặc hình. Nhờ đó Claude chỉ đọc đúng phần được hỏi.
- **Trạng thái yêu cầu:** `pending` → `seen` (khi `wb wait` nhận) → `done`.

## API

| Phương thức | Đường dẫn | Ý nghĩa |
|---|---|---|
| GET | `/api/state` | toàn bộ bảng |
| GET | `/api/events` | SSE |
| GET | `/api/requests?status=` | danh sách yêu cầu |
| GET | `/api/request/<id>`, `/api/request/<id>.png` | một yêu cầu, kèm ảnh |
| GET | `/api/region?x&y&w&h` | các item trong một vùng |
| GET | `/api/item?id=` | một item |
| POST | `/api/items` | `{op: put\|patch\|del, …}`; `put` hỗ trợ `place:{near:[x,y,w,h]}` để tự tìm chỗ trống |
| POST | `/api/batch` | `{ops:[…]}` |
| POST | `/api/ask` | `{region, question, png}` |
| POST | `/api/chat` | tin nhắn chat |
| POST | `/api/request/<id>/status` | đổi trạng thái yêu cầu |
| POST | `/api/clear` | xoá bảng |

Server chỉ nghe trên `127.0.0.1`. Không có xác thực: đừng mở ra mạng ngoài.

## Giao diện

Giao diện viết bằng vanilla JS và MathJax 3 (tex-svg, nạp từ jsdelivr), với một bộ Markdown-lite tự viết.

- **Công cụ:** chọn (V), kéo bảng (H), bút (P), ghi chú (N), chữ (T), công thức (M), khung (R), mũi tên (A), tẩy (E), khoanh vùng hỏi Claude (C).
- **Phím tắt khác:** Ctrl+Z để hoàn tác, Delete để xoá, Esc để huỷ.
- Có chế độ sáng và tối.
