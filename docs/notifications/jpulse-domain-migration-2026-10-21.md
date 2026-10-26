# Cập nhật domain J-PULSE — 21/10/2026

Domain frontend hiện tại: `https://jpulse.joyworldcityfuns.vn`. Domain ERP frontend cũ đã được người dùng gỡ khỏi DNS.

## Đã cập nhật production

- Cloud Run `be-wms`, project `jw-system-f2104`, region `asia-southeast1`: cập nhật `FE_WMS_APP_URL`, URL logo trong `BREVO_EMAIL_SIGNATURE_HTML` và loại origin frontend cũ khỏi `BE_WMS_CORS_ORIGIN`.
- Revision `be-wms-00331-rvr` sẵn sàng và nhận 100% traffic; chỉ thay đổi cấu hình, giữ nguyên image backend.
- Firestore `email_signatures/025541a1-4f85-4a22-81f1-2fb034aee5c8`: đổi link cũ, tăng revision lên 7, cập nhật thời gian, tăng phiên bản `payroll_catalog/version` và ghi `audit_logs`. Ghi có điều kiện theo `updateTime` để tránh ghi đè thay đổi đồng thời.

## Phạm vi rà soát và kiểm tra

- Rà soát mã nguồn và file cấu hình, gồm file môi trường local; các luồng email mời tài khoản, đặt lại mật khẩu, MFA, thông báo, voucher và email lương đều gửi qua `sendBrevoEmail`.
- Đổi URL logo trong `signature.html`, `outputs/voucher-email-demo.html` và `.env.local`; cập nhật hướng dẫn frontend preview.
- Đọc toàn bộ các collection cấu hình: `email_signatures` (1), `payroll_email_templates` (2), `system_configs` (2), `process_configs` (9), `pos_receipt_settings` (2), `pos_ticket_settings` (2), `pos_customer_display_settings` (2), `pos_payment_settings` (4), `pos_voucher_campaign_settings` (5), `file_templates` (24), `payroll_email_jobs` (8). Chỉ chữ ký email có domain frontend cũ trong các document đã đọc.
- Sau cập nhật: không còn domain frontend cũ trong các giá trị biến môi trường của revision production hoặc danh sách chữ ký email.
- HTTP 200: trang chủ J-PULSE, `/setup-password`, `/logo/jw.png` (Content-Type `image/png`). Không gửi email thật trong quá trình kiểm tra.

## Giới hạn

- Các báo cáo triển khai ngày 12/10 và 16/10 mô tả trạng thái lịch sử, không dùng làm cấu hình hiện tại.
- `api-erp.joyworldcityfuns.vn` là hostname API riêng, không thay thế theo domain frontend.
- Không sửa email đã gửi, lịch sử/snapshot email, payload mã hóa của draft/job hoặc các revision cũ chỉ có traffic tag. Nội dung đã gửi không thể cập nhật bằng thay đổi cấu hình này.
