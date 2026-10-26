# JPULSE — Bản triển khai Google chạy song song ngày 16/10/2026

## Kết quả

Đã triển khai bản thử hạ tầng tại **https://jpulse-cloud-preview.web.app/login** bằng Firebase Hosting và Cloud Run, không dùng load balancer riêng. Vercel tiếp tục là production cho cả hai domain cũ.

Đây **chưa phải cutover production**. Chưa nghiệm thu đăng nhập/MFA, đọc dữ liệu có quyền, push, bản đồ, tệp và các nghiệp vụ sau đăng nhập. Không hủy/hạ gói Vercel và không tạo trigger GitHub mới.

## Bản phát hành

| Hạng mục | Giá trị |
| --- | --- |
| Source commit | `a159190dc76538bc56850bed09dfbd3309e0b4da` + thay đổi Dockerfile build frontend |
| Phiên bản Next.js | 15.5.18, không nâng dependency |
| Cloud Build | `1b4e021c-9644-4512-8093-d730118eb258`, SUCCESS |
| Image | `asia-southeast1-docker.pkg.dev/jw-system-f2104/cloud-run-source-deploy/fe-wms-preview:a159190dc765-20261016133111` |
| Image digest | `sha256:619aab1b454787c9227b7408c73b41d00c38d5f3150b44c917cfd48eec5c5d23` |
| Cloud Run service | `fe-wms-preview`, Singapore |
| Ready revision | `fe-wms-preview-00003-ncb`, Hosting pin vào tag `preview-00003-ncb` |
| Runtime | Node 22 container, 1 vCPU, 512 MiB, concurrency 80, min 0/max 2 instance, timeout 60 giây, request-based billing |
| Service account | `jpulse-frontend@jw-system-f2104.iam.gserviceaccount.com`; tạo riêng, không cấp application data roles |
| Firebase Hosting site | `jpulse-cloud-preview`; không dùng/thay thế default site |
| Hosting version | `b810635a34b9a713`, FINALIZED |
| Hosting release | `sites/jpulse-cloud-preview/releases/1792133180217000`, 16/10/2026 13:46:20 giờ Việt Nam |
| Frontend API base | `https://jpulse-cloud-preview.web.app`; Hosting chuyển `/api/**` tới backend hiện có, ngoại trừ `/api/openapi-tester` chuyển tới frontend |
| Feature flags bản thử | leave=true, employee contracts=true, marketing vouchers=true theo cấu hình local đã kiểm tra; chưa đọc được giá trị giải mã từ Vercel để chứng minh parity tuyệt đối |

Cloud Build đã tạo đủ 46 trang. Do gói Next.js cài tại máy không có thư mục `dist/docs`, đã đối chiếu tài liệu chính thức theo tag Next.js v15.5.18 cho standalone/hostname; không sửa mã ứng dụng Next.js.

## Các thay đổi đã thực hiện

1. Bổ sung build args Mapbox, VAPID, nhãn môi trường và bind hostname `0.0.0.0` vào Dockerfile.
2. Thêm cấu hình Cloud Build frontend riêng, script build từ archive nguồn có kiểm soát và script deploy preview riêng.
3. Tạo site Firebase Hosting và service account/runtime Cloud Run riêng cho frontend.
4. Thêm **hai** authorized domain mới vào Firebase Auth: `jpulse-cloud-preview.web.app`, `jpulse-cloud-preview.firebaseapp.com`. Đã xác nhận bảo toàn toàn bộ domain có trước.
5. Pin frontend Hosting vào ready revision; backend API dùng service hiện tại, không thêm tag hoặc sửa traffic backend.

Site thử dùng **Firebase và backend production hiện có**, không có bản sao dữ liệu. Trang đăng nhập là công khai; endpoint nghiệp vụ vẫn yêu cầu danh tính và phân quyền như hệ thống cũ. Không cấp credential backend/Admin SDK cho frontend. Không đưa `.env.local` hoặc secret backend vào context build.

## Kiểm tra đã đạt

| Kiểm tra | Bằng chứng |
| --- | --- |
| Shared types + frontend TypeScript | `pnpm --filter @bduck/shared-types build`, `pnpm --filter @bduck/fe-wms typecheck`: exit 0 |
| Build Linux/standalone | Cloud Build SUCCESS, image đã push |
| Trang login trên Google | HTTP 200; DOM có đủ trường tài khoản/mật khẩu và nút đăng nhập; ảnh trang kiểm tra trực quan khớp bố cục hiện tại |
| JS/CSS | 8 tài nguyên từ HTML login được lấy thử, đều HTTP 200 với MIME đúng |
| Deep link dashboard/attendance | HTTP 200 cho app shell; không đồng nghĩa đã xác minh dữ liệu sau đăng nhập |
| Manifest/logo | HTTP 200, MIME đúng |
| Service worker | HTTP 200, `application/javascript`, `Cache-Control: no-store`, `Service-Worker-Allowed: /` |
| Session khi chưa đăng nhập | `/api/auth/session`: HTTP 401, JSON; không trả dữ liệu có quyền |
| Kiểm tra validation backend | POST `/api/auth/sessionLogin` với `{}`: HTTP 400, success=false; không tạo phiên hoặc dữ liệu nghiệp vụ |
| Route Next.js riêng | POST `/api/openapi-tester` với `{}`: HTTP 400 `Missing baseUrl.`; không gọi dịch vụ bên ngoài |
| Console trình duyệt ở trang login | Không có warn/error trong log được đọc |
| Cấu hình source | PowerShell parser không có lỗi; JSON parse thành công; `git diff --check` đạt |
| Triển khai lại cùng artifact | Script build/deploy riêng đã được kiểm tra; deploy script exit 0 sau khi thêm bước pre-tag. Hosting API xác nhận cả hai rewrite frontend dùng tag `preview-00003-ncb`; backend không có tag mới |

Cache HTML đang là cache app shell tĩnh do Next.js phát ra (`s-maxage=31536000`), không có dữ liệu nghiệp vụ cá nhân được SSR trong các trang đã thử. Config Hosting có rule `private, no-store` cho API, nhưng response lỗi 400/401 đo được không có Cache-Control; **không coi đây là bằng chứng đã xác minh cache của response API authenticated 200**. Phải kiểm tra cookie, cache và dữ liệu thực tế sau đăng nhập trước cutover.

Đã mở tab Google và yêu cầu người dùng đăng nhập trực tiếp để kiểm tra tiếp, không yêu cầu gửi mật khẩu/OTP vào chat. Tại thời điểm ghi báo cáo chưa có bằng chứng phiên authenticated trên bản Google.

## Xác nhận production Vercel được giữ nguyên

| Hạng mục | Sau triển khai |
| --- | --- |
| `jpulse.joyworldcityfuns.vn` | CNAME `c05bd82aa60dcbcc.vercel-dns-017.com`, HTTP 200, Server Vercel |
| `erp.joyworldcityfuns.vn` | CNAME như trên, HTTP 200, Server Vercel |
| Vercel production deployment | Vẫn `dpl_7KiNvzDPGsf2gYHqbZLMwcKvMFfe`, READY; không tạo deployment mới |
| Backend ready revision | Vẫn `be-wms-00330-cw5` |
| Backend traffic | 100% vào revision đang chạy; các tag cũ giữ nguyên |
| Scheduler Singapore | Vẫn 10 job ENABLED; không chạy script tạo/cập nhật job |
| Firebase authorizedDomains cũ | Giữ nguyên, chỉ thêm hai domain thử |
| Git | Chỉ có thay đổi workspace; không commit/push hoặc kích hoạt pipeline production |

Các xác nhận trên là kiểm tra tại thời điểm triển khai, không phải cam kết uptime liên tục hay kiểm thử đầy đủ mọi nghiệp vụ Vercel.

## Cần nghiệm thu trước khi chuyển domain

- Đăng nhập và MFA bằng tài khoản phù hợp; refresh, đọc quyền, đăng xuất.
- Kiểm tra cache API authenticated, cookie `__session` qua Hosting và giới hạn/rate-limit sau proxy.
- Realtime, bản đồ, push, tệp và các báo cáo theo quyền, tránh tạo dữ liệu thử trên production.
- So sánh feature flags với cấu hình production thực tế và lấy mức sử dụng frontend.
- Hoàn thiện cấu hình build cho domain chính thức; image hiện tại đóng API base `web.app` nên không chuyển nguyên image này sang custom domain.
- Thiết lập quy trình release/rollback và cảnh báo vận hành/chi phí; theo dõi 7–14 ngày. Chưa tạo automation theo dõi hoặc thay budget billing ở đợt triển khai này.

Hướng dẫn thao tác nằm ở `infra/gcp/FRONTEND-PREVIEW.md`. Log/check JSON và baseline đã lưu dưới `.codex-tmp/frontend-preview/` (gitignored); không đưa token/session người dùng vào báo cáo.
