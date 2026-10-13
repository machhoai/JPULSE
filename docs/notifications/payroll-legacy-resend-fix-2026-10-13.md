# Gửi lại lịch sử cũ thiếu attempt

Chẩn đoán read-only production: bản ghi lịch sử trước nâng cấp thiếu `attempt`; item gốc đã SENT, attempt 1 và job COMPLETED. Không có resend job. So sánh 1 với undefined khiến backend báo sai là đã có lần thử mới hơn.

- [x] Dùng attempt đã lưu nếu hợp lệ; với lịch sử cũ đọc số từ ID đúng cấu trúc job_id + recipient_id + attempt. Không suy đoán mặc định 1 khi ID không khớp.
- [x] API lịch sử và điều kiện gửi lại dùng cùng helper.
- [x] 27 unit và 17 API (44 tổng cộng) đạt; legacy cho phép gửi lại và vẫn chặn worker đang gửi/lần thử thực sự mới hơn. Backend build đạt; chỉ SMTP mock.
- [ ] Phát hành riêng, giữ các thay đổi hóa đơn trong checkout chính.

Không sửa trạng thái, địa chỉ nhận hoặc snapshot production; không gửi email thật khi kiểm thử. Người dùng tự xác nhận/chọn địa chỉ nhận trước khi bấm gửi lại.
