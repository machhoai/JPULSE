# Trình soạn HTML chữ ký và live preview

- [x] Dùng CodeMirror nền sáng: số dòng, tô màu HTML, hỗ trợ soạn mã; tải thư viện khi mở trình soạn.
- [x] Tách chính sách HTML chữ ký dùng chung để preview phía trình duyệt khớp các thẻ, thuộc tính và style được backend lưu.
- [x] Preview cập nhật khi gõ, chạy trong iframe sandbox/CSP; không thực thi script, không gọi API gửi email.
- [x] Modal hiển thị hai cột trên desktop, xếp dọc trên mobile; giữ nguyên lưu/xóa/quyền và khóa khi đang xử lý.
- [x] Kiểm tra typecheck, unit sanitizer và browser: nhập/sửa, live preview, nội dung nguy hiểm, chọn chữ ký, lưu/reset, mobile và quyền.

Không deploy hoặc gửi email thật trong bước phát triển/kiểm thử này.

Kết quả 12/10/2026: FE/BE typecheck đạt, shared-types lint đạt, 22/22 unit và 19/19 browser đạt. Đã xem ảnh desktop/mobile. Preview lọc script/event/URL/style không được phép, xử lý cả các tên CSS trùng prototype; raw HTML trong editor không bị viết lại. Live preview không phát sinh POST/PUT khi nhập. Lần browser đầu có một selector sai do table layout dùng role presentation; đã sửa selector và chạy lại toàn bộ đạt. Nhánh làm việc: `codex/email-signature-code-editor`; chưa deploy production.
