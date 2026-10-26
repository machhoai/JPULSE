# JPULSE — Kiểm kê trước khi chuyển frontend từ Vercel sang Google

Ngày kiểm tra: **16/10/2026**, múi giờ Asia/Saigon.

## Phạm vi và trạng thái

Đã đọc repository, truy vấn Vercel bằng connector ở chế độ đọc, truy vấn Google Cloud bằng gcloud/Monitoring API và kiểm tra DNS/HTTP công khai. Chỉ tạo tài liệu này trong workspace. Không deploy, không commit/push, không đổi DNS/domain/alias, không sửa biến môi trường hoặc billing, không chạy scheduler hay tác vụ nghiệp vụ.

Yêu cầu giữ nguyên JPULSE trên Vercel được tuân thủ. Cron hiện được xử lý phía backend/Google Scheduler; không đưa migration cron vào phạm vi chuyển frontend.

**Kết quả:** hoàn thành kiểm kê kỹ thuật trong phạm vi quyền đọc hiện có. Hóa đơn/gói/ngày gia hạn Vercel và số liệu sử dụng frontend chưa xác minh được; các mục này được ghi rõ để hoàn thiện trước khi chốt ngân sách/hủy dịch vụ.

## 1. Vercel, domain và các hệ thống liên quan

| Hạng mục | Bằng chứng kiểm tra trực tiếp |
| --- | --- |
| Project frontend | `bduck-system-fe-wms`, framework Next.js |
| Production deployment | `dpl_7KiNvzDPGsf2gYHqbZLMwcKvMFfe`, trạng thái READY |
| Commit production | `a159190dc76538bc56850bed09dfbd3309e0b4da`, nhánh `main`, repo GitHub `machhoai/JPULSE`; khớp HEAD local lúc kiểm kê |
| Node trên Vercel | `24.x`; Dockerfile hiện dùng Node 22. Cần thống nhất/kiểm thử runtime khi dựng môi trường mới |
| Domain chính | `jpulse.joyworldcityfuns.vn` |
| Domain còn được sử dụng | `erp.joyworldcityfuns.vn`; backend đang dùng domain này trong `FE_WMS_APP_URL` |
| Alias mặc định | `bduck-system-fe-wms.vercel.app`; project còn có các alias theo team/nhánh |
| DNS hai custom domain | CNAME tới `c05bd82aa60dcbcc.vercel-dns-017.com` |
| Authoritative nameserver | `ns1.matbao.vn`, `ns2.matbao.vn` |
| Đăng ký domain | Vercel đánh dấu apex domain là external, không phải domain mua tại Vercel; chưa xác minh hợp đồng/đơn vị đăng ký và hạn gia hạn domain |
| Kiểm tra HTTP | HEAD hai custom domain trả HTTP 200, header Server Vercel |
| Preview protection | SSO được bật cho các domain ngoài custom domain; môi trường thử mới cần có biện pháp truy cập tương ứng |

**Phát hiện ảnh hưởng mục tiêu bỏ phí Vercel:** cùng team có **5 project**: `bduck-system-fe-wms`, `jpos`, `b.duck`, `bduck-ticketing`, `bduck-events`. Việc thấy tên project không chứng minh chúng còn dùng hoặc đang tính phí. Cần xác định chủ sở hữu, trạng thái sử dụng và nhu cầu từng project trước khi hủy/hạ gói ở cấp team. Chuyển JPULSE riêng chưa đủ bảo đảm không còn hóa đơn Vercel.

Connector billing trả `404 Plan not found` khi đọc charges cho kỳ khảo sát; thông tin team không cung cấp plan/kỳ gia hạn. Không suy luận từ lỗi này rằng tài khoản miễn phí hoặc không có khoản thu. Chưa có dữ liệu băng thông/request frontend theo project.

## 2. Google Cloud đang hoạt động

| Thành phần | Trạng thái kiểm tra trực tiếp |
| --- | --- |
| Project | `jw-system-f2104`; billingEnabled = true; đã liên kết Cloud Billing account hiện có |
| Backend | Cloud Run `be-wms`, `asia-southeast1` (Singapore) |
| Backend URL | `https://be-wms-cxwygwr7wa-as.a.run.app`; custom API `https://api-erp.joyworldcityfuns.vn` trả HTTP 200 |
| Cấu hình backend | 1 vCPU, RAM 512 MiB, concurrency 80, timeout 300 giây, min instance 0, max instance **20** |
| Sai khác với script repo | Lệnh deploy trong package.json ghi max 3; cấu hình production thực tế là max 20. Không chỉnh trong đợt kiểm kê |
| Deployment backend | Cloud Build trigger theo `main` của `machhoai/JPULSE`; production nhận 100% traffic vào revision mới nhất, có các revision tag cũ |
| Frontend Google | Chưa có service frontend trong danh sách Cloud Run của vùng này |
| Firestore | Một database `(default)`, Native, Singapore; PITR hiện tắt. Có bucket backup nhưng chưa kiểm chứng lịch backup/khả năng restore |
| Firebase Storage | Bucket nghiệp vụ `jw-system-f2104.firebasestorage.app` ở **US-EAST1**, không cùng vùng backend/Firestore |
| Functions dùng chung | Có **18 Cloud Functions gen 2** bên cạnh backend. Nhiều hàm liên quan POS, thành viên, PayOS; không quy toàn bộ chi phí project cho riêng JPULSE |
| Artifact Registry | Repository `cloud-run-source-deploy` khoảng 6,47 GiB tại thời điểm kiểm tra; có thêm `gcf-artifacts` nhưng chưa có size từ lệnh list |
| Cloud Tasks | 5 queue RUNNING: marketing-vouchers, meinvoice-issue, payroll-emails, processMemberCardReturnJob, recoverMemberRegistration |

Giữ nguyên project, database, bucket, API và cron khi chuyển frontend. Không chuyển vùng bucket trong cùng đợt; đây là một thay đổi dữ liệu độc lập.

### Scheduler kiểm tra được tại Singapore

Tất cả 10 job sau có state ENABLED. Đây là danh sách kiểm tra tại `asia-southeast1`, không khẳng định đã quét mọi region/project trong billing account.

| Job | Lịch thực tế | Đích |
| --- | --- | --- |
| employee-contract-maintenance-daily | `10 0 * * *`, Asia/Ho_Chi_Minh | API: hợp đồng |
| external-queue-auto-submit | **`0 16,23 * * *`**, Asia/Saigon | API: external queue |
| employee-employment-transitions-daily | `1 0 * * *`, Asia/Ho_Chi_Minh | API: chuyển trạng thái nhân sự |
| payroll-email-recovery | `*/5 * * * *`, Asia/Ho_Chi_Minh | Cloud Run API: khôi phục email lương |
| leave-maintenance-daily | `5 0 * * *`, Asia/Ho_Chi_Minh | API: nghỉ phép |
| meinvoice-issue-sweep | `*/5 * * * *`, Asia/Ho_Chi_Minh | Cloud Run API: phát hành hóa đơn |
| meinvoice-status-sweep | `*/15 * * * *`, Asia/Ho_Chi_Minh | Cloud Run API: đối soát hóa đơn |
| firebase-schedule-retryFailedOrderSyncs-asia-southeast1 | every 5 minutes, UTC | Cloud Function |
| firebase-schedule-retryMemberProfileChanges-asia-southeast1 | every 1 minutes, UTC | Cloud Function |
| firebase-schedule-reconcilePendingPayOSPayments-asia-southeast1 | every 1 minutes, UTC | Cloud Function |

Script external queue trong repo mặc định 14:00/22:00, khác lịch production 16:00/23:00. Chỉ ghi nhận sai khác; không chạy script tạo/cập nhật scheduler. Không thấy job identity-sync trong danh sách vùng này dù script HR có khai báo.

## 3. Frontend và biến môi trường

Frontend là Next.js/React trong pnpm monorepo, có gói dùng chung `@bduck/shared-types`, cấu hình `output: standalone` và tracing root trỏ workspace. Dockerfile có thể làm nền cho Cloud Run nhưng chưa build/chạy kiểm chứng trong đợt này.

Hai route phía máy chủ hiện có:

- `/api/openapi-tester`: Node.js route, không thể thay toàn bộ frontend bằng file tĩnh mà giữ nguyên hành vi.
- `/firebase-messaging-sw.js`: route tạo service worker/PWA, có `Cache-Control: no-store` và `Service-Worker-Allowed: /`.

Không phát hiện SDK `@vercel/*` trong package frontend. Phụ thuộc biến Vercel tìm thấy là mã commit tạo build version và nhãn môi trường trên UI; đã có biến thay thế (`BUILD_NUMBER`, `NEXT_PUBLIC_APP_ENV`). Đây là kết quả rà soát mã nguồn, chưa thay thế cho kiểm thử runtime/cache.

Đã kiểm kê được 12 key cấu hình trên Vercel, áp dụng production/preview; **không xuất giá trị secret vào báo cáo**:

| Nhóm | Key |
| --- | --- |
| Firebase client | NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_PROJECT_ID, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, NEXT_PUBLIC_FIREBASE_APP_ID |
| API | NEXT_PUBLIC_API_URL |
| Cờ tính năng | NEXT_PUBLIC_LEAVE_FEATURE_ENABLED, NEXT_PUBLIC_EMPLOYEE_CONTRACTS_FEATURE_ENABLED, NEXT_PUBLIC_MARKETING_VOUCHERS_FEATURE_ENABLED |
| Bản đồ | NEXT_PUBLIC_MAPBOX_TOKEN |
| Secret hiện có trên project | INTERNAL_API_KEY; chưa thấy frontend tham chiếu trực tiếp key này trong mã được rà soát, cần xác định mục đích trước khi sao chép |

Các điểm phải xử lý khi chuẩn bị bản triển khai, chưa sửa ở bước 1:

1. Dockerfile và workflow image frontend **chưa truyền `NEXT_PUBLIC_MAPBOX_TOKEN`**, trong khi code bản đồ dùng key này và Vercel có cấu hình.
2. Code thông báo đẩy dùng `NEXT_PUBLIC_FIREBASE_VAPID_KEY`; Dockerfile chưa truyền và danh sách env Vercel trả về không có key này. Cần xác minh nguồn cấu hình/hành vi push thực tế, không tự kết luận push đang hỏng.
3. `NEXT_PUBLIC_*` cần đúng ở build time; chỉ đặt runtime env cho container không bảo đảm cập nhật bundle trình duyệt.
4. Cấp `BUILD_NUMBER` theo commit/build để service worker có phiên bản mới. Dockerfile mặc định 0, pipeline hiện chưa truyền số build riêng.
5. Next config bỏ qua lỗi lint/type khi build; pipeline mới phải có quality checks độc lập.
6. Giữ cả hai custom domain trong CORS/Auth và giữ domain email hiện tại; backend đã cho phép cả hai trong CORS.
7. `.github/workflows/deploy-prod.yml` tạo/push image lên GHCR; không phải bằng chứng frontend được deploy Google. Backend thực tế có trigger Cloud Build riêng.

Nguồn trong repo: `apps/fe-wms/next.config.ts`, `apps/fe-wms/Dockerfile`, `.github/workflows/deploy-prod.yml`, `cloudbuild.yaml`, `apps/fe-wms/src/hooks/useDevicePushNotifications.ts`, các component bản đồ và `apps/be-wms/src/index.ts`.

## 4. Số liệu đo dùng cho dự toán

Khoảng khảo sát: **16/09/2026 00:00 đến trước 16/10/2026 00:00, giờ Việt Nam**, tương ứng `2026-09-15T17:00:00Z` → `2026-10-15T17:00:00Z`.

Nguồn: Google Cloud Monitoring API, gcloud Cloud Build/Artifact Registry. Count được cộng từ delta metric, alignment 86400 giây; gauge storage là giá trị trung bình ngày mới nhất trong kỳ, không phải tổng 30 ngày. Không có phân trang còn sót ở các metric đã truy vấn. Số liệu monitoring không phải hóa đơn/SKU billing.

| Chỉ số | Giá trị |
| --- | ---: |
| Request Cloud Run backend be-wms | 98.449 |
| Billable instance time be-wms | 30.411 giây (~8,45 giờ) |
| Network sent be-wms | 1,72 GiB; gồm nhiều đích, không đồng nhất toàn bộ với Internet egress bị tính phí |
| Request Cloud Run toàn project trong metric | 249.891, gồm backend và các function/service có dữ liệu trong kỳ |
| Billable instance time toàn project | 59.339 giây; khác vCPU-second nếu cấu hình instance/revision khác nhau |
| Firestore document reads | 8.176.156 |
| Firestore document writes | 176.596 |
| Firestore document deletes | 14 |
| Read vượt mức 50.000/ngày theo mô hình đếm ngày | 6.686.700; chỉ là xấp xỉ vì reset quota có múi giờ khác ngày Việt Nam và có thêm quy tắc tính phí/index reads |
| Firestore data + index, gauge mới nhất | 7,25 GiB |
| Firebase Storage nghiệp vụ, gauge mới nhất | 0,58 GiB |
| Bucket backup, gauge mới nhất | 0,56 GiB |
| Firebase Storage network sent trong kỳ | 2,44 GiB; chưa tách loại đích/tính phí |
| Logging bytes ingested | 0,35 GiB |
| Cloud Build | 27 build SUCCESS, tổng elapsed khoảng 117 phút; elapsed không phải kết quả đối soát billable machine-minutes |

Một số functions mới chỉ có dữ liệu vài ngày; tổng 30 ngày không tự dự báo chính xác tải tháng kế tiếp. Không có dataset BigQuery được trả về trong project qua quyền truy cập hiện tại, nên chưa có billing export chi tiết để đối soát SKU. Không khẳng định billing account không có export ở project khác.

## 5. Phương án chi phí sau chuyển

### Phương án A — Cloud Run frontend sau Firebase Hosting

Đưa container Next.js lên Cloud Run Singapore, min instance 0, khởi điểm 1 vCPU/512 MiB; Firebase Hosting phục vụ custom domain/HTTPS và rewrite tới Cloud Run. **Không phải static export**: các route máy chủ vẫn chạy trong container. API và cron giữ nguyên.

Đây là phương án nên thử trước để giảm phí cố định. Chưa chốt triển khai: cần kiểm thử pnpm Docker build, Next routes, PWA, cache, authentication, cookie/header forwarding và route openapi-tester. Firebase Hosting có timeout 60 giây và thường loại cookie ngoài `__session` khi proxy; không áp dụng phương án này nếu kiểm thử phát hiện không tương thích. Không cache công khai dữ liệu cá nhân. Dùng rewrite pinTag để kiểm soát revision cần được đánh giá ở bước triển khai.

### Phương án B — Cloud Run frontend sau Global external Application Load Balancer

Lựa chọn khi cần kiểm soát routing/cookie/timeout tốt hơn hoặc phương án A không đạt kiểm thử. Có phí forwarding tối thiểu khoảng **18 USD/30 ngày** (`0,025 × 720 giờ`), cộng xử lý dữ liệu và băng thông. Không cộng hai lần Internet egress của cùng response qua load balancer và Cloud Run. Không bật thêm CDN/Armor/VPC/NAT nếu chưa có nhu cầu và dự toán riêng.

### Giả định frontend để tính toán

Chưa lấy được thống kê frontend Vercel, vì vậy đây là **kịch bản giả định**, không suy từ 98.449 API request thành số người dùng/pageview:

| Kịch bản | Request đến container/tháng | Instance seconds frontend/tháng | Dữ liệu frontend gửi người dùng/tháng |
| --- | ---: | ---: | ---: |
| Nhẹ | 50.000 | 20.000 | 10 GiB |
| Cơ sở | 100.000 | 50.000 | 20 GiB |
| Cao hơn | 500.000 | 200.000 | 100 GiB |

Thời gian tính tiền bao gồm ảnh hưởng khởi động và concurrency; không phải thời gian CPU thực tế đã đo của frontend. Chọn min 0; duy trì min 1 có thể thêm khoảng **9,72 USD/30 ngày tiền idle** cho 1 vCPU/512 MiB trước free tier, tùy thời gian active. Free tier Cloud Run dùng chung billing account, không cấp lại riêng cho frontend.

Ví dụ tính trước free tier, với giá request-based Tier 1 và 1 vCPU/512 MiB: `50.000 × (0,000024 + 0,5 × 0,0000025) + 100.000/1.000.000 × 0,40 = 1,3025 USD` cho compute/request frontend cơ sở. Chưa gồm băng thông, build, image và log. Firebase Hosting transfer công bố 0,15 USD/GB sau quota; dùng khoảng **3 USD cho 20 GB hoặc 15 USD cho 100 GB trước quota** để dự phòng (GiB/GB cần quy đổi khi đối soát). Ước tính bảo thủ không tự trừ toàn bộ quota dùng chung.

### Dự toán hàng tháng

Các giá trị sau bằng USD, trước thuế/phí thẻ/tỷ giá; không phải báo giá cố định hay số tiền billing đã xác nhận.

| Nhóm | Khoảng cơ sở/tháng | Cách hiểu |
| --- | ---: | --- |
| Cloud Run backend + Functions hiện có | 0–3 | Tải đo được khá thấp; phần miễn phí còn lại ở billing account chưa xác minh; dự phòng cấu hình/khởi động |
| Firestore hiện có | 3–6 | Read cỡ 2 USD theo mô hình quota, cộng data/index storage và dự phòng truy vấn/egress; đây là dữ liệu dùng chung |
| Storage, image, network, tasks, log, build hiện có | 2–10 | Chưa có đầy đủ SKU, kích thước mọi registry và đích network; có khoản có thể nằm trong free quota |
| Scheduler hiện có | 0,70–1 | 10 job ở vùng đã kiểm kê; 0,10 USD/job/tháng, 3 job free dùng chung account nếu còn |
| **Dự phòng nền Google hiện tại** | **8–20** | Khoảng lập ngân sách có làm tròn/dự phòng; không phải tổng hóa đơn Google thực tế |
| **Frontend mới — phương án A, kịch bản cơ sở** | **5–15 tăng thêm** | Compute/request, khoảng 20 GiB transfer, image, build/log; đã có dự phòng |
| **Tổng mô hình project sau chuyển — A** | **15–35** | Nền hiện có + frontend; bao gồm tài nguyên dùng chung JPOS/functions trong project khảo sát |
| **Tổng mô hình project sau chuyển — B** | **35–55** | Cùng kịch bản cơ sở, có load balancer riêng thay Firebase Hosting |
| **Tổng mô hình project — A, tải cao hơn** | **30–60** | Frontend 100 GiB, 500.000 container request, 200.000 instance seconds; backend/dữ liệu giả định gần mức nền |

Nếu chỉ chuyển frontend, công thức đối soát đáng tin cậy hơn khi có hóa đơn là: **Google hiện tại + chi phí frontend tăng thêm − các chi phí Google cũ thực sự được thay thế**. Không cộng lại backend/Firestore đã có trên hóa đơn Google. Không coi ngân sách 15–35 USD là tổng mọi project trong billing account.

Quy đổi lập ngân sách dùng **giả định 26.000 VND/USD**, không phải tỷ giá ngân hàng đã tra: phương án A cơ sở khoảng **390.000–910.000 VND/tháng**; B khoảng **910.000–1.430.000 VND/tháng**. Có thể đặt ngân sách nội bộ ban đầu 1 triệu VND/tháng trước thuế cho A rồi hiệu chỉnh sau kỳ đo; không phải cam kết trần.

Không bao gồm phí đăng ký domain/Mắt Bão, email Brevo, Mapbox, MISA, PayOS/VietQR, Google Workspace, các project Google khác, các frontend Vercel khác, phí hỗ trợ trả tiền, công kỹ thuật chuyển đổi và phí chạy song song Vercel. Chưa xác định mức tiết kiệm ròng do thiếu hóa đơn/gói Vercel.

## 6. Điều kiện để chuyển sang bước tiếp theo

1. Có thể chuẩn bị môi trường thử riêng sau khi được giao bước triển khai, giữ nguyên cả hai domain production trên Vercel.
2. Bổ sung bản đồ/VAPID/build version vào danh mục cấu hình và kiểm thử; không sao chép secret không rõ mục đích.
3. Đọc hóa đơn gần nhất, plan/ngày gia hạn Vercel và thống kê frontend 30 ngày để thay giả định băng thông/request bằng số thực.
4. Xác định phạm vi 4 project Vercel khác trước khi quyết định hủy gói team.
5. Xác minh số tiền Google hiện tại theo project/service để đối soát mô hình; việc project đã liên kết billing không chứng minh đã xem đầy đủ hóa đơn.
6. Giữ domain, API, dữ liệu, scheduler, queue, billing liên kết và các service production nguyên trạng ở bước kiểm kê này.

## Nguồn giá và giới hạn kỹ thuật

Đối chiếu ngày 16/10/2026:

- Cloud Run compute, request, idle và free tier dùng chung: https://cloud.google.com/run/pricing
- Firebase Hosting storage/transfer/domain/SSL: https://firebase.google.com/pricing
- Firebase Hosting proxy Cloud Run, region và timeout: https://firebase.google.com/docs/hosting/cloud-run
- Cookie/cache khi dùng Hosting với Cloud Run: https://firebase.google.com/docs/hosting/manage-cache
- Load balancer, forwarding và xử lý network: https://cloud.google.com/load-balancing/pricing
- Firestore thao tác/storage/free quota: https://cloud.google.com/firestore/pricing
- Scheduler: https://cloud.google.com/scheduler/pricing
- Build: https://cloud.google.com/build/pricing
- Registry: https://cloud.google.com/artifact-registry/pricing

Các bảng giá có bộ chọn region/currency; cần đối soát đúng Singapore, SKU và tiền tệ billing khi hoàn thiện dự toán. Nguồn xác nhận hạ tầng là dữ liệu đọc trực tiếp ở thời điểm kiểm kê, không phải suy luận từ tài liệu kiến trúc cũ trong repo.
