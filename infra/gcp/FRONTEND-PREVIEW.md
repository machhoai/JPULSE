# JPULSE frontend trên Google — triển khai song song

## Ranh giới triển khai

- Google project: `jw-system-f2104`, Cloud Run region `asia-southeast1`.
- Service mới: `fe-wms-preview`; site mới: `jpulse-cloud-preview`.
- URL thử: `https://jpulse-cloud-preview.web.app`.
- Domain production: `jpulse.joyworldcityfuns.vn` hiện map trực tiếp đến Cloud Run `fe-wms-preview` (xác minh ngày 21/10/2026). Domain ERP cũ đã bị gỡ khỏi DNS ngày 21/10/2026; không sử dụng lại trong cấu hình hoặc email.
- Không dùng site Firebase mặc định; không thay `firebase.json` (Firestore), backend service, queue hoặc scheduler.
- Frontend kết nối **Firebase và backend production hiện có**. Đây là bản thử hạ tầng, không phải sandbox dữ liệu. Không thực hiện thao tác nghiệp vụ thử có ghi dữ liệu thật.

## Cấu hình

`firebase.frontend-preview.json` chỉ cấu hình site riêng:

1. `/api/openapi-tester` → frontend (giữ route Next.js hiện có).
2. `/api/**` → `be-wms` hiện tại, không pin hoặc sửa traffic/tag backend.
3. Các đường còn lại → frontend với `pinTag: true` để gắn phiên bản Hosting với revision frontend.

Bundle dùng `NEXT_PUBLIC_API_URL=https://jpulse-cloud-preview.web.app`. API và UI cùng origin nên giữ được cookie `__session` có `SameSite=strict` mà không cần thay CORS/cookie backend. Firebase Hosting chỉ chuyển cookie `__session`; các tính năng khác phụ thuộc cookie/header phải được kiểm thử trước cutover. Hosting có timeout 60 giây; API production trực tiếp vẫn giữ timeout hiện tại.

API response dùng cache `private, no-store`; service worker dùng `no-store`; site có `X-Robots-Tag: noindex, nofollow`. Đây không phải cơ chế bảo vệ bằng mật khẩu: site có trang đăng nhập công khai tương tự custom domain hiện tại, còn API/Firestore tiếp tục kiểm tra danh tính và quyền.

Service account `jpulse-frontend` không được cấp role đọc/ghi dữ liệu; frontend không nhận private credentials backend. Chỉ thêm hai domain của site mới vào Firebase Authentication authorizedDomains, bảo toàn danh sách cũ.

## Build thủ công

Yêu cầu: gcloud, Firebase CLI đã đăng nhập, PowerShell, Git và tar. Docker daemon cục bộ không bắt buộc vì build bằng Cloud Build.

```powershell
./infra/gcp/build-frontend-preview.ps1
```

Script đọc **chỉ các key NEXT_PUBLIC_ cần thiết** từ `.env.local`; lấy Firebase Web App config của đúng project qua API, rồi submit Cloud Build bất đồng bộ. Không in giá trị token/key. Các key private như INTERNAL_API_KEY/BREVO/Firebase Admin không được chuyển vào image.

Cần có Mapbox, VAPID và ba cờ feature true/false rõ ràng trong file local. Firebase API key client/Mapbox public token/VAPID public key là cấu hình trình duyệt; phải bảo toàn các hạn chế API/domain thích hợp.

Build context được tạo từ `git archive HEAD` của frontend, packages dùng chung và các manifest; chép đè Dockerfile hiện tại đã bổ sung build args/HOSTNAME. Script từ chối nếu có tracked edit ứng dụng khác chưa được đưa vào HEAD để tránh build sai nguồn. Không tải `.env.local`, khóa máy chủ, logs hoặc tài liệu workspace lên Cloud Build. File trạng thái build nằm trong `.codex-tmp/frontend-preview/` đã được gitignore.

Theo dõi build bằng ID script trả về:

```powershell
gcloud builds describe BUILD_ID --project=jw-system-f2104 --format='value(status)'
```

## Deploy bản thử

Sau khi build SUCCESS, dùng image có tag cụ thể được trả về:

```powershell
./infra/gcp/deploy-frontend-preview.ps1 -Image 'asia-southeast1-docker.pkg.dev/jw-system-f2104/cloud-run-source-deploy/fe-wms-preview:BUILD_TAG'
```

Script triển khai riêng frontend (1 vCPU, 512 MiB, min 0/max 2, concurrency 80, timeout 60 giây), sau đó deploy riêng cấu hình Hosting thử. Không tạo trigger GitHub mới hoặc push main, do push có thể kích hoạt Vercel/backend production.

Script tạo một traffic tag cho revision frontend trước khi Firebase pin các rewrite. Việc này tránh lỗi cập nhật đồng thời của Firebase CLI 15.11 khi hai rewrite cùng pin một revision chưa có tag. Các tag cũ được giữ để hỗ trợ rollback Hosting.

Nếu quá trình build/deploy lỗi, giữ nguyên Vercel, sửa bản thử và triển khai lại; không rollback production chỉ vì preview lỗi.

## Kiểm thử trước khi chuyển domain

- HTML, JS/CSS/font/logo, login và các deep link tải được trên site thử.
- Service worker trả đúng MIME, `no-store` và phạm vi `/`; phiên bản build thay đổi giữa các release.
- `/api/auth/session` trả 401 khi chưa đăng nhập; không lộ dữ liệu.
- `/api/openapi-tester` vẫn do frontend xử lý; không gửi request thử ra dịch vụ nghiệp vụ bên ngoài.
- Tài khoản được phép: đăng nhập, MFA, refresh, đọc quyền và đăng xuất trên site mới; không gửi mật khẩu vào chat hay lưu vào repo.
- Kiểm tra realtime Firestore, bản đồ, push, upload/download và PDF/Excel bằng tài khoản/dữ liệu phù hợp. Không tự tạo dữ liệu HR/hóa đơn production để kiểm thử.
- Theo dõi lỗi Cloud Run, cold start, timeout và tài nguyên; chạy quan sát ít nhất 7–14 ngày trước khi hủy Vercel.
- Xác nhận lại DNS/HTTP và deployment Vercel sau mỗi đợt triển khai thử.

## Chi phí và bước còn lại

Baseline do người dùng cung cấp cho 01–16/10: **106.269đ**, ngoại suy tuyến tính 31 ngày khoảng **205.896đ** cho Google hiện có. Ngân sách dự kiến **250.000–350.000đ/tháng** sau thêm frontend vẫn là giả định lưu lượng 10–20 GiB; phải hiệu chỉnh bằng số đo. Không triển khai load balancer riêng ở giai đoạn này.

Chuyển domain và hủy gói Vercel là bước sau khi bản thử được nghiệm thu. Team Vercel còn các project khác nên không hủy cả team chỉ dựa vào trạng thái JPULSE.

Trước cutover phải build lại với `NEXT_PUBLIC_API_URL` phù hợp domain chính thức (hoặc triển khai cơ chế API base cùng origin đã kiểm thử). Không trỏ domain chính thức vào nguyên image preview có URL `web.app` được đóng trong bundle. URL preview được hỗ trợ ở giai đoạn này là `.web.app`; alias `.firebaseapp.com` chưa được kiểm thử phiên đăng nhập.
