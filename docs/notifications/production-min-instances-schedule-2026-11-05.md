# Đề xuất lịch minimum instances từ log production — 05/11/2026

## Kết luận

Đề xuất service-level min 1 cho `be-wms` mỗi ngày từ **07:58 đến 23:00**, timezone `Asia/Ho_Chi_Minh`; ngoài khoảng này min 0. Hai phút đầu làm khoảng đệm trước 08:00. Giữ `fe-wms-preview` min 0 trước, vì backend có startup chậm hơn đáng kể. Đây là phương án cân bằng chi phí/độ bao phủ từ dữ liệu hiện có, chưa phải nghiệm tối ưu tuyệt đối hay cam kết loại bỏ mọi request chậm.

Chưa thay đổi cấu hình production hoặc tạo Scheduler job.

## Dữ liệu và phương pháp

- Project `jw-system-f2104`, service `be-wms`, region `asia-southeast1`; đọc Cloud Logging bằng tài khoản đã đăng nhập trong Cloud Shell. Không thay đổi bucket hay bật Logging Analytics.
- Log khởi động: `2026-10-06T00:00:00Z` đến `2026-11-05T16:00:00Z`, phân trang đến hết: 227 dòng `Starting new instance`, gồm 195 `AUTOSCALING` và 32 `DEPLOYMENT_ROLLOUT`. Phân tích giờ dùng ICT. Bao gồm các revision của service, không đồng nghĩa tất cả là revision production hiện tại.
- Request: `2026-10-29T00:00:00Z` đến `2026-11-05T16:00:00Z` (29/10 07:00 đến 05/11 23:00 ICT). Phân trang đến hết: 9.235 request có user-agent Chrome/Safari/Firefox/Edg, loại OPTIONS và `/api/pos/devices/`. Sau khi chỉ giữ path `/api/`, còn **8.751 request**.
- Đây là lưu lượng API từ trình duyệt, gồm dashboard, badge và cấu hình POS; không phải số lần đăng nhập hoặc số người dùng duy nhất. User-agent không đảm bảo tuyệt đối là người dùng thật. Để giảm ảnh hưởng burst, tính thêm số ô 15 phút có ít nhất một request: 304 ô.
- Truy vấn request cả tháng đã đọc 28.000 dòng nhưng bị timeout trước khi hoàn tất; không dùng mẫu thiếu đó để tính tỷ lệ cả tháng. Các tỷ lệ request bên dưới chỉ thuộc cửa sổ tuần đã đọc đầy đủ.

## So sánh lịch

Khoảng giờ theo dạng bắt đầu bao gồm, kết thúc không bao gồm. Độ bao phủ là vị trí thời gian của request, không phải tỷ lệ sự cố chắc chắn được khắc phục.

| Lịch min 1 | Giờ/ngày | Request nằm trong lịch | Ô 15 phút có hoạt động nằm trong lịch |
| --- | ---: | ---: | ---: |
| 08–10 và 16–24 | 10 | 3.670 / 8.751 = 41,94% | 154 / 304 = 50,66% |
| 08–18 và 21–23 | 12 | 7.885 / 8.751 = 90,10% | 253 / 304 = 83,22% |
| 08–22 | 14 | 8.113 / 8.751 = 92,71% | 279 / 304 = 91,78% |
| **08–23** | **15** | **8.622 / 8.751 = 98,53%** | **298 / 304 = 98,03%** |

Khung 22–23h có thêm 509 API request trên 8 ngày trong cửa sổ đo và 19 ô 15 phút có hoạt động. Giữ thêm giờ này có lợi rõ hơn việc tiết kiệm khoảng 14.742đ/tháng. Cuối tuần có 725 API request trong tuần đo; log autoscaling cả tháng có 48 lần vào cuối tuần, nên chưa có cơ sở tắt min 1 toàn bộ thứ Bảy/Chủ nhật.

## Đối chiếu khởi động

| Giờ ICT | Autoscaling trong cửa sổ khoảng 30 ngày |
| --- | ---: |
| 00–08 | 12 |
| 08–10 | 50 |
| 10–16 | 49 |
| 16–18 | 21 |
| 18–21 | 22 |
| 21–23 | 37 |
| 23–24 | 4 |
| Tổng | 195 |

08–23h chứa 179/195 lần autoscaling (91,79%). Riêng từ ngày 29/10 ICT đến hết cửa sổ, có 111/114 lần trong 08–23h (97,37%). Lịch người dùng đề xuất bỏ trống 49 lần autoscaling ở 10–16h.

Trong 8.751 API request có 110 request latency >=5 giây; cả 110 nằm trong 08–23h. Có 103 request cùng instance ID với log khởi động, timestamp request nằm trong khoảng 20 giây trước đến 60 giây sau startup. Đây là đối chiếu liên quan đến startup, không chứng minh cả 103 request đều do scale từ 0 hoặc min 1 sẽ loại bỏ hết.

Kiểm tra trước đó đã xác nhận mẫu 05/11 lúc 22:00:52 khởi động instance mới trong khi instance khác vẫn phục vụ request nhanh; đó là scale-out. Min 1 chỉ giữ một instance tối thiểu, vẫn có cold start khi cần thêm instance. Cần tiếp tục gộp API gọi trùng lúc mở dashboard và tối ưu startup backend. Startup backend quan sát trước đó khoảng 12–17 giây, frontend khoảng 1–2 giây; log auth 7 ngày trước đó không cho thấy auth request >=6 giây. Thời gian người dùng chờ còn có Firebase/mạng và các bước phía browser.

## Chi phí dự toán

Cấu hình đã xác nhận: request-based billing, 1 vCPU và 512 MiB RAM. Dùng đơn giá idle Singapore đã kiểm tra trên trang Cloud Run pricing: CPU $0,0000035/vCPU-second; RAM $0,0000035/GiB-second. Giả định 30 ngày và 26.000đ/USD.

- 15 giờ/ngày: `(1 + 0,5) × 0,0000035 × 15 × 3600 × 30 = $8,505`, khoảng **221.130đ/tháng**.
- Thêm đệm 2 phút/ngày: khoảng 491đ/tháng, tổng giữ ấm khoảng **221.621đ**.
- Hai Scheduler job: tối đa khoảng **5.200đ/tháng** theo giá $0,10/job, trước miễn phí dùng chung billing account.
- Dự toán phần tăng khoảng **227.000đ/tháng**; cộng mốc 275.000đ người dùng đưa ra là khoảng **502.000đ/tháng**.

Đây là ước tính bảo thủ nếu toàn bộ thời gian được tính idle, chưa trừ free tier và thời gian instance vốn đã hoạt động; không phải dự báo hóa đơn chính xác. Chưa cộng thuế hay thay đổi lưu lượng/đơn giá quy đổi của tài khoản. So với lịch 10 giờ/ngày, lịch này tăng thêm khoảng 74.200đ/tháng tiền giữ ấm.

Nguồn: [Cloud Run pricing](https://cloud.google.com/run/pricing), [Scheduler pricing](https://cloud.google.com/scheduler/pricing), [minimum instances](https://docs.cloud.google.com/run/docs/configuring/min-instances).

## Lịch triển khai đề xuất và đánh giá lại

- Job bật: cron `58 7 * * *`, service-level minimum = 1.
- Job tắt: cron `0 23 * * *`, service-level minimum = 0.
- Timezone cả hai job: `Asia/Ho_Chi_Minh`.
- Chỉ áp dụng backend trong bước đầu; giữ max/concurrency và frontend như hiện tại để đánh giá tác động.
- Sau khi triển khai, đo lại 7–14 ngày: p95/p99 của session/dashboard, request >=5 giây ghép instance startup, instance count và billing. Chỉ rút ngắn lịch nếu các khoảng tương ứng thực sự ít người dùng và mức chờ chấp nhận được.

Truy vấn startup để tái kiểm tra:

```text
resource.type="cloud_run_revision"
resource.labels.service_name="be-wms"
textPayload:"Starting new instance"
timestamp>="2026-10-06T00:00:00Z"
timestamp<="2026-11-05T16:00:00Z"
```

Truy vấn request để tái kiểm tra (lọc path `/api/` sau khi đọc):

```text
logName="projects/jw-system-f2104/logs/run.googleapis.com%2Frequests"
resource.type="cloud_run_revision"
resource.labels.service_name="be-wms"
httpRequest.userAgent=~"(Chrome|Safari|Firefox|Edg)"
httpRequest.requestMethod!="OPTIONS"
NOT httpRequest.requestUrl:"/api/pos/devices/"
timestamp>="2026-10-29T00:00:00Z"
timestamp<="2026-11-05T16:00:00Z"
```
