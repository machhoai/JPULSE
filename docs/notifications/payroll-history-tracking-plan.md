# Các mốc gửi, nhận và mở email

- [x] Types và helper xác định mốc gửi/nhận/mở độc lập trạng thái giao thư.
- [x] Webhook nhận request/opened/unique_opened/proxy_open/unique_proxy_open, giữ thời gian đầu/cuối, chống trùng và sự kiện đảo thứ tự; không ghi đè bounce.
- [x] API trả mốc thời gian chuẩn ISO; tương thích lịch sử cũ thiếu các mốc này.
- [x] Danh sách hiển thị chi tiết giao thư và lượt mở; modal có ba mốc và thông tin proxy, vi/zh, desktop/mobile.
- [x] Kiểm thử webhook, quyền, hiển thị và regression bằng SMTP mock. Không gửi email thật, không deploy trong bước này.

Đã gửi: Brevo/SMTP nhận để xử lý. Đã nhận: Brevo xác nhận máy chủ nhận đã chấp nhận thư, không khẳng định nằm trong inbox. Đã mở: Brevo ghi nhận opened; không đảm bảo người nhận đọc nội dung. Proxy tự tải ảnh được ghi riêng, không tính như opened. Không có sự kiện mở không đồng nghĩa chưa đọc.

Các trường thời gian chỉ lưu metadata, không lưu email/IP/user agent/link mới. Webhook nhận các alias camelCase của uniqueOpened/proxyOpen/uniqueProxyOpen. Trạng thái giao thư, lỗi mã hóa, phân quyền và quyền gửi lại giữ nguyên. Mở không tự nâng trạng thái giao thư thành thành công.

Khi triển khai, webhook Brevo cần có `request`, `delivered`, `opened`, `uniqueOpened`, `proxyOpen`, `uniqueProxyOpen` bên cạnh các sự kiện lỗi. Webhook production đã được người dùng cấu hình các sự kiện này ở lần phát hành trước; chưa có thay đổi production trong bước này. Các mốc mở của 40 email cũ chưa được backfill thêm. Có thể đối chiếu qua MCP read-only và bổ sung sau deploy, không gửi email thật.

Nguồn sự kiện: https://developers.brevo.com/docs/transactional-webhooks.

Kiểm thử: 26 unit, 12 worker integration, 16 API, 5 dispatcher, 4 rules, 24 trình duyệt (87 tổng cộng) đạt. Backend build/frontend typecheck/shared-types lint đạt. Ảnh: .tmp/payroll-history-tracking.png.
