# Ghi chú thiết kế

## Vì sao không dùng bảng trắng artifact trên claude.ai?

Claude trong artifact (khả năng `sample`) là một lần gọi mô hình không có bộ nhớ, dùng tier mặc định. Nó chỉ dùng được các công cụ mà trang cung cấp: không có mạng, không đọc được file trên máy, không chạy được lệnh. Claude trong terminal thì làm được tất cả những việc đó. Vì vậy bảng trắng được dựng local và giao cho Claude ở terminal quản lý.

## Tiết kiệm token

- Claude **chỉ đọc vùng người dùng khoanh**, không đọc cả bảng.
- PNG của vùng chỉ được lưu và đọc khi có nội dung đồ hoạ. Chữ và LaTeX được gửi nguyên văn, rẻ hơn ảnh nhiều.
- `wait` chỉ in một dòng cho mỗi hình SVG, không in mã nguồn.

## Chi phí sinh hình SVG (đo trên mẫu, ước lượng 2,5–3 ký tự/token)

| Hình | Kích thước | ≈ Token |
|---|---|---|
| Sơ đồ 5 khối + 4 mũi tên | ~1 000 ký tự | 350–400 |
| Đồ thị 50 điểm | ~770 ký tự | 250–300 |
| Đồ thị 300 điểm (viết tay toạ độ) | ~3 700 ký tự | 1 200–1 500 |

Với đồ thị, nên viết một script Python sinh SVG: chi phí là độ dài script (khoảng 150–300 token), không phụ thuộc số điểm.

## Giới hạn hiện tại

- SVG hiển thị qua `<img>`, nên LaTeX bên trong SVG không được render. Cách thay thế: đặt các mục `tex` lên trên hình.
- Chưa có item ảnh PNG/raster và chưa có khung HTML tương tác.
- Không có xác thực; chỉ dùng trên localhost.
