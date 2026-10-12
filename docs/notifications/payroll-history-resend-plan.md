# Gửi lại từ lịch sử công & lương

- [x] Chính sách dùng chung: SMTP lỗi/soft bounce được gửi lại hoặc đổi email; hard bounce/invalid/blocked phải đổi email; đã giao được gửi lại/đổi email sau xác nhận; chờ kết quả bị chặn.
- [x] API kiểm quyền xem và gửi tại cửa hàng, tạo job nền một người từ snapshot mã hóa gốc; không phụ thuộc bản nháp/hồ sơ nhân viên.
- [x] Transaction kiểm tra trạng thái mới nhất, chống gửi trùng giữa tab và request idempotent; liên kết lịch sử mới với bản ghi gốc và audit.
- [x] Modal nhập email nhận, cảnh báo hộp thư đầy/đã giao/đổi địa chỉ và xác nhận; theo dõi job realtime.
- [x] Kiểm thử API/worker và trình duyệt bằng SMTP mock, không gửi email thật, không deploy.

Đổi email chỉ thay địa chỉ nhận thư. Nội dung gốc gồm bảng thông tin nhân viên, công, lương và chữ ký giữ nguyên. Không tự gửi lại khi nhận webhook bounce.
