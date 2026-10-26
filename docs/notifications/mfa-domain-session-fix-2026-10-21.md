# Sửa phiên MFA sau chuyển domain — 21/10/2026

## Nguyên nhân đã xác minh

- Domain `jpulse.joyworldcityfuns.vn` hiện map trực tiếp đến Cloud Run `fe-wms-preview` (Google Frontend), theo Cloud Run Domain Mappings API.
- Log backend lúc 06:23 UTC ghi nhận `POST /api/auth/mfa/verify` và `POST /api/auth/mfa/send-email` trên hostname `be-wms-cxwygwr7wa-as.a.run.app` đều trả 401.
- Màn hình mở khóa và thiết lập MFA dùng `fetch` với cookie, không có Firebase bearer token. Cookie production dùng `SameSite=Strict`; frontend custom domain và backend `run.app` khác site. Backend từ chối ở middleware xác thực, trước khi kiểm tra TOTP hoặc gửi email. UI lại hiển thị mọi lỗi xác thực là mã không đúng.
- Luồng khôi phục phiên cũng dùng cookie đơn thuần, dẫn đến yêu cầu tạo lại phiên không cần thiết khi cookie không khả dụng.

## Thay đổi

- Dùng `authenticatedFetch` có sẵn cho mở khóa MFA, gửi mã email, thiết lập MFA và khôi phục phiên. Helper gửi Firebase ID token, tự refresh một lần khi nhận 401 và vẫn hỗ trợ cookie.
- Hiển thị thông báo lỗi thật từ backend để phân biệt lỗi phiên, mã OTP sai và lỗi gửi email.
- Build frontend với `NEXT_PUBLIC_API_URL=https://api-erp.joyworldcityfuns.vn`: hostname API riêng vẫn hoạt động và cùng site với frontend. Giữ bearer token để hỗ trợ các môi trường khác site.
- Giữ nguyên secret MFA, dữ liệu tài khoản và cơ chế kiểm tra mã; không nới `SameSite`, tắt MFA hoặc bỏ qua xác thực.

## Kiểm tra

- TypeScript frontend: đạt.
- ESLint 3 component thay đổi: đạt.
- 4 test `authenticatedFetch.test.mjs`: xác thực khi không có cookie, refresh token hết hạn, không retry mã sai và không chấp nhận yêu cầu chưa đăng nhập.
- 4 test backend identity/cookie: đạt; MFA vẫn kiểm tra danh tính và cookie vẫn có HttpOnly/Secure/SameSite Strict.
- API custom domain trả `healthy`; CORS preflight từ domain J-PULSE cho phép `authorization,content-type`, credentials và trả 204.
- Chưa dùng tài khoản người dùng để xác nhận TOTP hoặc gửi email thật; cần thử lại trên trình duyệt đang đăng nhập sau khi tải bản mới.

## Triển khai

- Cloud Build `1339c6cd-ec2c-4aa5-97a0-3521ed0289e8`: SUCCESS.
- Image `asia-southeast1-docker.pkg.dev/jw-system-f2104/cloud-run-source-deploy/fe-wms-preview:mfa-fix-20261021133109`, digest `sha256:c48c39ac40b23780545b3f09d19af00893526f7b26fe4951ab0c977b96c8adc7`.
- Chạy thử revision `fe-wms-preview-00006-yon` ở 0% traffic qua tag `mfa-fix-20261021`, sau đó chuyển 100% traffic của service sang revision này.
- Chromium smoke test đạt trên cả URL chạy thử và `https://jpulse.joyworldcityfuns.vn`: trang đăng nhập hiển thị, tải bundle MFA, bundle dùng API custom domain và bearer transport, không có lỗi JavaScript chưa xử lý.
- Không đổi backend hoặc dữ liệu MFA, không deploy lại Firebase Hosting đang pin các revision preview cũ. Người dùng cần tải lại trang để nhận bundle mới.
