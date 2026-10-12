# Kết quả kiểm thử bảng công & lương

Ngày: 09/10/2026, Asia/Saigon. Phạm vi: P8 kiểm thử, không rollout.

## Kiểm thử bổ sung: nhắc bổ sung STK

22/22 unit và 16/16 browser đạt, FE typecheck đạt. Các tình huống gồm thiếu/trống/không phải chữ số/toàn số 0/số âm/số thập phân/số không đọc chính xác/công thức thiếu cached result; số 0 đầu được giữ nguyên. HTML/text/MIME hiển thị “Cần bổ sung gấp”, cảnh báo có dòng/sheet/file, riêng lỗi STK không chặn người nhận mới import. Đã xem ảnh preview. Chỉ kiểm tra định dạng và khả năng đọc theo xác nhận của người dùng; không áp đặt độ dài hoặc xác minh với ngân hàng. Không gửi email thật.

## Kiểm thử bổ sung: chọn file mẫu mới và số thập phân

Sau chuyển quản lý chữ ký lên tiêu đề trang và modal: 15/15 browser và FE typecheck đạt. Đã kiểm tra cập nhật danh sách sau lưu, Escape/trả focus, modal mobile, quyền bị thu hồi và hồi quy payroll. Đã sửa lỗi focus phát hiện ở lần chạy đầu rồi chạy lại toàn bộ. Không gửi email thật.

Sau chỉnh giao diện: 20/20 unit và 14/14 browser đạt; FE typecheck và build shared-types/backend đạt. Bộ browser đã chạy lại sau khi sửa selector test cửa hàng thành combobox. Xác nhận click mở native file chooser cho mẫu chưa lưu/đã lưu, chọn file và lưu mapping. Số hiển thị làm tròn đến tối đa hai chữ số thập phân trong HTML/text/MIME và cảnh báo; dữ liệu gốc và STK không thay đổi. Không gửi email thật.

Bảng dưới đây ghi kết quả đợt P8 ban đầu; không cộng các lần chạy lại thành test mới.

## Kết quả

| Bộ test | PASS | FAIL | SKIP |
|---|---:|---:|---:|
| Unit: import/render/schema/MIME/chữ ký/đối chiếu | 19 | 0 | 0 |
| Service/repository/worker với Firestore emulator | 12 | 0 | 0 |
| HTTP API/ZIP/quyền theo cửa hàng | 5 | 0 | 0 |
| Dispatcher/OIDC/outbox với SDK mock | 5 | 0 | 0 |
| Firestore rules với client SDK | 3 | 0 | 0 |
| Chromium desktop/mobile và E2E API/emulator | 13 | 0 | 0 |
| **Tổng** | **57** | **0** | **0** |

Mỗi test có nhiều assertion. Không coi các tình huống ngoài test đã chạy là đã nghiệm thu.

Build shared-types/backend, typecheck frontend/backend và kiểm tra diff: PASS. Next.js production compile và tạo 46 static pages: PASS; đóng gói standalone: FAIL do Windows chặn tạo symlink (EPERM). Chưa xác nhận được artifact standalone hoàn chỉnh trên máy này.

## Không gửi email thật

- noMailGuard.mjs từ chối tạo SMTP transport thật; test âm xác nhận gọi service gửi vô tình cũng bị chặn trước kết nối.
- Worker/API gửi thử dùng hàm SMTP mock, fixture ở example.invalid.
- Test mô phỏng 100 người: 4 nhóm logic 25, tối đa 3 tác vụ cùng lúc, một To mỗi thư, đủ 100 history records. Replay worker không gửi thêm.
- E2E giao diện → HTTP API thật → Firestore emulator → AES-GCM → worker → progress/history dùng SMTP mock.
- Không gọi Cloud Tasks, token verification Google hoặc Storage thật. Firestore chỉ ở loopback/project demo-payroll-* với credential giả sinh trong tiến trình.
- Suite không nạp .env.local hoặc dùng database production. Production build được preload guard SMTP.
- Không deploy hoặc sửa credential/config production.

## Lỗi đã sửa

1. Đổi vị trí STT rồi chọn bắt đầu giữa dữ liệu gây bỏ sót dòng: tìm header thật thay vì mặc định dòng trước start row.
2. Schema không từ chối rõ khóa prototype: kiểm tra JSON gốc trước khi Zod loại bỏ __proto__.
3. Quill đặt lại DOM/caret mỗi text-change: chỉ replay khi xác nhận bất đồng bộ; nhập/undo/redo ổn định.
4. Đối chiếu thủ công ghi đè profile từ bảng lương: giữ profile/tiền theo bảng kê, chỉ thay chỉ tiêu bổ sung và dựng lại cảnh báo lệch.
5. Bộ chọn mẫu mobile co hẹp: select chiếm trọn hàng.
6. Response nháp đang chờ có thể nạp dữ liệu sau khi mất quyền: kiểm tra quyền hiện tại trước khi cập nhật state.

## Bằng chứng phạm vi

- Parser: tiêu đề/tổng/vùng mẫu bỏ qua; khối theo người; 100 người; đổi cột/start row; cached formula; STK số 0 đầu/số không an toàn; email/tên trùng.
- Biến: January 2027 theo hai cú pháp đã chốt, Saigon boundary, split token, token lạ, HTML/header injection.
- AES-GCM thực: round trip, IV khác, AAD/tag sai bị từ chối; không có bank/net/name plaintext trong blob/audit.
- Nháp: revision conflict, own/store permissions, ghi dở, loại recipient cũ, restore, logout/offline và quyền bị thu hồi khi đang tải.
- Queue: concurrency/chunk, lease/fencing, stale PROCESSING → UNKNOWN, 4xx/backoff/attempt cap, chỉ retry FAILED, lỗi DB sau SMTP nhận không gọi SMTP lại.
- Gửi lại: danh sách tên/email, confirmation token, token sai, chữ ký đổi.
- ZIP/MIME: parse được archive và thư UTF-8, đúng người/subject/body/signature, không trộn nhân viên.
- Rules: sender chỉ xem job của mình ở cửa hàng có quyền; history tách thông báo thường; client không ghi job/history hoặc đọc draft trực tiếp.
- UI: Quill, hide/cancel/confirm, sửa email, ký tên, nháp, background request, wizard/cards mobile, không overflow ngang.

## Lệnh chạy lại

Yêu cầu pnpm, Node 22.22+, Java/Firebase CLI và Chromium của Playwright:

1. pnpm test:payroll:unit
2. pnpm test:payroll:emulator
3. pnpm --filter @bduck/fe-wms exec playwright install chromium (nếu chưa cài browser test)
4. pnpm test:payroll:browser

Emulator/browser dùng firebase.payroll-test.json, cổng riêng 8485; không chạy đồng thời. Config test không dùng deploy production.

## Giới hạn trước dùng thử thật

- Browser dùng component/hook thực với adapter Next dynamic, Firebase listeners và toast animation. Một case nối API/repository thật ở emulator; đăng nhập Firebase/SSO thật chưa chạy.
- OIDC dùng SDK mock; Google token signature và IAM/queue thật chưa diễn tập.
- Storage là memory adapter với AES-GCM thực; bucket IAM/ACL thật chưa kiểm tra.
- MIME/ZIP và Chromium preview đã kiểm tra, không kiểm Gmail/Outlook inbox rendering hoặc delivered/open.
- Không rollout/deploy indexes/rules hoặc tạo khóa/queue production. Môi trường dùng thử cần cấu hình và quyền trong payroll-email-runtime.md.
- P8 phần kiểm thử đã chạy trong phạm vi này; P8 rollout còn để lại.
