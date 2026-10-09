# Bảng công và lương: bàn giao P0–P7

Đã triển khai mã nguồn và chạy P8 kiểm thử không gửi email thật: 57 test PASS. Xem [báo cáo](./payroll-email-test-results.md) về phạm vi và giới hạn. Chưa rollout/deploy production.

## Điểm vào và luồng dữ liệu

- `/notification` có lựa chọn `Bảng công & lương`; quyền mới được đưa vào menu và màn hình quản trị role.
- Mẫu gắn cửa hàng; mẫu/chữ ký dùng chung, nháp thuộc người tạo. Tên mẫu không được dùng thay mã cửa hàng trong kiểm quyền.
- Excel được đọc ở trình duyệt bằng ExcelJS, không lưu file gốc lên server. Đọc các dòng thông tin/lương và khối công lặp theo mẫu, giữ địa chỉ nguồn trong lỗi/cảnh báo.
- Ghép bằng tên chuẩn hóa; trường hợp mơ hồ cần chọn đối chiếu. Các ứng viên đối chiếu được giữ trong dữ liệu nháp mã hóa để mở lại không cần import.
- Quill giữ Delta và ba embed cố định. Dữ liệu thực được dựng riêng cho từng người; không lưu HTML của nhân viên đầu tiên vào mẫu dùng chung.
- Nháp/recipients, manifest/snapshot và email lịch sử được mã hóa AES-256-GCM trong Storage. Firestore chứa metadata, revision, trạng thái, các con trỏ và audit đã loại bỏ financial plaintext.
- Preview, gửi thử và MIME dùng renderer chung. Gửi thật kiểm phiên bản nháp và fingerprint chữ ký, sau đó cố định snapshot trước khi worker gửi.
- Manifest và items được chuẩn bị từng phần; mỗi nhóm logic 25 người. Worker xử lý tối đa 3 SMTP request đồng thời, checkpoint từng người và dùng lease để chống xử lý lặp.
- Tiến độ và lịch sử cập nhật bằng listener; API giải mã nội dung sau khi kiểm quyền. Lịch sử chỉ tạo trong transaction xác nhận gửi thật thành công.

## Quyền

| Key | Phạm vi |
|---|---|
| `notifications.payroll.compose` | Import, soạn, lưu/mở nháp tại cửa hàng |
| `notifications.payroll.download` | Tải ZIP email; tải lịch sử cần thêm quyền đọc lịch sử |
| `notifications.payroll.send` | Gửi thử, gửi thật, tiến độ đợt của người tạo và retry lỗi |
| `notifications.payroll.history.read` | Xem email thành công tại cửa hàng được cấp quyền |
| `notifications.payroll.templates.manage` | Tạo/sửa/xóa mềm mẫu tại cửa hàng; đổi cửa hàng kiểm quyền cả hai phạm vi |
| `notifications.email_signatures.manage` | Quản lý chữ ký HTML có tên dùng chung |

Nháp không được đọc bởi người khác chỉ vì họ có quyền dùng mẫu. Nội dung lương không được đưa vào `notification_dispatches` và không được mở bằng `notifications.read` thông thường.

## Cấu hình cần chuẩn bị trong P8

Các placeholder đã có trong `.env.example`, chưa ghi khóa/credential thật vào repository:

- `PAYROLL_ENCRYPTION_VERSION=V1` và `PAYROLL_ENCRYPTION_KEY_V1`: khóa ngẫu nhiên 32 byte, base64, chỉ phía server. Giữ các phiên bản khóa cũ còn dữ liệu cần đọc; không commit hoặc log khóa.
- `FIREBASE_STORAGE_BUCKET`: bucket server có quyền đọc/ghi, áp dụng quyền riêng tư cho prefix `payroll-private/`; không cấp public URL hoặc client write cho payload.
- `GOOGLE_CLOUD_PROJECT` hoặc `GCP_PROJECT_ID` theo cấu hình hiện tại của hệ thống.
- `PAYROLL_TASK_LOCATION`, `PAYROLL_TASK_QUEUE`: queue riêng cho payroll, giới hạn tốc độ/concurrency phù hợp SMTP.
- `PAYROLL_WORKER_BASE_URL`, `PAYROLL_WORKER_SERVICE_ACCOUNT`: URL backend và danh tính OIDC mà worker kiểm audience/issuer/email.
- Cấu hình Brevo hiện có: tài khoản SMTP, địa chỉ/tên người gửi, chữ ký HTML/text mặc định.
- Deploy Firestore rules và các indexes mới cho history, draft, recipients và items.

### Lỗi thiếu khóa khi chạy local

Backend dev đọc `.env.local` tại root qua `tsx watch --env-file=../../.env.local`. Sau khi bổ sung khóa, cần dừng và chạy lại backend bằng `pnpm dev:be-wms` để tiến trình nạp env mới. Lỗi 503 ở API lưu draft xảy ra trước bước gửi SMTP nếu thiếu khóa. Không thay khóa của một phiên bản đã có dữ liệu mã hóa.

09/10/2026: đã bổ sung V1 vào env local (file được Git ignore), kiểm tra khóa giải mã base64 đủ 32 byte và roundtrip AES-256-GCM trong bộ nhớ đạt. Không gọi Storage, không gửi email, không log khóa. Chưa xác nhận lại request của người dùng sau khi họ khởi động lại backend.

`PAYROLL_CATALOG_LISTENER_UNAVAILABLE` là lỗi listener Firestore riêng: cần kiểm tra quyền/rules của collection `payroll_catalog` trên project đang kết nối nếu còn lỗi. `ERR_BLOCKED_BY_CLIENT` cho biết request bị chặn phía client; không tự kết luận thiếu khóa gây ra log này.

Worker production:

- Cloud Tasks gọi `POST /api/notifications/payroll/internal/jobs/:id` với OIDC.
- Recovery gọi `POST /api/notifications/payroll/internal/recover` với cùng danh tính OIDC, qua lịch Cloud Scheduler được cấu hình ở P8. Dùng endpoint này khôi phục outbox chưa enqueue hoặc lease đã hết.
- Router payroll được mount trước router notification chung để token OIDC không bị kiểm như token Firebase của người dùng.
- Local/development có vòng recovery từ bản ghi durable; không dùng timer trong browser để gửi. Không bật một dev server vào dữ liệu production để diễn tập.

## Hành vi lỗi và gửi lại

- Thiếu email, sai kiểu số, lỗi công thức hoặc trùng/không khớp tên có vị trí nguồn; người lỗi có thể bỏ chọn.
- Các ô công thức chỉ đọc cached result. Không tính lương/thuế và không thực thi công thức Excel.
- Tổng thanh toán/thực nhận lấy bảng kê; sai khác với bảng lương được báo rõ. Giá trị trống được phân biệt với 0.
- Ẩn trường/bảng có dữ liệu yêu cầu xác nhận và nêu trường/người bị ảnh hưởng. Áp dụng lại khi import dữ liệu mới; thao tác bàn phím/cut/undo cũng qua cùng guard.
- Gửi lại người đã gửi trong phiên trả danh sách họ tên/email và confirmation token gắn danh sách, revision và receipt hiện tại.
- Lỗi SMTP tạm thời có response 4xx được thử lại giới hạn, với backoff. Lỗi xác định có thể retry riêng; không queue lại người SENT từ nút retry lỗi.
- Kết quả không xác định lưu UNKNOWN. Worker cũ mất lease không được tiếp tục gửi các item mới. Tạo đợt gửi lại trong phiên có receipt UNKNOWN cần xác nhận nguy cơ đã được SMTP nhận trước đó.
- Sau khi SMTP nhận, nếu lưu DB lỗi thì chỉ retry transaction kết quả; không gọi SMTP lần nữa trong nhánh lưu kết quả đó.
- SENT xác nhận SMTP đã nhận thư, không phải đã vào inbox hoặc người nhận đã đọc. Gửi thử/export không tạo lịch sử gửi thành công.

## Kiểm tra đã thực hiện và phần còn lại

Đã build shared-types/backend, typecheck backend/frontend, kiểm tra whitespace và chạy các suite unit, API, emulator, rules, dispatcher, browser/E2E. Next compile/static generation qua; standalone packaging bị Windows chặn symlink EPERM.

Phạm vi test đã chạy nằm trong payroll-email-test-results.md. Còn chưa diễn tập đăng nhập thật, bucket IAM, queue/token Google thật, inbox rendering và rollout. Không thực hiện gửi email thật trong phiên kiểm thử này; không sửa môi trường production.
