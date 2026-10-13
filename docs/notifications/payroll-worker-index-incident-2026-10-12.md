# Worker payroll bị chặn bởi index — 12/10/2026

- Đợt người dùng yêu cầu kiểm tra: 8 email, đã chuẩn bị đủ 8 snapshot, các item QUEUED; counters SENT/FAILED/UNKNOWN đều 0.
- Worker trả HTTP 500, Firestore code 9 FAILED_PRECONDITION trước bước SMTP.
- Truy vấn thực tế xác nhận thiếu hai index COLLECTION của `items`: `status ASC + chunk ASC` và `status ASC + next_retry_at ASC`.
- Hai index đã có trong `firestore.indexes.json`, nhưng lần setup production chỉ chọn collection có tiền tố `payroll_`, bỏ sót `items`. Đây là thiếu sót triển khai, không phải file Excel hay Brevo.
- Người dùng đã cho phép bổ sung index và tiếp tục đúng 8 email thật đang chờ. Không tạo đợt mới hoặc gửi lại item SENT.

## Xử lý

- [x] Kiểm tra metadata/log và tái hiện lỗi bằng truy vấn đọc; không gọi SMTP trong bước chẩn đoán.
- [x] Tạm pause queue `payroll-emails` trong lúc index được tạo; Scheduler vẫn giữ cấu hình.
- [x] Yêu cầu tạo hai index còn thiếu, không xóa index khác.
- [x] Xác nhận cả hai READY và truy vấn worker chạy được.
- [x] Resume queue, theo dõi đợt gốc và lịch sử, báo cáo số SMTP chấp nhận/lỗi/không rõ.

## Kết quả

Cả hai truy vấn worker trả HTTP 200 và đọc đủ 8 item QUEUED trước khi mở queue. Queue được resume; các task đã có tiếp tục xử lý đợt gốc, không gọi endpoint tạo đợt mới hoặc retry người SENT. Kết quả kiểm tra lúc 14:20:38 ngày 12/10/2026 (Asia/Saigon): COMPLETED, total 8, sent 8, failed 0, unknown 0; có đúng 8 bản ghi lịch sử theo job_id. SENT xác nhận SMTP đã nhận thư, không xác nhận inbox/read/delivery cuối cùng. Người dùng đã cho phép gửi tiếp đợt thật này; đây không phải gửi thử dùng dữ liệu QA.

## Hiển thị sau F5

Job ID và mẫu/cửa hàng đang chọn hiện lưu trong state React, nên F5 làm mất phần theo dõi tiến độ và lựa chọn. Đợt gửi nền vẫn nằm trong Firestore. Lịch sử chỉ có các email SENT và hook cần chọn cửa hàng từ mẫu để tải đúng phạm vi; chọn lại mẫu của đợt gửi để xem lịch sử. Chưa thay đổi UI khôi phục tiến độ trong xử lý sự cố này.

Khi rollout tiếp theo, cần kiểm tra toàn bộ index được các truy vấn payroll sử dụng, kể cả các collection chung `items`/`recipients`, thay vì chỉ lọc theo tiền tố collection. Smoke test job ID không tồn tại xác nhận OIDC nhưng không chạy các truy vấn item; không thay thế kiểm tra indexes thực tế.
