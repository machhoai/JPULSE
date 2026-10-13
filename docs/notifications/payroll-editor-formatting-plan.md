# Định dạng Quill và link mailto trong email công/lương

- [x] Giữ mailto cùng subject/body đã encode; giữ link HTTP/HTTPS và chặn protocol/subject không an toàn.
- [x] Dựng inline font/size/color/background/strike/script và định dạng dòng header/align/list/indent/blockquote từ Delta, không phụ thuộc CSS Quill trong email.
- [x] Mở toolbar và formats tương ứng, nhãn vi/zh; giữ bảng cố định và xác nhận khi bỏ bảng có dữ liệu.
- [x] Kiểm thử HTML/text/MIME, link/subject tiếng Việt, list nhiều cấp và định dạng trên trình duyệt desktop/mobile bằng SMTP mock.

Không gửi email thật và không triển khai production trong bước phát triển. Giữ các thay đổi rules/permission đang có ngoài phạm vi commit.

Kiểm thử: 29 unit, 18 API, 26 trình duyệt đạt; kiểm tra lại API/editor riêng sau khi cân chỉnh cỡ chữ. Backend build, frontend typecheck và shared-types lint đạt. Quill sizes dùng hệ số tương ứng Snow; email dùng base 14px. Ảnh: .tmp/payroll-editor-formats.png và .tmp/payroll-editor-formats-mobile.png.
