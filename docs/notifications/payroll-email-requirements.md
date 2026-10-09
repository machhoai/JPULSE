# Yêu cầu gửi email bảng công và lương

Ngày ghi nhận: 09/10/2026 (Asia/Saigon).

Tài liệu ghi nhận yêu cầu đã được người dùng xác nhận. Không lưu dữ liệu nhân sự thực tế trong tài liệu này.
Kế hoạch triển khai: [payroll-email-implementation-plan.md](./payroll-email-implementation-plan.md).

## Phạm vi

- Bổ sung lựa chọn gửi bảng công và lương tại `/notification`.
- Soạn bằng QuillJS, gửi email HTML có bố cục phù hợp desktop và mobile.
- Mỗi người nhận nhận nội dung riêng theo dữ liệu của mình.
- Không cần người khác duyệt trước khi gửi.
- Giai đoạn này chưa có chức năng gửi lại kỳ lương cũ.

## Đọc và đối chiếu Excel

- Hỗ trợ cấu trúc bảng trong file mẫu đã cung cấp; chưa cần hỗ trợ mọi kiểu bảng Excel.
- Không bắt buộc chỉ import một file. Mỗi nhóm dữ liệu được chọn file đã import hoặc import file khác, chọn sheet, dòng dữ liệu đầu tiên và kéo thả cột vào trường hệ thống.
- Có file mẫu để tải xuống, không chứa thông tin nhân sự thật.
- `Bảng kê lương`: đọc họ tên, email, chức vụ, số tài khoản, ngân hàng, tổng thanh toán, thuế TNCN và thực nhận.
- `Bảng lương Parttime AMTP`: đọc số ngày làm, số ca 7h, số ca 8h, số ca ngày lễ và các trường được map.
- `Bảng công`: đọc từng khối nhân viên, tiêu đề lặp lại và dữ liệu công theo ngày. Phân biệt dòng dữ liệu, tiêu đề, tổng cộng và cột phụ trợ.
- `Phiếu lương`: chỉ tham chiếu phần phiếu lương làm mẫu; không lấy dữ liệu mẫu hoặc danh sách phụ trong sheet này để gửi cho mọi nhân viên.
- `Tổng kết`: không sử dụng trong chức năng.
- Ghép các nguồn theo họ tên chuẩn hóa. Trùng hoặc không khớp phải được người dùng đối chiếu, không tự chọn một kết quả mơ hồ.
- Người nhận chưa có hồ sơ nhân viên trong hệ thống vẫn được gửi.
- Chỉ đọc số liệu đã chốt trong Excel, không tính lại lương hoặc thuế.
- Nếu số liệu hai bảng lương khác nhau, cảnh báo và ưu tiên số liệu `Bảng kê lương`.
- Cho phép bỏ chọn người có lỗi và gửi phần hợp lệ; cho phép sửa email tại màn hình đối chiếu.
- Lỗi cần giữ thông tin vị trí nguồn: file, sheet, dòng, cột/trường liên quan khi có.

## Nội dung và bảng cố định

- Người soạn tự nhập nội dung và chèn các bảng tại vị trí mong muốn trong email.
- Ba bảng: thông tin nhân viên, bảng công nhân viên, phiếu lương nhân viên.
- Không cho sửa trực tiếp dữ liệu bên trong các bảng.
- Có thể bỏ toàn bộ một bảng và sắp xếp lại vị trí các bảng.
- Bật/tắt cột hoặc trường dạng dọc áp dụng chung cho toàn bộ đợt gửi.
- Phiếu lương có một mẫu cố định, được thiết kế đẹp hơn mẫu Excel.
- Nhãn công: `Số ca 7h`, `Số ca 8h`, `Số ca ngày lễ`.
- Các trường ngày công quy chuẩn, tăng ca, BHXH, tạm ứng được map từ cột khác nếu có hoặc ẩn khi không cần.
- Khi ẩn trường có dữ liệu trong dữ liệu đã đọc, phải hiển thị cảnh báo và yêu cầu người soạn xác nhận. Khi bỏ toàn bộ một bảng có dữ liệu cũng phải cảnh báo và xác nhận.
- Không lấy công thức `Thực lĩnh` của mẫu để tính lại số tiền; thực nhận lấy từ nguồn đã chốt.

## Biến nội dung

- Biến dùng được trong nội dung và tiêu đề email.
- Hỗ trợ tên người nhận `@name@`, tháng hiện tại `@tMonth@`, tháng trước `@(tMonth-1)@`, năm hiện tại `@tYear@` và năm trước `@(tYear-1)@`.
- Tháng và năm được xử lý độc lập theo yêu cầu người dùng; giảm tháng không tự giảm năm.
- Tháng 10/2026: `@(tMonth-1)@/@tYear@` thành `09/2026`.
- Tháng 01/2027: `@(tMonth-1)@/@tYear@` thành `12/2027`.
- Tháng 01/2027: `@(tMonth-1)@/@(tYear-1)@` thành `12/2026`.

## Mẫu nội dung, chữ ký và bản nháp

- Cho phép lưu nhiều mẫu, chọn mẫu khi soạn và dùng lại cấu hình map cho tháng sau.
- Cho phép lưu bản nháp, bao gồm cả dữ liệu công/lương đã đọc để mở lại không cần import. Dữ liệu nháp lưu dưới dạng mã hóa.
- Mỗi mẫu có lựa chọn chữ ký. Không chọn thì dùng chữ ký mặc định từ env.
- Chữ ký từ env luôn xuất hiện là lựa chọn mặc định.
- Người có quyền được thêm nhiều chữ ký bằng HTML; mỗi chữ ký có tên để lựa chọn.
- Email tự động của hệ thống tiếp tục dùng chữ ký mặc định từ env.
- Mẫu nội dung và chữ ký bổ sung dùng chung toàn hệ thống. Mẫu chỉ lưu cấu hình tái sử dụng, không chia sẻ dữ liệu lương hoặc thông tin nhân sự của bản nháp.
- Cửa hàng được gắn vào mẫu; đợt gửi lấy cửa hàng theo mẫu để kiểm tra quyền và giới hạn lịch sử.
- Người dùng tự đặt tên mẫu, ví dụ mẫu cửa hàng 1, và chọn file Excel tương ứng. Tên mẫu không phải bằng chứng phân quyền cửa hàng.

## Preview, gửi thử, tải xuống và gửi thật

- Preview email của người đầu tiên, đồng thời cho phép xem từng người để đối chiếu.
- Hiển thị số lượng email và danh sách họ tên/email của người nhận được chọn.
- Có nút gửi email mẫu tới địa chỉ do người soạn nhập.
- Tải xuống ZIP chứa một file `.eml` cho từng người nhận.
- Không giới hạn số người nhận bằng một ngưỡng cố định.
- Khi nhiều người nhận, chia thành các đợt nhỏ để gửi; ví dụ 100 người thành 4 đợt, mỗi đợt 25 người.
- Có thể gửi lại riêng người gửi lỗi.
- Trong cùng phiên sử dụng chức năng, gửi lại cho người đã gửi thành công phải cảnh báo và yêu cầu xác nhận.
- Cảnh báo gửi lại phải liệt kê rõ họ tên và email của người đã gửi.
- Sau khi bấm gửi, hệ thống tiếp tục gửi ở nền khi người dùng thoát chức năng hoặc đóng trình duyệt; lưu tiến độ từng người.

## Quyền, lịch sử và thông báo

- Tách quyền soạn, tải xuống, gửi và xem lịch sử.
- Lịch sử được giới hạn theo cửa hàng mà người dùng có quyền.
- Lịch sử chỉ ghi các lần gửi thật thành công, lưu nguyên nội dung email của từng lần gửi; không lưu file Excel gốc.
- Email chỉ preview, gửi thử hoặc tải ZIP không vào lịch sử gửi thành công. Tiến độ/lỗi gửi được lưu riêng trong đợt gửi để có thể thử lại.
- Các lỗi và cảnh báo phải cụ thể, dễ hiểu, nêu dữ liệu hoặc vị trí liên quan và hành động người dùng có thể thực hiện.
- Ví dụ thiếu email: `Thiếu email tại dòng 13 trong sheet Bảng kê lương. Vui lòng bổ sung email hoặc bỏ chọn người nhận này.`
- Cảnh báo tiền lệch cần hiển thị người nhận, hai giá trị, vị trí nguồn và nguồn sẽ được dùng.
- Cảnh báo ẩn trường cần hiển thị trường và các nhân viên có dữ liệu bị ẩn.

## Phạm vi cửa hàng đã chốt

- Mẫu/chữ ký dùng chung toàn hệ thống; người nhận không cần hồ sơ nhân viên. Để kiểm quyền lịch sử theo cửa hàng, đợt gửi phải có mã cửa hàng thực tế, không suy ra từ tên mẫu hoặc tên file.
- Người dùng đã chọn gắn cửa hàng vào mẫu. Đợt gửi lưu mã cửa hàng và phiên bản mẫu tại thời điểm tạo; sửa mẫu sau đó không thay đổi phạm vi của đợt đã tạo.

## Ràng buộc dự án và hiện trạng đã kiểm tra

- Tuân thủ `.agent/rules/rules.md`: schema dùng chung, RBAC frontend/backend, audit, soft delete, thời gian thao tác/đồng bộ, trạng thái realtime, local-first, i18n vi/zh, skeleton, Tailwind và goey-toast.
- Dữ liệu nhạy cảm, bao gồm số tài khoản xuất hiện trong email hoặc bản nháp, phải được mã hóa khi lưu; tránh đưa nội dung này vào audit/log dưới dạng plaintext.
- Quy tắc dự án giới hạn mỗi file không phải ảnh ở mức 10 MB; đây không phải giới hạn số người nhận.
- Đã có Quill, ExcelJS, dnd-kit, JSZip, archiver, Nodemailer/Brevo và Cloud Tasks trong dự án.
- `NotificationDispatch` hiện chỉ có IN_APP/EMAIL và kết quả tổng; chưa có mô hình email cá nhân, tiến độ theo người, mẫu/chữ ký hay phạm vi cửa hàng cho đợt lương.
- Hàm gửi Brevo hiện tự thêm chữ ký env. Chức năng mới cần lựa chọn chữ ký và bảo đảm preview, `.eml` và email gửi có cùng chữ ký, không thêm hai lần.
- Lịch sử thông báo hiện chưa dùng quy tắc đọc theo cửa hàng cần cho dữ liệu lương.
- Bộ lọc HTML hiện loại bỏ thẻ style. Cần xem xét yêu cầu email responsive khi thiết kế renderer và lọc HTML an toàn.
- Người dùng đã yêu cầu bỏ qua skill `@brainstorming`; áp dụng chỉ dẫn này cho tác vụ hiện tại, không sửa quy tắc chung của dự án.
- Áp dụng skill `frontend-expert` cho phần giao diện. Các chỉ dẫn chung của skill về MUI/TanStack/useMuiSnackbar không thay thế Next.js, Tailwind, Firebase/Zustand và goey-toast theo quy tắc dự án.
- Chưa tìm thấy `node_modules/next/dist/docs/` tại root hoặc app frontend; trước khi viết mã Next.js phải đọc guide phù hợp theo AGENTS.md.
