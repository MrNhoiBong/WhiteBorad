---
name: whiteboard
description: Dựng và phục vụ "Giấy nháp Claude", một bảng trắng local (server Python thư viện chuẩn, chạy trong venv) để người dùng vẽ hoặc viết LaTeX, khoanh vùng rồi hỏi; Claude trong terminal đọc đúng vùng đó và trả lời hoặc vẽ lại lên bảng. Dùng khi người dùng yêu cầu tạo, mở, khởi động hoặc dùng server bảng trắng (whiteboard, giấy nháp, bảng vẽ chung, scratch board) để trao đổi với Claude.
---

# Giấy nháp Claude (whiteboard)

Bảng trắng local dùng làm giấy nháp chung: người dùng vẽ ý tưởng, Claude phân tích trên máy rồi trả lời và vẽ lên bảng.
Mã nằm ngay trong thư mục skill này; dưới đây `WB` là đường dẫn tới thư mục chứa file này.

## Khởi động

**Mỗi thư mục là một bảng riêng hoàn toàn.** Không có bảng chung trong thư mục skill: bảng, yêu cầu, file tải lên, cổng và venv đều nằm trong `./.whiteboard/` của thư mục chạy lệnh (thư mục làm việc của dự án).

```bash
cd "<thư mục dự án>"                         # luôn chạy wb từ đúng thư mục này
WB/wb start [--port P] [--host 0.0.0.0]      # tạo ./.whiteboard/ (+ .venv riêng, python3 -m venv --without-pip)
```

- Cổng: lần đầu tự chọn cổng trống từ 8765 trở lên rồi lưu vào `./.whiteboard/port`, nên nhiều thư mục chạy song song được. Lấy URL đúng từ dòng `đã chạy: …` mà lệnh in ra.
- Mặc định chỉ nghe `127.0.0.1`. Người dùng muốn **truy cập từ máy khác trong LAN** thì thêm `--host 0.0.0.0` và đưa thêm URL dạng `http://<IP LAN>:<cổng>` (lấy IP bằng `hostname -I`). Server không có xác thực: chỉ mở trong mạng tin cậy.
- Đưa người dùng URL, rồi **chạy `WB/wb wait --timeout 3300` ở chế độ nền** (run_in_background).
- **Mọi lệnh `wb` phải chạy từ cùng thư mục** (hoặc cùng `WB_DATA`), nếu không sẽ trỏ sang bảng khác. `WB_DATA`/`WB_UPLOADS` vẫn dùng được để đặt chỗ khác, khi đó phải ghi cùng giá trị cho mọi lệnh.
- `./.whiteboard/` tự có `.gitignore` (`*`) nên git của dự án không theo dõi nó.
- Mọi script Python Claude chạy cho người dùng (vẽ SVG, tính toán) dùng venv của bảng `./.whiteboard/.venv/bin/python` hoặc venv của dự án.

## Vòng phục vụ

1. Khi `wait` kết thúc với **mã 0**: đọc output. Output gồm câu hỏi, vùng được khoanh, các mục trong vùng (đủ nội dung chữ) và đường dẫn PNG nếu có.
2. Chỉ mở ảnh PNG khi output liệt kê nó (chỉ có khi vùng chứa nét tay, khung, mũi tên hoặc hình). **Không** đọc cả bảng; cần thêm ngữ cảnh thì dùng `wb look X Y W H` hoặc `wb item ID`.
3. Làm việc trên máy nếu cần: đọc file, chạy script, tính toán.
4. Trả lời bằng `wb reply --file F --done`, và vẽ lên bảng nếu hữu ích (xem bên dưới).
5. Chạy lại `wait` ở chế độ nền. **Mã 2** nghĩa là hết giờ, không có yêu cầu: chỉ cần chạy lại `wait`, không cần báo người dùng.

Khi người dùng muốn dừng: `WB/wb stop`.

## Quy tắc trả lời

- **Không để tên Claude vào hình**: mọi mục vẽ lên bảng (note, tex, svg, tiêu đề hình) không chứa chữ "Claude"; giao diện cũng không gắn nhãn "✦ Claude" lên mục trên bảng.
- **Lý thuyết, giải thích ghi vào ô trò chuyện** (`wb reply`). Bảng chỉ dùng để vẽ sơ đồ, hình, hoặc mô tả thật sự cần trực quan; không chép đoạn giải thích dài lên bảng.
- **Khi nào vẽ:** người dùng yêu cầu vẽ (thẻ, sơ đồ, hình…) thì vẽ đúng thứ được yêu cầu; nếu không yêu cầu thì tự quyết theo hai quy tắc trên.
- **Mọi công thức toán phải viết bằng LaTeX** (`$…$` inline, `$$…$$` display), cả trong chat lẫn trên bảng. Trang dùng MathJax để render, macro sẵn có: `\Adv`.
- Văn bản nhiều dòng hoặc có `$` thì ghi ra file trong thư mục tạm, rồi truyền qua `--file` để tránh lỗi quoting của shell.
- Nội dung là Markdown-lite: `**đậm**`, `*nghiêng*`, `` `code` ``, danh sách, bảng `|…|`.
- Mục do Claude tạo mặc định có màu tím và tự đặt cạnh vùng đang xử lý; dùng `--at x,y` để đặt chỗ khác.

## File tải lên

- Người dùng (cả máy khác trong LAN) bấm nút **tải lên** trên thanh công cụ hoặc kéo thả file vào bảng. Server lưu vào `WB_UPLOADS` (mặc định `$WB_DATA/uploads`), đặt thẻ 📎 có link tải về lên bảng, và tạo yêu cầu `📎 Đã tải lên file … → <đường dẫn>` để `wait` báo cho Claude.
- File code hoặc văn bản đến 1 MB hiện thành thẻ có tên file và nút `+`/`−` để mở hoặc che nội dung (mục `codefile`); file khác dùng thẻ 📎.
- `wb files` liệt kê file đã tải lên kèm đường dẫn tuyệt đối. Tối đa 512 MB/file; tên được làm sạch, trùng tên thì thêm ` (1)`.
- Khi khởi động lại server, nhớ đặt cùng `WB_UPLOADS`, nếu không file cũ sẽ không hiện trong `wb files`.

**Claude đưa file lên bảng** (ví dụ để người dùng đọc code), chạy từ thư mục của bảng:

```bash
curl -s -X POST --data-binary @FILE "http://127.0.0.1:$(cat .whiteboard/port)/api/upload?name=TEN&x=X&y=Y"
WB/wb show --pending    # lấy id của yêu cầu 📎 vừa tự sinh
WB/wb done <id>         # đóng yêu cầu đó, nếu không wait sẽ báo lại chính file này
```

- Xem chỗ trống trước bằng `wb look X Y W H`. Tên có `/` thì đổi thành `__`.
- Đăng lại cùng tên sẽ tạo thẻ ` (1)`, nên xoá thẻ cũ bằng `wb rm ID`.

## Lệnh vẽ

| Lệnh | Dùng cho |
|---|---|
| `wb note [TEXT\|--file F] [--color C] [--at x,y] [--w W]` | Ghi chú dạng thẻ (Markdown + LaTeX) |
| `wb tex [TEXT\|--file F] [--size N]` | Chữ hoặc công thức không khung |
| `wb svg --file F --title T [--w W --h H]` | Sơ đồ, đồ thị, hình minh hoạ (SVG) |
| `wb rect X Y W H`, `wb arrow X Y DX DY` | Khung, mũi tên gốc của bảng |
| `wb patch ID [--text\|--file\|--svgfile\|--at\|--color]`, `wb rm ID…` | Sửa, xoá |
| `wb show [RID] [--pending]`, `wb done [RID]` | Xem lại hoặc đóng yêu cầu |
| `wb files` | Liệt kê file người dùng đã tải lên (đường dẫn tuyệt đối) |

Màu ghi chú: `yellow`, `pink`, `sky`, `mint`, `violet`. Màu nét (`rect`, `arrow`): `ink`, `red`, `blue`, `green`, `amber`, `violet`.

## Vẽ SVG tiết kiệm token

- Hình SVG được hiển thị qua `<img>` (an toàn, không chạy script). **LaTeX trong SVG:** viết `$…$` trong `<text>` (có thể trộn chữ thường), bảng sẽ render bằng MathJax thành `<svg>` lồng. Đặt `font-size`, `fill`, `text-anchor` **dạng thuộc tính** trên `<text>` (CSS class không được đọc).
- **Đồ thị hoặc hình nhiều điểm: sinh SVG bằng một script Python ngắn**, không viết tay toạ độ. Chi phí khi đó chỉ là độ dài script, không phụ thuộc số điểm.
- Dùng `<style>`, `<defs>` và `<marker>`, làm tròn toạ độ. Nếu chỉ cần vài khung và mũi tên thì dùng `rect`/`arrow`.
- Chiều đọc gần như miễn phí: `wait` chỉ in một dòng mô tả cho mỗi hình SVG, không in mã nguồn.

Chi tiết kiến trúc và API: `WB/docs/`.
