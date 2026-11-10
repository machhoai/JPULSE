# Hướng dẫn biểu mẫu và quy trình

Tài liệu chính: `Huong-dan-su-dung-bieu-mau-va-quy-trinh.docx`, phiên bản 1.0, ngày 05/11/2026. Tài liệu gồm 15 trang và 11 hình có khoanh vùng, đánh số thao tác. Các ảnh gốc có đánh dấu nằm trong `assets/` để thuận tiện bảo trì.

## Cơ sở nội dung

Đối chiếu mã nguồn JPULSE tại commit `8b2f457b`, đặc biệt các thành phần trong `apps/fe-wms/src/components/file-library`, trình xem PDF, hooks, bộ kiểm tra upload và services biểu mẫu/quy trình ở backend.

Ảnh được chụp bằng trình duyệt từ chính các thành phần giao diện của repository, chạy cục bộ qua Vite với dữ liệu minh họa và các kết nối dữ liệu thay bằng bộ giả lập. Không phải ảnh từ phiên đăng nhập production. Không thực hiện upload, sửa hoặc xóa dữ liệu thật. Trình xem PDF, việc tải tệp từ Storage và đóng gói ZIP được mô tả theo mã nguồn; chưa nghiệm thu tích hợp với backend thật.

## Tham chiếu tiêu chuẩn

Tiêu chuẩn phù hợp: [ISO/IEC/IEEE 26514:2022](https://www.iso.org/standard/77451.html), *Systems and software engineering — Design and development of information for users*. Các nhóm dưới đây là bảng đối chiếu biên soạn, không phải bảng chứng nhận theo từng điều khoản.

| Nội dung thiết kế thông tin | Vị trí trong hướng dẫn |
| --- | --- |
| Nhận diện tài liệu, phiên bản, đối tượng, phạm vi | Trang 1 |
| Điều hướng và tra cứu theo nhu cầu | Trang 2 và 4 |
| Điều kiện, quyền và giới hạn tệp | Trang 3 |
| Hướng dẫn theo tác vụ, điều kiện và kết quả | Trang 5 đến 13 |
| Minh họa có đánh dấu, chú thích và mô tả thay thế | 11 hình trong tài liệu |
| Khắc phục lỗi và liên hệ hỗ trợ | Trang 14 |
| Thuật ngữ, tài liệu tham khảo và duy trì phiên bản | Trang 15 |

Chưa có toàn văn tiêu chuẩn được cấp phép để kiểm tra đầy đủ từng yêu cầu bắt buộc; chưa có thử nghiệm khả dụng với người dùng đại diện và phê duyệt của chủ nghiệp vụ. Vì vậy chưa thể xác nhận tuân thủ đầy đủ ISO/IEC/IEEE 26514:2022. Trước khi phát hành chính thức, cần đối chiếu toàn văn tiêu chuẩn và nghiệm thu với tài khoản, quyền, tệp và hệ thống tích hợp thực tế.

## Kiểm tra đã hoàn thành

- Kết xuất Word bằng Microsoft Word thành PDF nội bộ, dựng ảnh và kiểm tra trực quan cả 15 trang ở bản cuối.
- Xác nhận đủ 11 hình, vòng khoanh và số chỉ thao tác, không tràn trang, không tách chú thích khỏi hình.
- Xác nhận số trang mục lục và điểm neo liên kết nội bộ.
- Chạy `a11y_audit.py`: high 0, medium 0, low 0.
- Không sửa mã nguồn chức năng của sản phẩm.

Trình kết xuất `render_docx.py` đã được thử nhưng môi trường Windows không có LibreOffice đi kèm. Việc kết xuất cuối sử dụng Microsoft Word và PyMuPDF; không cài thêm phần mềm.
