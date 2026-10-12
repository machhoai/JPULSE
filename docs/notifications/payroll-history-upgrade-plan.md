# Nâng cấp lịch sử email công & lương

Quyết định: Thành công chỉ khi Brevo xác nhận DELIVERED. SMTP nhận thư là chờ kết quả, không tự coi đã giao. Không tự retry email từ webhook.

- [x] Types dùng chung: trạng thái gửi/giao, bộ lọc ngày và trạng thái, thông tin lỗi.
- [x] Lưu lịch sử cho email đã dựng bắt đầu gửi, cập nhật khi SMTP thành công/lỗi/không rõ; giữ nội dung gốc mã hóa.
- [x] Webhook Brevo xác thực bằng secret, liên kết đúng lần gửi qua custom header, chống sự kiện trùng/cũ và sai người nhận; mã hóa lý do lỗi.
- [x] API lọc ngày/trạng thái trước phân trang, tương thích bản ghi cũ (chờ kết quả), kiểm quyền cửa hàng khi xem/tải.
- [x] Giao diện lịch sử độc lập mẫu đang soạn: cửa hàng, tháng/khoảng ngày, trạng thái, nhóm ngày/tháng, modal nội dung/lỗi; cập nhật realtime.
- [x] Kiểm thử API, worker, webhook, phân trang/lọc, timezone, quyền và desktop/mobile với SMTP mock.
- [x] Bàn giao cấu hình webhook và điều kiện dữ liệu cũ. Không deploy hoặc gửi email thật trong bước phát triển này.

Giữ tài liệu sự cố index đang có trong workspace; không trộn hoặc xóa các thay đổi đó.
