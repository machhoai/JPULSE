# Test case bảng công & lương — P8 kiểm thử không gửi mail thật

Trạng thái: đã thực hiện 57 test tự động PASS. Không rollout/deploy. Chỉ dữ liệu giả, emulator `demo-payroll-*`, SMTP mock; MIME stream không gửi qua mạng.
Chi tiết và giới hạn: [payroll-email-test-results.md](./payroll-email-test-results.md). Checklist là nhóm phạm vi; không khẳng định mọi tổ hợp edge case đã chạy.

## Checklist

- [x] PAY-01: đọc cấu trúc mẫu, nhiều file/sheet, dòng bắt đầu và map cột đổi vị trí.
- [x] PAY-02: bỏ tiêu đề/tổng/cột phụ; tách đúng công của từng người.
- [x] PAY-03: Unicode/khoảng trắng/trùng tên/không khớp; đối chiếu không dùng dữ liệu người khác tự động.
- [x] PAY-04: email thiếu/sai/trùng/sửa/bỏ chọn; lỗi có file, sheet, dòng.
- [x] PAY-05: số tiền lệch cảnh báo, ưu tiên bảng kê; không tính lại thuế/net.
- [x] PAY-06: công thức có/không có cached result, lỗi Excel, blank và zero, STK số 0 đầu/không an toàn.
- [x] PAY-07: biến trong subject/body, định dạng chia token, tháng 01/2027, token lạ và dữ liệu chống HTML/header injection.
- [x] PAY-08: hide/remove/cut/undo/redo/di chuyển khối; xác nhận/hủy và cảnh báo lại khi import mới.
- [x] PAY-09: chữ ký mặc định/tùy chọn/sửa/xóa; chính xác một chữ ký và filter HTML an toàn.
- [x] PAY-10: nháp mã hóa, mở lại đủ người theo thứ tự; phiên bản xung đột/ghi dở/mất quyền/đăng xuất.
- [x] PAY-11: API và Firestore rules: quyền tách biệt, người tạo, cửa hàng khác, template chung không mở nháp.
- [x] PAY-12: MIME UTF-8, subject/to/body/table đúng người, ZIP không trộn nội dung; export không có lịch sử gửi.
- [x] PAY-13: 100 người, nhóm 25, concurrency tối đa 3, độc lập mỗi To, tiếp tục qua nhiều lần worker.
- [x] PAY-14: request idempotency, worker trùng, lease còn/hết, fencing, crash và recovery/outbox.
- [x] PAY-15: lỗi 4xx/backoff/giới hạn retry, lỗi chắc chắn, UNKNOWN và xác nhận gửi lại cùng phiên.
- [x] PAY-16: SMTP mock đã nhận nhưng lưu kết quả lỗi: retry transaction, không gọi SMTP lần hai.
- [x] PAY-17: lịch sử chỉ SENT; counters khớp; cập nhật realtime và quyền tải lịch sử.
- [x] PAY-18: browser desktop/mobile, Quill, đối chiếu, preview, wizard, nháp local và workflow dùng transport giả.
- [x] PAY-19: regression chữ ký email thường và build/typecheck sau sửa lỗi.

## Nguyên tắc an toàn và bằng chứng

- Test runner không nạp `.env.local`, không dùng service account thật hoặc kết nối database production.
- Fixture email dùng miền reserved `.invalid`; đây là lớp phụ, không thay cho việc chặn SMTP thật.
- Các test gửi thực thi service/worker với transport thay thế. Bất kỳ tạo SMTP transport thật nào trong tiến trình test phải bị chặn.
- Test emulator yêu cầu hostname loopback và project `demo-payroll-qa`; fixture chỉ ghi vào emulator.
- Báo cáo cuối ghi rõ PASS/FAIL/SKIP, lỗi được sửa và giới hạn. Không ghi các case chưa chạy là PASS.
