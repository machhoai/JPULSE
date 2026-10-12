# Lịch sử giao email công & lương

## Trạng thái

- **Thành công**: Brevo xác nhận `delivered`.
- **Chờ kết quả**: đang gửi, SMTP/Brevo đã nhận thư hoặc đang trì hoãn giao thư; chưa có bằng chứng đã giao.
- **Lỗi**: lỗi gửi SMTP hoặc sự kiện soft bounce, hard bounce, blocked, invalid, error.

Lịch sử ghi từng lần thử gửi, giữ nội dung email gốc mã hóa. Thư lỗi và thư chưa xác định kết quả vẫn có thể mở để đối chiếu. Webhook không tự gửi lại email. Trạng thái hoàn tất đợt gửi của worker thể hiện kết quả chuyển thư đến SMTP, không thay thế trạng thái giao thư từng người.

Bản ghi cũ chưa có sự kiện giao thư hiển thị **Chờ kết quả**. Không suy luận thành công từ `SENT`. Webhook mới không tự khôi phục các bounce đã xảy ra trước khi đăng ký; muốn bổ sung cần đối chiếu log lịch sử Brevo riêng.

## Cấu hình production khi triển khai

1. Cấu hình biến backend `PAYROLL_BREVO_WEBHOOK_SECRET`, chuỗi ngẫu nhiên tối thiểu 32 ký tự. Giữ riêng ở server; không dùng tiền tố `NEXT_PUBLIC_`, không commit giá trị. Tiếp tục giữ khóa mã hóa payroll hiện tại.
2. Deploy backend/frontend và Firestore rules của nhánh này. Rules mới cho phép đọc `payroll_history_signals/{facilityId}` theo quyền lịch sử của cửa hàng; `payroll_delivery_events` chỉ backend truy cập. Bộ lọc không yêu cầu index trạng thái mới; các index worker đã có vẫn cần giữ.
3. Đăng ký webhook **transactional / email** trong Brevo tới URL backend cộng `/api/notifications/payroll/webhooks/brevo`, phương thức POST, xác thực Bearer bằng secret trên.
4. Chọn các sự kiện `delivered`, `deferred`, `softBounce`, `hardBounce`, `blocked`, `invalid`, `error` nếu giao diện/API cung cấp. Backend xử lý cả tên camelCase và snake_case của bounce.
5. Kiểm tra callback được xác thực và cập nhật đúng lần gửi. Không gửi thư thật để kiểm tra nếu chưa được người dùng cho phép.

SMTP gắn `X-Mailin-custom: payroll_history:<id>` để webhook liên kết đúng lần gửi. Trường hợp cũ có thể đối chiếu bằng message-id duy nhất. Backend kiểm tra email trong snapshot trước khi cập nhật, bỏ qua sự kiện trùng/cũ và mã hóa nguyên văn lý do lỗi. Sự kiện webhook dùng xác thực máy chủ Bearer; API xem lịch sử vẫn dùng phiên người dùng và quyền cửa hàng.

Nguồn cấu hình: [Transactional webhooks](https://developers.brevo.com/docs/transactional-webhooks), [Secured webhooks](https://developers.brevo.com/docs/secured-webhooks), [Create webhook](https://developers.brevo.com/reference/create-webhook).

**Chưa triển khai/đăng ký webhook production trong lần phát triển này.** Không phát sinh provisioning mới. Nếu tạo thêm Secret Manager secret, cần báo chi phí theo sử dụng ngoài quota trước khi thực hiện; webhook cũng tăng số thao tác Firestore/Storage theo số sự kiện.

## Kiểm thử

Dùng Firestore emulator `demo-payroll-qa`, SMTP mock và dữ liệu giả. Không sử dụng thông tin người nhận thật, không gọi recovery production và không gửi email thật.

- Unit: 25 trường hợp, gồm phân loại trạng thái, chính sách gửi lại và ranh giới ngày Việt Nam.
- Worker integration: 12 trường hợp.
- API: 14 trường hợp, gồm lọc trước phân trang, quyền cửa hàng, dữ liệu cũ, webhook sai người nhận/trùng/cũ, mã hóa lỗi, callback đến trước SMTP trả kết quả và gửi lại từ lịch sử.
- Dispatcher: 5 trường hợp.
- Firestore rules: 4 trường hợp.
- Trình duyệt: 23 trường hợp, gồm bộ lọc/ngày/tháng, nội dung gốc và lỗi hộp thư đầy, cập nhật realtime, F5, desktop/mobile, thu hồi quyền và xác nhận gửi lại/đổi email.

Backend/frontend typecheck và shared-types lint đạt. Ảnh kiểm tra cục bộ: `.tmp/payroll-history-detail.png`, `.tmp/payroll-history-mobile.png` (không commit).

## Gửi lại từ lịch sử

Người có cả quyền xem lịch sử và quyền gửi tại cửa hàng được tạo lần gửi mới từ snapshot đã mã hóa, không cần bản nháp cũ. SMTP lỗi hoặc soft bounce có thể giữ/đổi địa chỉ. Hard bounce, invalid và blocked yêu cầu đổi địa chỉ. Đã giao có cảnh báo và được giữ/đổi địa chỉ. Người dùng phải xác nhận tên nhân viên và email nhận; thay địa chỉ sẽ bỏ xác nhận cũ. Chờ kết quả không cho gửi lại.

API `POST /history/:id/resend` tạo job nền một người với request-id idempotent, liên kết `resend_source_id`, audit và khóa transaction giữa tab. Chỉ địa chỉ nhận thay đổi; tiêu đề, HTML, text, kỳ công/lương và chữ ký giữ nguyên. Bản ghi cũ giữ nguyên kết quả/nội dung. Worker đang tự retry hoặc một lần gửi lại còn chờ giao sẽ chặn yêu cầu mới. Không tự retry từ webhook.
