# Reply-To, CC, BCC cho email bảng công và lương

- [x] Chốt: chỉ Reply-To, không tiêu đề phản hồi riêng; CC/BCC chung từng email trong đợt.
- [x] Thêm cấu hình tùy chọn vào composer và snapshot, tương thích dữ liệu cũ.
- [x] Kiểm tra địa chỉ ở backend; lưu cùng mẫu/bản nháp, snapshot mã hóa giữ nguyên khi gửi lại.
- [x] Hiển thị cấu hình khi soạn, preview và lịch sử; cảnh báo CC/BCC nhận dữ liệu lương.
- [x] Truyền header qua SMTP và EML; email mẫu bỏ CC/BCC.
- [x] Kiểm thử unit/API/browser bằng mock, không gửi email thật.

CC hiển thị với người nhận; BCC ẩn khỏi header thư gửi thật. File EML tải xuống dành cho người có quyền tải được giữ BCC để đối chiếu. Lịch sử giao thư tiếp tục phản ánh người nhận chính, không gộp webhook của CC/BCC vào trạng thái nhân viên.

## Kiểm chứng 15/10/2026

- 30 unit, 1 SMTP transport mock, 12 integration, 19 API, 5 dispatcher, 4 Firestore rules: đạt.
- Browser PAY-ROUTING: nhập nhiều địa chỉ, lưu/mở lại bản nháp, bố cục 390px không tràn ngang: đạt; đã xem ảnh mobile.
- Backend build, frontend typecheck, shared lint, diff whitespace: đạt.
- Header injection/địa chỉ lỗi bị từ chối; danh sách trùng và trùng người nhận chính được loại khi dựng thư.
- SMTP nhận CC nhưng từ chối nhân viên không được ghi SENT. CC lỗi riêng không đổi kết quả người nhận chính; webhook CC bị bỏ qua.
- Email mẫu chỉ gửi đến địa chỉ thử đã nhập, vẫn có Reply-To, không CC/BCC. File EML chứa BCC phục vụ đối chiếu có phân quyền; SMTP thật ẩn BCC theo chuẩn Nodemailer.
- Lịch sử lưu snapshot mã hóa có cấu hình; gửi lại dùng cấu hình snapshot cũ. Không sửa lịch sử đã tồn tại.
- Không gửi email thật; không deploy; không thay đổi rules/index/quyền đang có của công việc khác.
