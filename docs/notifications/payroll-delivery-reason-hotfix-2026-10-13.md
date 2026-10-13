# Sửa hiển thị reason của thư giao thành công

Production có hai email ngày 13/10 được lưu `DELIVERED`; dữ liệu gốc từ Brevo là `event: delivered, reason: sent`. Backend không đổi chúng thành lỗi. Modal trước đó hiển thị mọi reason có nội dung dưới tiêu đề lỗi, gây hiểu nhầm.

- [x] Chỉ render khung lỗi cho SOFT_BOUNCE/HARD_BOUNCE/BLOCKED/INVALID/ERROR.
- [x] DEFERRED hiển thị cảnh báo trì hoãn và thông báo giao thư gốc.
- [x] PENDING/DELIVERED không hiển thị reason thông thường như lỗi.
- [x] Kiểm thử browser ba trạng thái và frontend typecheck đạt; SMTP mock, không gửi email thật.
- [x] Phát hành hotfix độc lập lên production.

Không thay trạng thái production, không thay dữ liệu gốc, không gửi lại email. Bản vá frontend dựa trên main `222f767d`, không kèm phần theo dõi lượt mở đang phát triển ở checkout khác.

Commit 5a476b45 đã lên main. Vercel dpl_62kr5sN8scLgFEqeDtpxEjZfsY9s READY production, đúng SHA, cả hai domain trả HTTP 200. Không đổi database/trạng thái và không gửi email thật.
