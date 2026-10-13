# Phát hành lịch sử giao thư và gửi lại — 12/10/2026

## Đã phát hành

- Commit `222f767d75fbf6517af78ccefba012f832225252`, đã push nhánh chức năng, fast-forward và push `main`.
- Cloud Build `73d60f78-01e3-4a00-b970-1fae01ce71e8`: SUCCESS, repository `machhoai/JPULSE`, đúng SHA.
- Cloud Run `be-wms`, `asia-southeast1`, revision cuối `be-wms-00323-5dx`, 100% traffic, giữ cấu hình queue/recovery và khóa mã hóa trước đó.
- Vercel `dpl_FqTiR4rAwZYfoSRxAXs3o5reMy5Y`: READY production, đúng SHA, alias `jpulse.joyworldcityfuns.vn` và `erp.joyworldcityfuns.vn`.
- Firestore ruleset `6eb9c6a6-42f2-4cea-ac40-3084163d5d34`, nguồn rules khớp repo. So sánh với production trước deploy chỉ thêm signal theo quyền cửa hàng và delivery events chỉ server. Không đổi index.
- Secret `payroll-brevo-webhook-secret`, version 1, chỉ cấp `secretAccessor` cho runtime service account; env Cloud Run trỏ secret reference. Không ghi giá trị secret vào Git/log.

## Xác minh không gửi mail thật

- `/notification` production HTTP 200; frontend có bộ lọc lịch sử độc lập mẫu đang soạn.
- API history và resend không đăng nhập trả 401.
- Webhook thiếu Bearer trả 401; callback giả có Bearer đúng, dùng email `example.invalid` và ID không tồn tại trả 200, không tạo job/email/history giả.
- Không gọi test-send, resend, dispatch hoặc recovery production để kiểm thử.
- Kiểm thử trước deploy: 25 unit, 14 API, 23 trình duyệt, cùng 12 worker integration, 5 dispatcher và 4 Firestore rules. Typecheck frontend/backend và shared-types lint đạt.

## Còn cần đăng ký webhook Brevo

Khóa `BREVO_API_KEY` local và production bị API quản lý webhook trả 401. SMTP đang hoạt động dùng khóa này vẫn giữ nguyên. Chrome đã mở trang đăng nhập Brevo để người dùng đăng nhập tài khoản đúng; không tạo hoặc thay API key/gửi email thật.

Sau khi đăng nhập, đăng ký webhook transactional/email tới `https://be-wms-cxwygwr7wa-as.a.run.app/api/notifications/payroll/webhooks/brevo`, Bearer từ secret đã tạo, sự kiện `delivered`, `deferred`, `softBounce`, `hardBounce`, `blocked`, `invalid`, batching tắt. `error` được backend hỗ trợ nhưng API tạo webhook hiện không liệt kê event này.

Nếu chưa đăng ký webhook, lịch sử SMTP accepted và các bản ghi cũ vẫn hiển thị **Chờ kết quả**; không được báo đã giao thành công. Đăng ký mới không tự backfill bounce cũ.

## Chi phí

Đã báo trước khi provision: thêm một active secret version khoảng 0,06 USD/tháng ngoài free quota; Secret access, Cloud Run, Firestore/Storage tính theo sử dụng. Không nâng gói Vercel/Brevo, không thêm Scheduler/queue. Giá tham khảo: https://cloud.google.com/secret-manager/pricing.

## Hoàn tất webhook và cập nhật lịch sử cũ

Người dùng đã tự đăng ký webhook Brevo `2426718`, đúng URL production, transactional, Bearer, batching tắt, có đủ Delivered/Deferred/Soft bounce/Hard bounce/Blocked/Invalid. Cloud Run xác nhận callback thử từ `Brevo-webhook/2.0` trả HTTP 200.

Khóa mới người dùng cung cấp là MCP API key. Brevo vô hiệu hóa API key thường khi chuyển sang MCP; REST trả 401, nhưng kết nối MCP chính thức `https://mcp.brevo.com/v1/brevo/mcp` hoạt động. Chỉ gọi hai công cụ read-only: đọc cấu hình webhook và `campaign_analytics_get_email_event_report`. Không thay cấu hình MCP toàn cục, không lưu/log token.

Theo yêu cầu người dùng, đối chiếu đủ 40 email của 4 đợt ngày 12/10/2026 bằng message ID duy nhất; đọc 104 sự kiện nguồn và chọn 40 sự kiện giao thư có liên quan, bỏ qua requests/opened. Kết quả: **39 DELIVERED, 1 SOFT_BOUNCE, 0 PENDING**. Soft bounce của Nguyễn Kim Ngân có mã Gmail `452 4.2.2`, hộp thư người nhận đầy.

Replay các sự kiện xác thực qua endpoint webhook hiện có, kiểm tra email trong snapshot, giữ nguyên timestamp gốc và nguyên văn lỗi mã hóa. Không gọi gửi lại, test-send, SMTP, dispatch hay recovery. Xác minh lại Firestore: vẫn 40 history/4 job, 39 delivered/1 soft bounce; đủ 40 audit update; snapshot pointers giữ nguyên và lỗi giải mã khớp log nguồn. Các script và dữ liệu đối chiếu nằm trong `.tmp` bị Git ignore; không phát sinh build/deploy/hạ tầng mới.
