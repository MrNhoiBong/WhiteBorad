---
name: whiteboard
description: Dựng và phục vụ "Giấy nháp Claude", một bảng trắng local (server Python thư viện chuẩn, chạy trong venv) để người dùng vẽ hoặc viết LaTeX, khoanh vùng rồi hỏi; Claude trong terminal đọc đúng vùng đó và trả lời hoặc vẽ lại lên bảng. Dùng khi người dùng yêu cầu tạo, mở, khởi động hoặc dùng server bảng trắng (whiteboard, giấy nháp, bảng vẽ chung, scratch board) để trao đổi với Claude.
---

# Giấy nháp Claude (whiteboard)

Bảng trắng local dùng làm giấy nháp chung: người dùng vẽ ý tưởng, Claude phân tích trên máy rồi trả lời và vẽ lên bảng.
Mã nằm ngay trong thư mục skill này; dưới đây `WB` là đường dẫn tới thư mục chứa file này.

## Khởi động

```bash
export WB_DATA="$PWD/.whiteboard"   # tuỳ chọn: bảng riêng cho dự án hiện tại (mặc định: WB/data)
WB/wb start [--port 8765]           # tự tạo .venv (python3 -m venv --without-pip), không cần gói ngoài
```

- Đưa người dùng URL (`http://127.0.0.1:8765`), rồi **chạy `WB/wb wait --timeout 3300` ở chế độ nền** (run_in_background).
- Nếu đặt `WB_DATA`, phải đặt cùng giá trị cho **mọi** lệnh `wb` sau đó (ghi ngay trong lệnh: `WB_DATA=... WB/wb ...`).
- Nếu dùng `WB_DATA` bên trong một repo git, thêm `.whiteboard/` vào `.gitignore`.

## Vòng phục vụ

1. Khi `wait` kết thúc với **mã 0**: đọc output. Output gồm câu hỏi, vùng được khoanh, các mục trong vùng (đủ nội dung chữ) và đường dẫn PNG nếu có.
2. Chỉ mở ảnh PNG khi output liệt kê nó (chỉ có khi vùng chứa nét tay, khung, mũi tên hoặc hình). **Không** đọc cả bảng; cần thêm ngữ cảnh thì dùng `wb look X Y W H` hoặc `wb item ID`.
3. Làm việc trên máy nếu cần: đọc file, chạy script, tính toán.
4. Trả lời bằng `wb reply --file F --done`, và vẽ lên bảng nếu hữu ích (xem bên dưới).
5. Chạy lại `wait` ở chế độ nền. **Mã 2** nghĩa là hết giờ, không có yêu cầu: chỉ cần chạy lại `wait`, không cần báo người dùng.

Khi người dùng muốn dừng: `WB/wb stop`.

## Quy tắc trả lời

- **Mọi công thức toán phải viết bằng LaTeX** (`$…$` inline, `$$…$$` display), cả trong chat lẫn trên bảng. Trang dùng MathJax để render, macro sẵn có: `\Adv`.
- Văn bản nhiều dòng hoặc có `$` thì ghi ra file trong thư mục tạm, rồi truyền qua `--file` để tránh lỗi quoting của shell.
- Nội dung là Markdown-lite: `**đậm**`, `*nghiêng*`, `` `code` ``, danh sách, bảng `|…|`.
- Mục do Claude tạo mặc định có màu tím và tự đặt cạnh vùng đang xử lý; dùng `--at x,y` để đặt chỗ khác.

## Lệnh vẽ

| Lệnh | Dùng cho |
|---|---|
| `wb note [TEXT\|--file F] [--color C] [--at x,y] [--w W]` | Ghi chú dạng thẻ (Markdown + LaTeX) |
| `wb tex [TEXT\|--file F] [--size N]` | Chữ hoặc công thức không khung |
| `wb svg --file F --title T [--w W --h H]` | Sơ đồ, đồ thị, hình minh hoạ (SVG) |
| `wb rect X Y W H`, `wb arrow X Y DX DY` | Khung, mũi tên gốc của bảng |
| `wb patch ID [--text\|--file\|--svgfile\|--at\|--color]`, `wb rm ID…` | Sửa, xoá |
| `wb show [RID] [--pending]`, `wb done [RID]` | Xem lại hoặc đóng yêu cầu |

Màu ghi chú: `yellow`, `pink`, `sky`, `mint`, `violet`. Màu nét (`rect`, `arrow`): `ink`, `red`, `blue`, `green`, `amber`, `violet`.

## Vẽ SVG tiết kiệm token

- Hình SVG được hiển thị qua `<img>` (an toàn, không chạy script), nên **LaTeX bên trong SVG không được render**. Cần công thức thì vẽ khung và mũi tên bằng SVG, rồi đặt các mục `tex` lên trên.
- **Đồ thị hoặc hình nhiều điểm: sinh SVG bằng một script Python ngắn**, không viết tay toạ độ. Chi phí khi đó chỉ là độ dài script, không phụ thuộc số điểm.
- Dùng `<style>`, `<defs>` và `<marker>`, làm tròn toạ độ. Nếu chỉ cần vài khung và mũi tên thì dùng `rect`/`arrow`.
- Chiều đọc gần như miễn phí: `wait` chỉ in một dòng mô tả cho mỗi hình SVG, không in mã nguồn.

Chi tiết kiến trúc và API: `WB/docs/`.
