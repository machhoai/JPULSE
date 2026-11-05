# Kiểm tra đăng nhập chậm trên production — 05/11/2026

## Kết luận

Cold start có gây chậm thực tế, đã đối chiếu request log và system log bằng cùng `instanceId`. Tuy nhiên không đủ cơ sở quy toàn bộ việc đăng nhập chậm cho `min instances = 0`: API tạo phiên trong mẫu 7 ngày đều dưới một giây; có đợt tải dữ liệu sau đăng nhập gửi nhiều request trùng và có khoảng chờ ngoài các API backend, tại bước xác thực Firebase phía trình duyệt.

Chỉ đọc cấu hình và log, không đổi min/max, CPU, IAM, traffic, dữ liệu ứng dụng hoặc triển khai. Các bản sửa MFA của lượt kiểm tra trước vẫn chỉ ở working tree.

## Nguồn và thời gian

- Project `jw-system-f2104`, region `asia-southeast1`.
- Đọc trực tiếp Cloud Console sau khi người dùng đăng nhập. Máy local không có `gcloud`; credential ứng dụng có sẵn không đủ quyền đọc Logging, nên số liệu dưới đây lấy từ Console bằng tài khoản người dùng, không lấy từ giả lập local.
- Auth query: 7 ngày gần nhất, khoảng 29/10–05/11/2026, chốt lúc khoảng 22:20 ICT. Biểu đồ tài nguyên: 24 giờ gần nhất, tới khoảng 22:09–22:12 ICT ngày 05/11.
- Giờ trong báo cáo là ICT / Asia/Saigon, UTC+7.
- Cloud Run request logs không đo thời gian tải JS, render React, truy cập IndexedDB hoặc xác thực Firebase Auth trên máy người dùng. Vì vậy các số liệu này không phải tổng thời gian từ bấm đăng nhập đến dùng được dashboard.

## Cấu hình thực tế

| Service | Min | Max | Concurrency mỗi instance | Timeout request | Billing |
| --- | ---: | ---: | ---: | ---: | --- |
| `be-wms` | 0 | 3 | 80 | 300 giây | Request-based |
| `fe-wms-preview` (frontend J-PULSE production) | 0 | 3 | 80 | 60 giây | Request-based |

Nguồn: [backend Scaling](https://console.cloud.google.com/run/detail/asia-southeast1/be-wms/scaling?project=jw-system-f2104), [frontend Scaling](https://console.cloud.google.com/run/detail/asia-southeast1/fe-wms-preview/scaling?project=jw-system-f2104).

Các đường percentile trên biểu đồ startup latency 24 giờ có giá trị trong khoảng:

- Backend: 12,141–16,914 giây.
- Frontend: 926,074–2.075,869 ms, tức khoảng 0,93–2,08 giây.
- Backend end-to-end request latency có điểm tới 18,503 giây; frontend tới 7,14 giây. Đây là các điểm trên biểu đồ percentile theo thời gian, không phải thống kê riêng endpoint đăng nhập hay maximum tuyệt đối của toàn bộ request.
- Các điểm percentile CPU backend tối đa khoảng 29,88%, memory khoảng 36,9–45,0%. Chưa thấy dấu hiệu thiếu RAM hoặc CPU cao kéo dài trong biểu đồ đã đọc. Không thể dùng biểu đồ tổng hợp này để loại trừ spike rất ngắn.

## Bằng chứng cold start

Ngày 05/11/2026:

| Thời điểm ICT | Sự kiện |
| --- | --- |
| 22:00:51.041 | `GET /api/auth/session`: 200, 454 ms |
| 22:00:52.106 | `GET /api/leave/approval-tasks/me`: 200, 12,928 giây |
| 22:00:52.107 | Cùng endpoint: 200, 14,617 giây |
| 22:00:52.134 và 22:00:52.157 | Hai log `Starting new instance. Reason: AUTOSCALING` |
| 22:01:04.392 và 22:01:06.195 | Hai log startup TCP probe thành công |

Request 12,928 giây có `insertId = 6aec9a310008d049c2df5e74`. Trường `labels.instanceId` khớp hoàn toàn với log khởi động lúc 22:00:52.157. Đây là đối chiếu cùng instance, không chỉ suy đoán từ việc hai log gần nhau. Request cũng mang nhãn commit `8b2f457bae966a6b3585fc039a01d7ddac6b942c`.

Tại thời điểm này backend đã phục vụ thành công một số request khác; đây là cold start khi scale thêm instance, không phải bằng chứng tất cả instance đã scale về zero. Đặt min 1 giúp tránh scale-to-zero nhưng vẫn có thể cold start khi tăng từ 1 lên 2/3 instance.

Trong khoảng 22:00:51.057–22:00:52.107 có ít nhất 6 request tới `/api/leave/approval-tasks/me`, cùng User-Agent Safari 26.6.1; nhiều request nhanh trong khi hai request phải chờ instance mới. Chưa dùng user ID hay IP để khẳng định các request thuộc cùng một tài khoản.

## API đăng nhập và lỗi phiên

Lọc toàn bộ request backend có URL `/api/auth/`, bỏ OPTIONS, trong 7 ngày. Bộ lọc riêng `sessionLogin`, `login/resolve` hoặc status >=400 trả 18 kết quả:

- 6 lần `POST /api/auth/sessionLogin`, đều HTTP 200; latency: **344, 405, 424, 458, 506, 621 ms**, trung vị 441 ms.
- 9 lần `POST /api/auth/login/resolve`, đều HTTP 200; latency khoảng 3–30 ms.
- 3 lần `POST /api/auth/mfa/verify` HTTP 400: 03/11 lúc 16:39:51.098, 16:40:01.022; 04/11 lúc 09:08:44.028. Theo controller hiện tại, mã MFA không hợp lệ trả 400. Không có response body trong request log để xác nhận nội dung cụ thể của từng phản hồi.
- Truy vấn riêng auth với `(httpRequest.latency >= "6s" OR httpRequest.status >= 400)` chỉ trả lại ba HTTP 400 trên. **Không thấy request auth >=6 giây, 401, 403, 429 hoặc 5xx trong khoảng truy vấn.** Kết quả này không nói rằng mọi endpoint khác đều không có lỗi hoặc không có sự cố ở browser/Firebase.

Một ví dụ cần đo thêm phía trình duyệt: 05/11 lúc 21:33:32.974, `login/resolve` chỉ mất 4 ms; tới 21:33:40.108 mới bắt đầu `sessionLogin`, mất 458 ms. Khoảng giữa hai request khoảng 7,13 giây. Code `useAuth.ts` thực hiện `signInWithEmailAndPassword` và `getIdToken` trong đoạn này. Đây là bằng chứng khoảng chờ nằm ngoài thời gian xử lý hai endpoint backend; chưa có browser timing để chia chính xác cho Firebase Auth, mạng và xử lý phía client.

## Những điểm trong code góp phần tăng thời gian chờ

1. `useLeaveApprovals.ts`: gọi `load()` ngay khi mount; mỗi snapshot config và mỗi snapshot task theo facility lại gọi `load()`. Các callback lỗi cũng gọi `load()`. Chưa có cơ chế gộp request đang chạy; mỗi `load()` lại gọi toàn bộ tập API phù hợp với quyền. Một người có nhiều facility có thể phát nhiều request khi các listener trả snapshot đầu tiên. Hook cũng được dùng cho badge menu, nên có thể chạy ngay khi vào dashboard.
2. `useAuth.ts` và `AuthSessionProvider.tsx` có thể đồng thời gọi `sessionLogin` và `GET /session` khi Firebase phát sự kiện đăng nhập. Log 05/11 lúc 09:54:07 và 21:33:40 cho thấy hai request này sát nhau. Đây là cơ hội tối ưu phần bootstrap, chưa phải bằng chứng nguyên nhân chính của các request kéo dài 12–17 giây.
3. Khôi phục phiên trong `AuthSessionProvider.tsx` timeout 6 giây, fallback tạo phiên timeout 10 giây. Hai ngưỡng ngắn hơn startup backend 12–17 giây. Nếu chính request khôi phục phiên gặp cold start, frontend có thể báo lỗi xác minh dù credential còn hợp lệ. Đây là rủi ro xác nhận từ code và cấu hình; chưa thấy auth request >=6 giây trong log 7 ngày để quy sự cố người dùng cụ thể cho đường đi này.
4. `useAuth.ts` và provider còn chờ `isolateClientDataForAccount`, gồm thao tác IndexedDB. Chưa có telemetry phía browser để định lượng phần này.

## Thứ tự xử lý đề xuất

1. Gộp các lần `load()` trùng/đang chạy ở `useLeaveApprovals`, tránh gọi lại toàn bộ API cho từng snapshot ban đầu; không tải dữ liệu phục vụ badge nhiều lần khi dashboard mount.
2. Với production cần phản hồi ổn định sau thời gian ít truy cập, đặt service-level min 1 cho backend; cân nhắc min 1 frontend nếu thời gian mở trang đầu tiên vẫn là vấn đề. Giữ nguyên max/concurrency trước để đánh giá lại. Việc này tăng chi phí giữ instance; chưa áp dụng trong lượt kiểm tra này. Google mô tả cơ chế và giới hạn tại [minimum instances](https://cloud.google.com/run/docs/configuring/min-instances).
3. Kiểm tra cấu hình startup CPU boost, tài nguyên và chuỗi import/khởi tạo backend; chưa đọc đủ dữ liệu để khẳng định tăng CPU là cần thiết. Min 1 không giải quyết cold start khi scale thêm instance.
4. Điều chỉnh phục hồi phiên để chịu được cold start và retry có giới hạn khi timeout/mất mạng, phân biệt rõ với 401/403; không tự xem timeout là hết phiên hoặc yêu cầu người dùng đăng xuất thủ công.
5. Bổ sung timing phía browser cho resolve identifier → Firebase sign-in/token → session API → dữ liệu quyền → hiển thị MFA/dashboard; không ghi token, mật khẩu hoặc OTP. Khi đó mới đo được thời gian người dùng thực sự chờ và phần Firebase/mạng.

## Truy vấn tái kiểm tra

Auth chậm/lỗi:

```text
resource.type="cloud_run_revision"
resource.labels.service_name="be-wms"
httpRequest.requestUrl:"/api/auth/"
httpRequest.requestMethod!="OPTIONS"
(httpRequest.latency>="6s" OR httpRequest.status>=400)
```

Mẫu cold start:

```text
resource.type="cloud_run_revision"
resource.labels.service_name="be-wms"
timestamp>="2026-11-05T15:00:45Z"
timestamp<="2026-11-05T15:01:20Z"
(httpRequest.latency>="5s" OR textPayload:"Starting new instance" OR textPayload:"STARTUP TCP")
```

Chưa có thay đổi code cho hiệu năng đăng nhập trong lượt kiểm tra này; báo cáo phân biệt số liệu production với suy luận và đề xuất cần thực hiện tiếp.
