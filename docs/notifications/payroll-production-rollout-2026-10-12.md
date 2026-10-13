# Triển khai payroll production — 12/10/2026

## Phạm vi và hiện trạng đã xác minh

- Commit chức năng: `baa1a0927a71cd25598f040b4645a6449cce489e`, nhánh `codex/payroll-email-notifications`.
- Project Google Cloud: `jw-system-f2104`; backend Cloud Run `be-wms`, region `asia-southeast1`.
- Backend trước rollout: revision `be-wms-00315-hww`, image SHA `8223f3a5178c742fd02b560a97c0a20fc6bf41ff`.
- Backend URL: `https://be-wms-cxwygwr7wa-as.a.run.app`; frontend production: `https://erp.joyworldcityfuns.vn` (Vercel).
- Có Cloud Build trigger ngoài repository trên nhánh `main`, nên thay đổi main có thể tự deploy backend.
- Bucket hiện có: `jw-system-f2104.firebasestorage.app`, region `US-EAST1`. Giữ bucket hiện tại; không di chuyển dữ liệu.
- Chưa có biến payroll, secret khóa, queue payroll hoặc scheduler recovery riêng trên prod.
- Có 8 Scheduler job và 2 Cloud Tasks queue hiện hữu; không thay đổi các chức năng đó.

## Chi phí đã báo, chờ xác nhận

- Scheduler mới: USD 0,10/job/31 ngày ngoài quota miễn phí.
- Secret Manager mới: USD 0,06/phiên bản/tháng ngoài quota, cộng phí truy cập.
- Cloud Tasks: 1 triệu thao tác/tháng đầu tiên miễn phí theo tài khoản; sau đó USD 0,40/triệu thao tác.
- Build, Cloud Run, Firestore/indexes, Storage và network tính theo mức sử dụng; recovery định kỳ cũng tạo request và đọc dữ liệu.
- Không cam kết tổng chi phí cố định; không nâng gói Vercel/Brevo.
- Nguồn: https://cloud.google.com/scheduler/pricing ; https://cloud.google.com/secret-manager/pricing ; https://cloud.google.com/tasks/pricing

## Task triển khai

- [x] Kiểm tra tài khoản, project, revision, env theo tên (không log secret), bucket, queue/job hiện có.
- [x] Nhận xác nhận các chi phí mới trước khi tạo/bật hạ tầng hoặc merge kích hoạt build.
- [x] Xác minh project frontend, commit, môi trường và cấu hình deploy Vercel.
- [x] Chuẩn bị secret V1 phù hợp với dữ liệu đã mã hóa; giữ nguyên các phiên bản khóa có dữ liệu.
- [x] Tạo service account payroll và IAM tối thiểu; queue giới hạn concurrency/rate.
- [x] Bổ sung cấu hình Cloud Run, deploy rules/indexes đúng project, kiểm tra indexes sẵn sàng.
- [x] Deploy backend/frontend đúng commit; lưu thông tin rollback.
- [x] Tạo recovery scheduler OIDC; kiểm tra xác thực khi không có đợt gửi đang chạy.
- [x] Kiểm tra read-only, tương thích nháp mã hóa, biên xác thực API và worker; không gọi gửi mẫu hoặc tạo job gửi thật.
- [x] Ghi kết quả thực tế, phần chưa xác minh và bàn giao.

## Ràng buộc kiểm thử

Không gửi email thật. Không tự mở rộng quyền payroll cho toàn bộ nhân viên. Không gọi worker/recovery nếu đang có đợt gửi thật chờ xử lý; kiểm tra trạng thái trước. Không in khóa, credential hoặc dữ liệu lương trong log/báo cáo.

Người dùng đã xác nhận triển khai hạ tầng tính phí theo sử dụng ngày 12/10/2026. Frontend được xác minh ở team `mach-hoai-s-projects`, project `bduck-system-fe-wms`, domain `erp.joyworldcityfuns.vn`; production hiện tại ở SHA `8223f3a5`, preview chức năng ở SHA `baa1a092` đã READY. Không nâng gói dịch vụ.

## Tiến độ setup

- Secret `payroll-encryption-key-v1`, version 1: dùng đúng khóa hiện tại, kiểm tra giải mã một draft tồn tại đạt; không log nội dung.
- Service account `payroll-task-invoker@jw-system-f2104.iam.gserviceaccount.com`: Cloud Run Invoker; runtime backend được actAs danh tính này và enqueue trên queue riêng.
- Queue `payroll-emails`, region `asia-southeast1`: concurrency 1, rate 1/s, retry tối đa 5, backoff 30–300s.
- Backend đã được bổ sung env payroll và secret reference, giữ toàn bộ env/image cũ trong revision setup `be-wms-00316-rnc`.
- PR triển khai: https://github.com/machhoai/JPULSE/pull/2 .
- Live Firestore có khối POS payment realtime ngoài repo; đã đưa khối này vào rules feature để giữ hành vi production khi bổ sung payroll.
- Metadata: có một draft payroll và không có job payroll đang chờ tại thời điểm kiểm tra. Chưa bật Scheduler.

## Kết quả rollout

- PR #2 và #3 đã merge; commit production cuối: `3bbac2f144c8795705b69b2a05bcbe2ac2f4eef4`.
- CI production GitHub run `38197588219`: SUCCESS. Hai lỗi import/order trong renderer đã được sửa, `lint:employee-contracts` local đạt.
- Backend Cloud Build `69b3a63a-6255-4b5e-8d14-7ee423ef5601`: SUCCESS; source archive chỉ chứa file đã commit cần cho Dockerfile backend, không chứa env local.
- Image backend có SHA trên; digest `sha256:a2ebe54a9f36277b1d3d70b8eef4481d8aa164e9483578a4054ff91ecca90057`.
- Revision cuối `be-wms-00318-f26`, Ready, 100% traffic. Giữ toàn bộ cấu hình cũ; xác nhận riêng năm biến payroll và secret reference version 1 sau deploy.
- Frontend Vercel deployment `dpl_8974PXrZuuXmsCJ487ufoSTJ2coL`: READY, production, cùng SHA; alias `erp.joyworldcityfuns.vn` đã trỏ deployment này.
- Firestore ruleset mới `ed967fa2-fd7e-4af1-a54a-c58942bba927`, giữ rules POS hiện hữu. Hai index payroll đã tạo thành công (history và drafts); không xóa indexes khác.
- Bổ sung sau sự cố đợt 8 email ngày 12/10: hai index COLLECTION `items` (`status+chunk`, `status+next_retry_at`) ban đầu bị bỏ sót khi lọc tên collection. Đã tạo đủ, mở lại queue và xác nhận đợt gốc COMPLETED với 8 SENT/8 history. Xem [báo cáo sự cố](./payroll-worker-index-incident-2026-10-12.md).
- Scheduler `payroll-email-recovery`: ENABLED, mỗi 5 phút, OIDC đúng service account/audience, timeout 120s.
- Kiểm tra task trỏ job ID không tồn tại: HTTP 200 trên revision cuối, không có người nhận/không tạo email lịch sử. Recovery được kiểm tra lúc không có pending job: HTTP 200 cả chạy thủ công và lượt định kỳ 03:10 UTC (10:10 Asia/Saigon).
- API catalog không có đăng nhập trả 401; trang `/notification` trả 200. Tương thích khóa với draft hiện có được xác minh trong bộ nhớ, không log dữ liệu.
- Không tự cấp thêm quyền cho nhân viên; role có thể chọn các quyền payroll/chữ ký mới trong UI. Chưa kiểm tra bằng phiên đăng nhập thực tế trên prod hoặc gửi/inbox thật. Luồng nháp/preview/export có bằng chứng emulator/browser đã ghi trong báo cáo test.
- Lỗi truyền env qua PowerShell ở revision setup đã được phát hiện bởi smoke test OIDC và sửa bằng tham số được quote đúng; không có dữ liệu mới bị mã hóa bằng khóa sai.

## CI backend cần kết nối lại

Cloud Build trigger cũ vẫn gắn `machhoai/bduck-system`, trong khi repo đã đổi tên thành `JPULSE`. Không có build tự động khi merge; cập nhật repo bằng CLI/API bị INVALID_ARGUMENT/FAILED_PRECONDITION. Rollout hiện tại đã hoàn tất bằng Cloud Build source archive. Cần kết nối lại repo GitHub trong Cloud Build Console rồi gắn trigger để các lần push sau tự deploy backend. Không thay đổi/xóa trigger cũ hoặc mở rộng quyền GitHub App để né lỗi.

## Rollback và vận hành

- Trước rollback, pause queue `payroll-emails` và scheduler `payroll-email-recovery`; kiểm tra job đang xử lý để tránh gửi lặp.
- Revision backend trước payroll: `be-wms-00315-hww`; revision setup còn image cũ: `be-wms-00316-rnc`.
- Frontend trước payroll: Vercel `dpl_FktgSKv96yBYvb8L13HwZ5GXMAfW` (SHA `8223f3a5`).
- Giữ secret V1 và dữ liệu mã hóa; không xóa/ghi đè khóa khi rollback. Snapshot release rules trước rollout đã lưu dưới `.tmp` tại máy triển khai; ruleset trước là `a9f31595-350f-4014-b616-0b82bb1ba8d0`.
- Chi phí mới đã được người dùng chấp thuận: Scheduler/Secret Manager ngoài free tier theo giá ở trên, cùng mức sử dụng Tasks, build, Cloud Run, Firestore, Storage/network. Không nâng gói Vercel/Brevo; không cam kết tổng hóa đơn cố định.
