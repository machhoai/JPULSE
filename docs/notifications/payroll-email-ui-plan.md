# Đồng bộ giao diện bảng công & lương

Phạm vi: giao diện hiện có, giữ nguyên dữ liệu, quyền, xác nhận và luồng gửi.

- Dùng token màu, thẻ trắng, viền nhẹ và cỡ chữ gọn theo frontend-rules; tham chiếu trang tạo phiếu nhập kho.
- Chuẩn hóa input, nút, checkbox, bảng đối chiếu, vùng mapping và cửa sổ xác nhận.
- Thêm phân cấp cho mẫu, nhập Excel, nội dung và preview; giữ điều hướng theo bước trên mobile.
- Giảm chiều cao preview, làm rõ trạng thái sẵn sàng/lỗi và tách vùng hành động gửi.
- Kiểm tra typecheck, bộ browser regression trên môi trường giả lập chặn SMTP, ảnh desktop/mobile.

Không gửi email thật trong kiểm thử.

## Kết quả 09/10/2026

- Đã đồng bộ thẻ, input, nút, checkbox, cảnh báo và bảng theo token hiện có.
- Thêm tiêu đề có biểu tượng, điều hướng bốn bước, trạng thái rỗng và số người nhận tại preview.
- Chuẩn hóa Quill, vùng cấu hình trường và chữ ký; giới hạn chiều cao khung email để thao tác gọn hơn.
- FE typecheck đạt. Browser regression: 13/13 đạt, bao gồm mobile không tràn ngang và E2E API/emulator.
- Đã xem ảnh desktop/mobile; dùng dữ liệu QA tổng hợp, transport email giả lập và chặn SMTP thật.

## Sửa thao tác chọn file và định dạng số

- [x] Cho phép chọn Excel/cấu hình cột trong mẫu mới chưa lưu, giữ khóa trong lúc xử lý và kiểm quyền hiện có.
- [x] Làm tròn số hiển thị đến tối đa hai chữ số thập phân trong email và cảnh báo đối chiếu; giữ nguyên dữ liệu Excel, tên và số tài khoản.
- [x] Kiểm thử hộp chọn file bằng click thực tế, lưu lại mapping, định dạng HTML/text/MIME và hồi quy trình duyệt. Không gửi email thật.

Kết quả: 20/20 unit, 14/14 browser, FE typecheck và build shared-types/backend đạt. Lần chạy browser đầu thất bại vì selector kiểm thử cửa hàng dùng label không phù hợp với select chứa options; đổi sang role combobox và chạy lại toàn bộ đạt. SMTP thật bị chặn trong toàn bộ kiểm thử.

## Quản lý chữ ký tại tiêu đề trang

- [x] Tách quản lý chữ ký thành modal có trạng thái/API độc lập, giữ nguyên quyền và phản hồi lỗi.
- [x] Đặt nút tại hàng tiêu đề trang Thông báo; loại bỏ khối quản lý trong tab payroll.
- [x] Cập nhật danh sách lựa chọn sau khi lưu; kiểm tra mở/đóng bằng nút/Escape, desktop/mobile, quyền và hồi quy chữ ký. Không gửi email thật.

Kết quả: FE typecheck đạt, 15/15 browser đạt. Kiểm thử phát hiện focus không trở về nút khi unmount modal bằng Escape; đã sửa và chạy lại toàn bộ. Đã xem ảnh modal mobile, không tràn ngang; quyền bị thu hồi sẽ ẩn nút và đóng modal. SMTP dùng mock, không gửi thật.

## Nhắc bổ sung số tài khoản

- [x] Định nghĩa kiểm tra định dạng STK dùng chung; giữ nguyên số 0 đầu và không áp đặt độ dài chưa được xác nhận.
- [x] Hiển thị “Cần bổ sung gấp” trong trường STK của bảng thông tin nếu thiếu/sai/không đọc chính xác.
- [x] Cảnh báo rõ dòng/sheet/file cho người soạn; riêng lỗi STK không chặn gửi email nhắc bổ sung.
- [x] Kiểm thử import, HTML/text/MIME, STK hợp lệ, thiếu/sai và lỗi độ chính xác. Không gửi email thật.

Người dùng xác nhận chỉ kiểm tra định dạng/khả năng đọc, không kiểm tra độ dài. STK dạng chữ số có ít nhất một chữ số khác 0; giá trị số phải là số nguyên dương đọc chính xác. Không xác minh tài khoản tồn tại tại ngân hàng. Kết quả: 22/22 unit, 16/16 browser và FE typecheck đạt. Đã xem ảnh preview; HTML/text/MIME có nhắc bổ sung, dữ liệu hợp lệ giữ số 0 đầu. SMTP bị chặn/mock, không gửi thật.
