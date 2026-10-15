# Trường Excel tùy chỉnh và thứ tự hiển thị

- [x] Chốt nghiệp vụ: nguồn cố định bảng đích; mọi trường được kéo thả; cấu hình lưu trong mẫu/bản nháp; không tính toán trường mới.
- [x] Shared types/helpers: khai báo trường tùy chỉnh có mã nguồn riêng, nhãn, thứ tự độc lập trạng thái ẩn/hiện; tương thích mẫu cũ.
- [x] Import: liệt kê toàn bộ cột có nội dung, thêm/đổi tên trường tại mapping, đọc và giữ dữ liệu khi đối chiếu lại.
- [x] Backend: validate mã/nguồn/tên/mapping/thứ tự; giữ quy trình mã hóa/audit/RBAC hiện tại.
- [x] Soạn và dựng thư: kéo thả bằng chuột/chạm/bàn phím, bật/tắt có xác nhận khi có dữ liệu; preview/EML/snapshot giữ đúng nhãn và thứ tự.
- [x] Kiểm thử unit, API/emulator và browser desktop/mobile. Không gửi email thật, không deploy.

Mỗi trường có ID ổn định, không dùng tên người nhập làm khóa dữ liệu. Hai nguồn có thể có nhãn giống nhau mà không ghi đè nhau. Trường bị ẩn vẫn giữ vị trí và mapping để bật lại. Cột không được map không tự xuất hiện trong email. Nhãn và giá trị được escape khi dựng HTML.

## Tinh chỉnh mapping theo phản hồi

- [x] Đưa các dòng thêm vào ngay dưới trường cố định trong cùng khối mapping, bỏ tiêu đề/hướng dẫn riêng.
- [x] Chỉ hiện nút +; bấm để mở dòng tên trường + chọn cột, tiếp tục thêm bằng nút + cuối danh sách.
- [x] Kiểm tra lại thêm/map/đổi tên/lưu và mobile; giữ nguyên giao diện sắp xếp đã được chấp nhận.

## Phạm vi và cách sử dụng

1. Chọn file/sheet/dòng bắt đầu như hiện tại. Danh sách cột gồm toàn bộ cột có nội dung, kể cả sau cột 100; cột không map không tự đi vào email.
2. Trong từng nguồn, mở Trường dữ liệu rồi bấm dấu + dưới các trường cố định; nhập tên và chọn hoặc kéo cột Excel vào dòng vừa thêm. Có thể đổi tên tại đây; nhãn không được trùng trong cùng bảng.
3. Bấm Đọc và đối chiếu để lấy dữ liệu. Trường mới không tính toán lương và không thay đổi ưu tiên số liệu bảng kê.
4. Ở Trường dữ liệu trong phần soạn, kéo tay nắm bằng chuột/chạm hoặc dùng Space + mũi tên để sắp xếp cả trường có sẵn và trường mới. Bật/tắt không làm mất vị trí; trường có dữ liệu cần xác nhận trước khi ẩn.
5. Lưu mẫu để dùng lại tháng sau; bản nháp giữ cả cấu hình lẫn dữ liệu đã đọc được mã hóa như trước. Lịch sử email cũ không bị sửa.

Dùng các thư viện DnD hiện có, không thêm dependency hoặc hạ tầng. Sửa góc bo của hộp xác nhận để nút không bị khung rounded-full che vùng bấm khi cảnh báo dài trên desktop/mobile.

## Kiểm chứng ngày 15/10/2026

- Shared build/lint, backend build, frontend typecheck và lint các file frontend mới/sửa: đạt.
- 32 unit + 1 SMTP mock: đạt; gồm cột CW (>100), nguồn và mã trường, trùng tên/thứ tự, escape HTML, làm tròn, ẩn/hiện, giữ vị trí và đối chiếu lại.
- Emulator: 12 integration + 20 API + 5 dispatcher + 4 rules: đạt. API PAY-CUSTOM được chạy lại sau tinh chỉnh validation, đạt.
- Browser: 26/28 đạt ở lần toàn bộ; 2 lỗi do dialog rounded-full chặn nút đã sửa; chạy lại 2 ca lỗi và PAY-CUSTOM (3/3) đều đạt. Tổng 28 tình huống đã được kiểm chứng.
- Đã xem ảnh mobile; không tràn ngang. PAY-CUSTOM xác nhận kéo chuột và bàn phím, đổi tên, cảnh báo ẩn dữ liệu, bật lại giữ vị trí, lưu/mở mẫu/bản nháp.
- Kiểm thử gửi chỉ dùng mock SMTP, dùng Firestore emulator; không gửi email thật, không gọi gửi production. Chưa commit/push/deploy.

Tinh chỉnh mapping: bỏ tiêu đề/hướng dẫn, nút + mở dòng mới tự focus, tên và cột cùng hàng với các trường cố định. Ghi nhận khi chọn cột, Enter hoặc rời dòng; Escape hủy dòng chưa tạo. Typecheck/lint đạt; PAY-CUSTOM UI kiểm tra lại luồng thêm/map/đổi tên/lưu và thứ tự, không gửi email thật.
