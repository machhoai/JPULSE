# Đề xuất và kế hoạch nâng cấp nghỉ phép: cấp trên trực tiếp, nhắc duyệt và tự hủy

Ngày chốt nội dung ban đầu: 2026-10-05.
Ngày khôi phục tài liệu: 2026-11-09.

Trạng thái: khôi phục từ nội dung đã thống nhất trong cuộc trò chuyện. Tài liệu gồm đề xuất, task list và tiêu chí nghiệm thu; không phải xác nhận chức năng đã triển khai. Nhận định về mã nguồn bên dưới là kết quả khảo sát ngày 2026-10-05, cần kiểm tra lại trước khi code vì repository có thể đã thay đổi.

## 1. Nghiệp vụ đã xác nhận

- Cấp trên trực tiếp lấy từ sơ đồ vai trò hiện có, qua `Role.parent_id`.
- Người xin có nhiều vai trò sẽ chọn vai trò khi gửi đơn; server phải kiểm tra vai trò thực sự thuộc người xin và còn hiệu lực.
- Một người duyệt hợp lệ quyết định là đủ. Không yêu cầu tất cả người thuộc vai trò cấp trên cùng duyệt.
- Nhắc người duyệt hằng ngày. Nếu quá 3 ngày liên tục (72 giờ), kể cả cuối tuần/ngày lễ, chưa xử lý thì tự hủy đơn và hoàn lại phần phép đã giữ.
- Cơ chế nhắc và thời hạn nằm trong cấu hình. Thay đổi cấu hình chỉ áp dụng đơn mới; đơn cũ tiếp tục theo chính sách đã lưu của mình.
- Khi không có cấp trên trực tiếp, chuyển nhiệm vụ cho quản lý nhân sự. Role quản lý nhân sự được chọn trong cấu hình; không nhận diện bằng tên hoặc ID cố định.
- Sau khi cấp trên duyệt, thông báo kết quả đến quản lý nhân sự. HR không phải cấp duyệt tuần tự bổ sung trong luồng thông thường.
- Thông báo qua email và push cho tất cả loại đơn: phép năm, không lương, ốm, thai sản và WFH.
- Không triển khai chức năng ủy quyền trong lần nâng cấp này.
- Giữ mỗi đơn một loại; không tạo đơn trộn nhiều loại theo ngày.
- Khi mở nhiệm vụ duyệt, hiển thị tổng quan số ngày của chính đơn, ngày/thứ bắt đầu và kết thúc, cùng lịch tháng trực quan.

## 2. Hiện trạng theo khảo sát ban đầu

| Thành phần | Hiện trạng lúc khảo sát | Ý nghĩa đối với nâng cấp |
| --- | --- | --- |
| `packages/shared-types/src/users.ts` | Vai trò có `parent_id`; tài khoản có nhiều role theo cơ sở | Tận dụng sơ đồ hiện tại, lưu vai trò người xin chọn |
| `packages/shared-types/src/leaveApproval.ts` | Cấu hình công ty 1–3 cấp, gán `ROLE` hoặc `USER` | Phân biệt luồng cố định cũ và luồng cấp trên trực tiếp mới |
| `leaveRequestService.ts` | Đọc cấu hình, tạo task; thông báo sau transaction và audit | Cần sự kiện thông báo bền vững cùng transaction |
| `leaveNotificationService.ts` | Có thông báo người duyệt/người xin/thiếu người duyệt; chưa gửi email nghỉ phép và kết quả duyệt cho HR | Bổ sung người nhận và kênh |
| `leaveApprovalService.ts` | Kiểm tra mất người duyệt khi tải danh sách; wildcard có thể duyệt ngoài phân công | Cần worker độc lập, kiểm quyền tuyến mới |
| `leaveApprovalAvailabilityRepository.ts` | Chỉ phân công lại task `APPROVER_UNAVAILABLE` | Chưa xử lý người còn quyền nhưng chậm duyệt |
| `leaveRequestCancellationRepository.ts` | Hủy, hoàn phép và giải phóng ngày trong transaction; chỉ chủ đơn được hủy | Tái sử dụng bút toán, thêm entry point hệ thống cho hết hạn |
| `brevoEmailService.ts` | Có SMTP Brevo | Tái sử dụng email, bổ sung template và trạng thái theo người/kênh |
| `pushNotificationService.ts` | Có FCM; không có token thì không gửi | Ghi rõ thiếu thiết bị/quyền hoặc lỗi nhà cung cấp |
| `infra/gcp/deploy-hr-schedulers.ps1` | Có scheduler bảo trì phép và retry đồng bộ tài khoản | Mở rộng worker nhắc, hết hạn và gửi thông báo |
| Hook nghỉ phép/thông báo | Đã có `onSnapshot` | Giữ realtime, bổ sung quyền/query phù hợp |

Chưa đối chiếu môi trường vận hành để kết luận nguyên nhân cụ thể của thông báo không đến. Cần truy vết một đơn thực tế qua danh sách người duyệt, người nhận, bản ghi thông báo, quyền Firebase, index đã triển khai, token và service worker. Cách lọc người đủ quyền duyệt và người nhận hiện khác nhau, nhất là global/inherited scope. Lỗi audit trước dispatch cũng có thể ngăn bước gửi. Không coi nhà cung cấp nhận push là bằng chứng người nhận đã đọc.

## 3. Luồng xử lý

1. Form tải các vai trò còn hiệu lực của người xin tại phạm vi đơn. Một vai trò thì tự chọn và hiển thị; nhiều vai trò thì yêu cầu chọn.
2. Backend kiểm tra phân công, lấy vai trò cha trực tiếp; không suy ra theo tên chức danh và không tự nhảy lên tổ tiên khác.
3. Tìm người thuộc vai trò cha, tài khoản hoạt động, phân công còn hiệu lực và có `leave.approve` tại phạm vi đơn; loại người xin khỏi danh sách. Hướng xử lý ngoại lệ đề xuất: không có vai trò cha hoặc không có người cấp trên hợp lệ thì chuyển về role HR trong snapshot cấu hình.
4. Tạo một nhiệm vụ chung, thông báo tất cả người hợp lệ. Người duyệt mở chi tiết để xem số tổng quan/lịch trước khi quyết định. Quyết định đầu tiên hoàn tất nhiệm vụ; người thao tác sau nhận trạng thái đã xử lý.
5. Duyệt: chuyển phép đang giữ sang đã dùng nếu có, hoàn tất đơn; tạo dữ liệu WFH theo logic hiện có khi đúng loại; thông báo người xin và HR.
6. Từ chối: bắt buộc lý do, hoàn phép đã giữ nếu có, giải phóng ngày đăng ký và thông báo người xin.
7. Còn chờ: nhắc hằng ngày theo chính sách lưu trên đơn. Đề xuất kỹ thuật: mỗi 24 giờ từ lúc server nhận đơn, tức +24 giờ và +48 giờ khi hạn là 72 giờ; đến hạn hủy thì không gửi thêm nhắc.
8. Quá hạn: tự hủy với lý do hệ thống, hoàn đúng allocation đã giữ, giải phóng ngày đăng ký, đóng task; thông báo người xin và người duyệt. Loại không giữ phép không có bút toán hoàn phép.

Thay đổi trạng thái, số dư, lịch đặt ngày, audit và sự kiện thông báo phải nhất quán trong transaction. Không gọi email/FCM bên trong Firestore transaction.

## 4. Snapshot chính sách theo đơn

Các trường dưới đây là thiết kế dự kiến, cần review shared types/schema trước khi triển khai:

| Dữ liệu | Nội dung |
| --- | --- |
| `routing_mode` | Phân biệt luồng cố định cũ với cấp trên trực tiếp mới |
| `requester_role_id`, `requester_assignment_id` | Vai trò được chọn và bằng chứng phân công |
| `approver_role_id` | Vai trò được giao duyệt: cấp trên hoặc HR fallback |
| `routing_reason` | Trực tiếp hoặc chuyển HR do thiếu cấp trên/người hợp lệ |
| `policy_snapshot` | Revision, hạn hủy, lịch nhắc, múi giờ, kênh và role HR |
| `submitted_at`, `expires_at` | Lúc server tiếp nhận và hạn tuyệt đối |
| Trạng thái nhắc | Mốc tiếp theo và khóa chống trùng mỗi kỳ |
| Lý do hủy có cấu trúc | Phân biệt nhân viên hủy với `APPROVAL_TIMEOUT`; giữ trạng thái `CANCELLED` |
| Phiên bản nhiệm vụ | Phát hiện đổi phân công trong lúc thao tác/đồng bộ offline |

Đề xuất đóng băng chính sách khi gửi thành công; bản nháp chưa bắt đầu thời hạn. `expires_at = submitted_at + approval_timeout_hours`; mặc định 72 giờ và chu kỳ nhắc 24 giờ. UI có thể biểu diễn bằng số ngày liên tục. Dùng thời gian server để tính hạn; `action_time` thiết bị chỉ phục vụ audit.

Worker đọc snapshot và hạn của đơn, không lấy cấu hình hiện tại để tính lại. Nhắc hoặc phân công lại không reset hạn. Snapshot giữ dấu vết tuyến; quyền của người thao tác vẫn được kiểm tra tại thời điểm quyết định.

Giữ nguyên các đơn đã gửi theo luồng cũ, không tự bổ sung hạn 3 ngày bằng migration. Đơn lịch sử import không vào worker nhắc/hết hạn. Đề xuất bản nháp gửi sau khi bật luồng mới sử dụng cấu hình tại lúc gửi.

## 5. Độ tin cậy và xử lý đồng thời

- Backend kiểm tra deadline trong transaction quyết định. Không chờ scheduler hủy rồi mới chặn thao tác quá hạn.
- Worker chỉ hủy đơn còn chờ có chính sách hết hạn. Chạy lại trả kết quả đã xử lý, không tạo bút toán hoàn thứ hai.
- Hủy tay, hết hạn và duyệt/từ chối tranh chấp trên cùng trạng thái/phiên bản; chỉ một kết quả terminal được commit.
- Worker có phân trang, batch giới hạn, lease, retry và phục hồi sau crash; chạy khi không ai mở ứng dụng và xử lý backlog khi hoạt động lại.
- Outbox lưu sự kiện cùng nghiệp vụ. Worker gửi email/push và tạo thông báo in-app cho lịch sử/chuông realtime.
- Theo dõi riêng người nhận/kênh: chờ, đang gửi, nhà cung cấp đã nhận, lỗi, thiếu email hoặc thiếu thiết bị. Không đánh đồng SMTP/FCM đã nhận với đã giao hoặc đã đọc.
- Khóa chống trùng gồm đơn, lần gửi, sự kiện, kỳ nhắc, người nhận và kênh. Lease giảm gửi lặp; không cam kết exactly-once tuyệt đối đối với email/push khi crash sau khi nhà cung cấp nhận.
- Trước khi nhắc phải kiểm tra đơn còn chờ, người nhận còn quyền. Bỏ nhắc chưa gửi của đơn terminal; email đã gửi không thu hồi được.
- Email mở đúng chi tiết qua liên kết; quyết định vẫn cần đăng nhập, kiểm quyền và transaction.
- API hủy tay chỉ cho chủ đơn. Hủy quá hạn qua entry point hệ thống có xác thực riêng, không giả danh người xin và không cho client truyền cờ bypass.

## 6. Cấu hình, quyền và ngoại lệ

- Cấu hình có chế độ routing, `hr_role_id` bắt buộc, thời hạn tự hủy, chu kỳ nhắc và revision. Role HR được chọn từ role hợp lệ, backend validate lại và audit mọi thay đổi; không hard-code role.
- HR cần quyền duyệt fallback và xem đơn nhận kết quả trong phạm vi phù hợp. Quan hệ sơ đồ không tự cấp quyền RBAC.
- Khi gửi phải đọc cấu hình nhất quán trong transaction hoặc kiểm revision, không trộn tuyến cũ với timeout mới.
- Luồng mới yêu cầu đúng tuyến được giao kể cả wildcard; không tự duyệt dù giữ cả role cấp trên/HR. Giữ và kiểm thử tương thích riêng cho đơn legacy.
- Đề xuất nếu HR cũng không có người hợp lệ: đơn ở `APPROVER_UNAVAILABLE`, báo người xin và người có quyền quản lý cấu hình/phân công; hạn vẫn chạy, không chuyển role vô hạn hay tự duyệt. Kiểm tra HR sẵn sàng trước rollout.
- Đề xuất nếu tuyến trực tiếp mất hết người hợp lệ khi còn chờ: worker chuyển về HR trong snapshot cũ, audit và thông báo, không reset hạn. Phân công lại có kiểm soát hiện có là xử lý ngoại lệ, không xây chức năng ủy quyền.
- Đổi role HR trong cấu hình mới không đổi snapshot đơn cũ. Người bị khóa/mất quyền không tiếp tục được duyệt vì đã nhận thông báo trước đó.
- Scheduler có xác thực hệ thống và quyền giới hạn; không tạo endpoint nghiệp vụ công khai. Tách worker nhắc/hủy khỏi bảo trì cộng phép để tránh quét tích lũy phép mỗi lần chạy.

## 7. Giao diện tổng quan và lịch tháng

- Hộp việc ưu tiên đơn gần hạn; mở chi tiết từ thẻ hoặc thông báo. Bấm mở không đồng nghĩa thực hiện quyết định.
- Desktop dùng dialog/panel; mobile dùng sheet toàn màn hình, lịch dễ chạm và hành động ở cuối.
- Chi tiết hiển thị nhân viên/mã, vai trò dùng để xin, tuyến trực tiếp/HR, loại đơn, lý do, ngày gửi và hạn tự hủy.
- Ba số luôn có: phép năm, không lương, WFH của chính đơn. Nhóm không có hiển thị 0; ốm/thai sản có tổng riêng, không gán sang phép năm/không lương.
- Tổng là `sum(days[].units)`: nguyên ngày 1, sáng/chiều 0,5. Không tính bằng khoảng cách hai đầu hoặc số phần tử mảng. WFH tiếp tục chỉ nguyên ngày như validation đã có.
- Có thể bổ sung phép đang giữ cho đơn và số dư khả dụng, phân biệt rõ đang giữ/đã dùng; kiểm quyền và realtime.
- Ngày đầu/cuối kèm thứ theo vi/zh, xử lý `LocalDate` đúng múi giờ Việt Nam. Nếu không liên tục, ghi rõ đây là phạm vi đăng ký và chỉ tô ngày thực tế.
- Lịch mở ở tháng có ngày đầu tiên; điều hướng qua các tháng/năm liên quan. Ngày xin có màu và nhãn loại; nửa ngày ghi sáng/chiều; cuối tuần/ngày lễ có chú giải và không tự cộng vào đơn.
- Tách date helpers/calendar grid dùng chung từ lịch nhập, tạo lịch đọc cho duyệt. Không dùng ô disabled làm mờ ngày chọn hoặc khóa chuyển tháng.
- Lịch sử có người thực sự quyết định, lần nhắc, lý do tự hủy và phép đã hoàn.
- Cấu hình ghi rõ chỉ áp dụng đơn gửi mới. Offline hiển thị chờ đồng bộ, hạn bắt đầu khi server nhận; quyết định đồng bộ muộn phải kiểm lại hạn/quyền/trạng thái.
- Giữ Tailwind, light theme, skeleton, vi/zh, gooey-toast promise có description/retry; disable submit khi gửi. Mọi số liệu/trạng thái cập nhật bằng listener, không yêu cầu F5/nút đồng bộ.

Ví dụ: đơn phép năm gồm 06/10/2026 nguyên ngày, 07/10 buổi sáng, 08/10 nguyên ngày. Tổng quan: phép 2,5; không lương 0; WFH 0. Phạm vi Thứ Ba 06/10/2026 đến Thứ Năm 08/10/2026. Lịch đánh dấu ba ngày và nhãn buổi sáng ngày 07/10.

## 8. Kế hoạch triển khai và task list

- [x] Khảo sát rules, shared types, gửi/duyệt/hủy, email/push, scheduler và UI tại thời điểm lập kế hoạch ban đầu.
- [x] Chốt nghiệp vụ, số tổng quan, lịch tháng và snapshot theo đơn qua trao đổi với người dùng.
- [x] Khôi phục tài liệu đề xuất/kế hoạch từ cuộc trò chuyện ngày 2026-11-09.
- [ ] Đối chiếu lại repository hiện tại trước khi triển khai.
- [ ] Giai đoạn 1 — Shared types, schema và cấu hình.
- [ ] Giai đoạn 2 — Routing và transaction nghiệp vụ.
- [ ] Giai đoạn 3 — Outbox, email/push và worker.
- [ ] Giai đoạn 4 — Giao diện xin phép, cấu hình và chi tiết duyệt.
- [ ] Giai đoạn 5 — Kiểm thử, dữ liệu và rollout.

### Giai đoạn 1 — Shared types, schema và cấu hình

Phạm vi: `packages/shared-types/src/leave.ts`, `leaveApproval.ts`, `notification.ts`; controller/service/repository cấu hình, Zod và API frontend.

- Thêm vai trò người xin, routing/snapshot cho đơn mới; giữ `request_type` đơn nhất và tương thích dữ liệu cũ.
- Thêm HR role, timeout, reminder interval, revision và routing mode; thiếu mode ở dữ liệu legacy được hiểu là luồng cố định.
- Định nghĩa outbox và delivery theo người/kênh với retry, lease, attempt, lỗi, skip; không coi `SENT` là đã nhận trên thiết bị.
- API lấy vai trò hợp lệ, preview tuyến và chi tiết/tổng quan. Preview chỉ là gợi ý; backend resolve lại khi gửi.
- Validate thời hạn/chu kỳ dương, giới hạn hợp lý và role hiệu lực; message vi/zh và audit cấu hình.

Đầu ra: contract tương thích, cấu hình HR và snapshot đầy đủ cho đơn mới.

### Giai đoạn 2 — Routing và transaction

Phạm vi: `leaveRequestService.ts`, `leaveApprovalPolicy.ts`, `leaveApproverEligibilityService.ts`, `leaveApprovalService.ts`; repository gửi/quyết định/hủy/phân công.

- Tách resolver dùng chung cho routing, kiểm quyền và người nhận; tận dụng access context để xử lý direct/global/inherited.
- Gửi xác nhận role, cấu hình nhất quán, giữ phép và tạo một task; kiểm revision/hiệu lực dữ liệu quan trọng trong transaction.
- Quyết định kiểm đúng tuyến, trạng thái, phiên bản và hạn; một kết quả thắng, chặn self-approval.
- Tách helper giải phóng phép/lịch khỏi entry point hủy tay/hết hạn; client không chọn system actor.
- Khóa ledger và trạng thái terminal chống hoàn trùng. Audit system actor, old/new, action/sync time và lý do timeout.
- Outbox cùng transaction cho gửi, đổi tuyến, nhắc và kết quả; không để audit ngoài transaction lỗi làm mất thông báo nghiệp vụ đã commit.
- Giữ WFH/chấm công: chỉ tạo work arrangement khi duyệt WFH, không trừ/hoàn phép năm cho WFH.

Đầu ra: tuyến mới và số dư đúng khi cạnh tranh thao tác.

### Giai đoạn 3 — Thông báo và worker

Phạm vi: service thông báo nghỉ phép, notification repository, Brevo, FCM; outbox service/repository và scheduler.

- Template vi/zh có nhân viên, loại, tổng ngày, phạm vi ngày/thứ, deadline và deep link. Gửi riêng người nhận để tránh lộ danh sách email.
- Người duyệt nhận đơn/nhắc; người xin nhận kết quả; HR nhận duyệt hoàn tất và nhiệm vụ fallback. Hủy quá hạn báo người xin/người duyệt; lưu in-app.
- Email/push retry độc lập, có trạng thái thiếu email/token. Một kênh lỗi không làm mất kênh khác.
- Worker claim/lease/recovery, phân trang/backoff; kiểm đơn/người nhận trước nhắc, ưu tiên hết hạn khi đến deadline.
- Đề xuất chạy due work mỗi 5 phút. Quyền quyết định hết đúng `expires_at`; trạng thái hủy được ghi ở lượt scheduler kế tiếp. Giám sát độ trễ và backlog.
- Kiểm token theo user/thiết bị/phiên, tránh local token tài khoản trước làm tài khoản sau không đăng ký; kiểm foreground/background và deep link.
- Cập nhật scheduler script, `.env.example`, indexes và Firestore rules; secrets không vào code, cron có xác thực.

Đầu ra: thông báo bền vững, truy vết lỗi và nhắc/hủy không phụ thuộc người mở app.

### Giai đoạn 4 — Giao diện

Phạm vi: form xin trong `AdminOverviewTab.tsx`, config manager, inbox/timeline, `useMyLeaveRequests.ts`, `useLeaveApprovals.ts`, API/i18n và component/helpers mới.

- Chọn role và preview tuyến/hạn, mô tả rõ lỗi thiếu người duyệt.
- Cấu hình role HR/thời hạn/chu kỳ, giải thích phạm vi áp dụng đơn mới.
- Tách `LeaveApprovalDetail`, `LeaveRequestSummary`, `LeaveRequestCalendar`, helpers ngày/thứ; component tối đa khoảng 200–300 dòng, tái sử dụng khi có lặp.
- Mở chi tiết từ inbox/deep link, xem tổng quan/lịch trước duyệt; từ chối bắt buộc lý do.
- Listener cập nhật chi tiết/inbox/số dư/lịch sử; vô hiệu hóa nút khi người khác xử lý hoặc hết hạn. Backend quyết định cuối cùng.
- Kiểm desktop/mobile, Tailwind/light theme, skeleton, i18n, promise toast và chống click đôi.

Đầu ra: thấy ngay loại đơn, số ngày và ngày/thứ cụ thể.

### Giai đoạn 5 — Dữ liệu, kiểm thử và rollout

- Audit role tree, cycle/role xóa, multi-role assignment, user/profile, quyền HR từng cơ sở, email/token. Audit không tự sửa dữ liệu vận hành.
- Migration dry-run phân biệt legacy/draft/new/import; không thêm deadline hoặc gán cấu hình mới cho đơn đã gửi.
- Deploy backend tương thích, rules/index, UI, worker; chỉ bật luồng mới khi HR và scheduler/outbox sẵn sàng.
- Unit policy, Firestore emulator integration, security rules và browser desktop/mobile; thử email/push bằng tài khoản kiểm thử được phép.
- Lệnh kiểm tra nền tảng dự kiến: shared-types build, BE/FE typecheck, `pnpm test:hr-phase2`, `pnpm test:hr-phase3`, `pnpm test:hr-phase4`, `pnpm test:firestore-rules`; kiểm lại scripts hiện tại và thêm test routing/snapshot/timeout/outbox/calendar.
- Rollback chỉ ngăn đơn tiếp theo vào luồng mới; đơn đã có snapshot vẫn được xử lý theo snapshot. Không dừng worker khi còn đơn mới chờ.

Đầu ra: dữ liệu cũ an toàn, xác minh toàn luồng form → thông báo → quyết định → số dư.

## 9. Tiêu chí nghiệm thu

| Nhóm | Tình huống bắt buộc |
| --- | --- |
| Chọn role | Một role tự chọn; nhiều role bắt buộc chọn; backend từ chối role không thuộc người xin/hết hiệu lực |
| Routing | Kế toán → kế toán trưởng; kế toán trưởng → giám đốc; không có cấp trên → HR cấu hình; chặn tự duyệt |
| Một quyết định | Hai người cùng quyết định chỉ ghi một kết quả và một bút toán sử dụng/giải phóng |
| Snapshot | Đơn A hạn 72 giờ/HR A; đổi 48 giờ/HR B; A giữ cũ, B nhận mới |
| Hạn liên tục | Gửi thứ Sáu hết hạn sau 72 giờ thứ Hai; chặn quyết định đến hạn dù worker chưa chạy |
| Nhắc | Theo snapshot, job trùng không thêm cùng kỳ; dừng sau terminal |
| Hủy | Lặp hoặc đồng thời hủy/duyệt không hoàn hai lần; số dư/lịch/task/audit/outbox nhất quán |
| Worker | Không mở app vẫn chạy; phục hồi crash/lease và backlog |
| Email/push | Mọi loại đơn; kênh lỗi độc lập; thiếu email/token rõ; deep link đúng đơn và kiểm quyền |
| Tổng quan | Phép 2,5 → phép 2,5/không lương 0/WFH 0; loại khác tương ứng; ốm/thai sản tổng riêng |
| Lịch | Đúng thứ/ngày vi/zh, nửa ngày, ngắt quãng, qua tháng/năm; không cộng ngày nằm giữa hai đầu |
| Realtime/offline | Thao tác người khác cập nhật ngay; quyết định offline đồng bộ sau hạn bị từ chối, ledger đúng |
| Legacy | Đơn cũ/import giữ ý nghĩa và không áp hạn mới |

## 10. Quy trình và nguồn khôi phục

Tài liệu được dựng lại từ nội dung đã trao đổi và kế hoạch đã viết trong chat, không lấy từ một commit Git. Tại thời điểm khôi phục, đường dẫn cũ không có file và không tìm thấy lịch sử commit cho file đó bằng `git log --all -- docs/hr/leave-direct-superior-proposal.md`.

Khảo sát ban đầu đã đọc `.agent/rules/rules.md`, shared types và `.agent/skills/frontend-expert/SKILL.md`. Rules repo về Tailwind/gooey-toast được ưu tiên so với gợi ý MUI/inline style/snackbar trong skill. Skill `@brainstorming` bắt buộc theo rules chưa có trong các thư mục skill đã kiểm tra lúc lập kế hoạch; không tuyên bố đã chạy skill đó. Yêu cầu đã được làm rõ trực tiếp qua hỏi/đáp. Các đề xuất kỹ thuật và ngoại lệ có đánh dấu trong tài liệu cần review trước khi triển khai.
