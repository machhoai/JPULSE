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
- [ ] Bổ sung cấu hình Cloud Run, deploy rules/indexes đúng project, kiểm tra indexes sẵn sàng.
- [ ] Deploy backend/frontend đúng commit; lưu thông tin rollback.
- [ ] Tạo recovery scheduler OIDC; kiểm tra xác thực khi không có đợt gửi đang chạy.
- [ ] Kiểm tra read-only/nháp/preview/export và quyền; không gọi gửi mẫu hoặc tạo job gửi thật.
- [ ] Ghi kết quả thực tế, phần chưa xác minh và bàn giao.

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
