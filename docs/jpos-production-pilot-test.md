# Kịch bản vận hành thử JPOS trên production

Môi trường `jw-system-f2104`, vùng `asia-southeast1`. Dùng [web cấu hình JPOS](https://jpulse.joyworldcityfuns.vn/jpos/login), [JPULSE Hóa đơn](https://jpulse.joyworldcityfuns.vn/invoice-management) và app Tauri tại quầy. Kiểm tra máy quầy đã cập nhật lên [JPOS 2.0.10](https://github.com/machhoai/JPOS/releases/tag/jpos-v2.0.10) trước khi bật thí điểm Giai đoạn 4.

## Khi nào được chạy từng nhóm ca

| Nhóm ca | Điều kiện |
| --- | --- |
| Đăng nhập, chọn cửa hàng, thiết bị, xem cấu hình, tra cứu đơn và hóa đơn | Có thể chạy ngay bằng tài khoản production được phân quyền. Dùng thao tác đọc trước. |
| Bán theo giá hiện hành, xem dữ liệu hóa đơn, hủy nội bộ và chốt ca | Chỉ thực hiện tại quầy, ca và đơn đã được duyệt cho vận hành thử. Các thao tác ghi tạo dữ liệu production thật. |
| Xác nhận qua HK theo giá HK | Cần triển khai bản sửa Functions cho cả đơn thường và gói thành viên. |
| Cấu hình giá Việt Nam trên web rồi bán giá đó trên Tauri, hoặc bán nội bộ khi tắt gửi HK | Cần triển khai Giai đoạn 4 và bật thí điểm cho cửa hàng đã duyệt. Giai đoạn này áp dụng cho vé lượt và hàng lưu niệm. |

Nếu thiếu điều kiện, ghi **Chưa đủ điều kiện**. Dùng đơn thật có sẵn để kiểm tra đường đọc và hóa đơn trước khi tạo đơn thử. Subdomain riêng JPOS và phiên đăng nhập giữa hai domain nằm ngoài phạm vi đợt chạy này.

## 1. Setup trước khi chạy

1. **Chốt phạm vi.** Chọn một cửa hàng, một máy quầy và một ca. Ghi `warehouseId`, mã ca, phiên bản Tauri và tên người vận hành. Dùng tài khoản quản trị có quyền quản lý đúng cửa hàng, tài khoản thu ngân có quyền bán và tài khoản kế toán có quyền đọc hóa đơn. Để riêng một tài khoản thiếu quyền hủy cho ca kiểm tra phân quyền.
2. **Kiểm tra web và máy quầy.** Đăng nhập web JPOS, hoàn tất MFA nếu được yêu cầu và chọn đúng cửa hàng. Trong **Thiết bị**, kiểm tra máy đã hoạt động ở cửa hàng đó. Nếu máy chưa kích hoạt, tạo mã ghép nối cho máy thí điểm và nhập trên Tauri. Trên Tauri, đăng nhập thu ngân, kiểm tra tên cửa hàng, mở ca theo quy trình cửa hàng và thử máy in.
3. **Kiểm tra đường thanh toán.** Chạy tiền mặt trước. Với PayOS, xác nhận kênh nhận tiền, thiết bị hiển thị QR và trạng thái webhook production. Dùng một giao dịch thật đã được duyệt cho ca PayOS có chuyển tiền. Ca tạo QR rồi bỏ giao dịch có thể chạy riêng, trước khi chuyển tiền.
4. **Kiểm tra hóa đơn.** Tại JPULSE, chọn cùng cửa hàng và ngày kinh doanh theo giờ Việt Nam. Kiểm tra trạng thái cấu hình hóa đơn, mốc go-live, VAT và bộ lọc trước khi tra cứu. Thí điểm mặc định dừng ở dữ liệu chuẩn bị hoặc bản nháp. Nếu cần bấm **Xem trước trên MISA**, xác nhận đúng tài khoản cấu hình vì đây là thao tác gọi MISA. Chỉ phát hành hóa đơn thật cho giao dịch được kế toán duyệt. Dùng đơn riêng để thử hủy và kiểm tra trạng thái hóa đơn trước khi hoàn tiền.
5. **Chọn SKU.** Dùng một SKU hiện có để kiểm tra bán thông thường, một SKU chênh giá đã duyệt cho ca 500/200, và một SKU bán nội bộ cho Giai đoạn 4. Chỉ thêm gói thành viên khi đã có tài khoản thử phù hợp và xác nhận việc cấp quyền lợi trên HK. Ghi SKU, tên, giá HK sau thuế và chính sách đồng bộ hiện tại của từng SKU.
6. **Cấu hình SKU thí điểm khi đến mốc.** Vào **Sản phẩm hiển thị**, chọn cửa hàng và mở thẻ sản phẩm. Ghi giá HK trước/sau thuế, sau đó nhập **Giá bán đã gồm VAT (VND)**, **VAT Việt Nam** và **Ngày hiệu lực**. Để **Gửi giao dịch bán sang HK** bật cho SKU chênh giá và tắt cho SKU nội bộ. Kiểm tra riêng **Cập nhật SKU từ HK**. Lưu, tải lại và mở lại thẻ để xác nhận. Sau khi Giai đoạn 4 đã bật, mở giỏ mới trên Tauri để kiểm tra giá thực tế trước khi thu tiền.

`500` và `200` là số minh họa. Nếu SKU thực tế dùng `500.000 đ` và `200.000 đ`, dùng nguyên hai số tiền đó khi chạy và ghi kết quả. Lấy chuẩn số tiền HK cuối cùng từ chính đơn HK, nhất là khi HK có giảm giá riêng.

### Kiểm tra kỹ thuật trước ca 500/200

Chạy PowerShell để xem các dịch vụ đang hoạt động. Các lệnh dưới đây chỉ đọc cấu hình triển khai.

```powershell
gcloud run services list --project=jw-system-f2104 --region=asia-southeast1 --format='table(metadata.name,status.latestReadyRevisionName)'
gcloud functions describe onOrderLocalPaid --gen2 --project=jw-system-f2104 --region=asia-southeast1 --format='value(state,updateTime)'
gcloud functions describe getPosAuthSession --gen2 --project=jw-system-f2104 --region=asia-southeast1 --format='value(state,updateTime)'
```

Đối chiếu revision và thời điểm triển khai với lần phát hành chứa bản sửa, vì trạng thái `ACTIVE` chỉ xác nhận hàm đang chạy. `onOrderLocalPaid` xử lý đơn thường, còn `getPosAuthSession` chứa thao tác chốt bán gói. Trước khi triển khai hai hàm này, kiểm tra cấu hình HK đúng cửa hàng và rà danh sách đơn `SYNC_FAILED` có thể được thử lại tự động. Nếu chỉ cập nhật bản sửa đồng bộ, máy quầy tiếp tục dùng app hiện hành. Để thử giá cấu hình từ web qua Tauri, cần thêm bản máy quầy và backend đã áp dụng Giai đoạn 4.

Thứ tự triển khai Giai đoạn 4 là worker `onOrderLocalPaid` và `retryFailedOrderSyncs`, các callable danh mục và thanh toán (`getPosAuthSession`, `getPosProducts`, `payosPayment`), webhook `payosWebhook` và tác vụ `reconcilePendingPayOSPayments`, sau đó JPULSE và Tauri. Giữ thí điểm tắt trong lúc cập nhật. Kiểm tra các SKU đã chuẩn bị cho đúng cửa hàng, lưu lại SKU cần giữ bản sao danh mục nội bộ và bấm **Bật thí điểm tại cửa hàng**. Nếu phải tạm dừng, đơn mới quay về cơ chế bán hiện hành và đơn đã phát QR giữ dữ liệu đã chốt.

## 2. Thứ tự chạy ca

| Mã | Thao tác | Kết quả đạt |
| --- | --- | --- |
| P01 | Đăng nhập web JPOS, hoàn tất MFA nếu hiện, chọn cửa hàng. Chuyển giữa **Tổng quan**, **Thiết bị**, **Đơn hàng**, **Sản phẩm hiển thị** và **Cấu hình**. | Đúng thương hiệu và cửa hàng đã chọn. Quyền trên web đúng với tài khoản. Danh mục có nhóm, giá HK và giá Việt Nam hoặc nhãn chưa cấu hình. |
| P02 | Đăng nhập Tauri, kiểm tra kích hoạt, mở ca, xem sản phẩm và tra một đơn cũ. In thử nếu có thiết bị. | Đúng cửa hàng, ca và dữ liệu. Sản phẩm hiện hành hiển thị đúng. |
| P03 | Bán tiền mặt một SKU theo giá hiện tại, không dùng voucher. Ghi mã đơn và in biên lai/vé theo SKU. Tìm đơn trên web JPOS. | Giỏ, tiền thu, biên lai và chi tiết đơn Việt Nam cùng số tiền. Nếu SKU có gửi HK, đơn có đúng một mã HK và trạng thái đồng bộ hợp lệ. |
| P04 | Mở đơn P03 trong JPULSE Hóa đơn theo cửa hàng và ngày kinh doanh. Đối chiếu dòng hàng, số lượng, VAT, giảm giá nếu có và tổng thanh toán. | Dữ liệu chuẩn bị hóa đơn khớp đơn Việt Nam. Tra theo mã đơn JPOS. Ghi trạng thái hóa đơn, dừng trước phát hành. |
| P05 | Tạo QR PayOS cho đơn riêng. Chạy một lượt hủy QR trước khi trả. Với giao dịch đã được duyệt, tạo QR riêng, chuyển đúng số tiền và tải lại trạng thái đơn. | QR bỏ đi không ghi doanh thu. QR đã trả ghi nhận một lần, đúng số tiền Việt Nam và không bị ghi nhận lại khi tải lại. |
| P06 | Dùng đơn thử riêng đã thu tiền, chưa bị khóa vì hóa đơn hoặc thanh toán. Mở **Đơn hàng**, xem khoản hoàn, nhập lý do. Xác nhận hoàn chỉ sau khi đã trả tiền theo quy trình. Tải lại đơn. | Ghi nhận hủy và hoàn đúng số tiền Việt Nam một lần. Nếu đơn có mã HK, mã tra cứu vẫn còn và trạng thái HK giữ nguyên. Đơn đã hủy không được chọn để phát hành hóa đơn mới. |
| P07 | Với tài khoản thiếu quyền, mở chính đơn thử. Với đơn có hóa đơn đang xếp hàng hoặc đã phát hành, chỉ kiểm tra màn hình điều kiện hủy. | Tài khoản thiếu quyền không hủy được. Đơn bị khóa bởi hóa đơn không thể hủy từ JPOS. |
| P08 | Chốt ca và đối chiếu biên lai, phương thức thanh toán, số liệu doanh thu và khoản hoàn. | Tiền thu và khoản hoàn khớp số liệu thực tế. Nếu hoàn vào ca khác, khoản hoàn thuộc thời điểm/ca hoàn tiền. |
| P09 | Kiểm tra luồng tra cứu thành viên và số dư trên Tauri. Dùng tài khoản và thẻ được duyệt nếu cần thử tạo mới, nạp bù hoặc cấp thẻ. | Tra cứu theo cơ chế hiện hành. Các thao tác ghi được xác nhận theo đúng tài khoản, loại quyền lợi và số lượng. |

## 3. Ca trọng tâm sau khi đủ điều kiện

| Mã | Thao tác | Kết quả đạt |
| --- | --- | --- |
| HK01 | Mở giỏ mới cho SKU giá Việt Nam 500, HK 200, bật gửi HK. Mua một đơn vị bằng tiền mặt. Đối chiếu biên lai, web JPOS, dữ liệu hóa đơn JPULSE và chi tiết đơn HK. | JPOS thu 500, hóa đơn dùng 500, HK có đúng một đơn ở 200. Nếu cần kỹ thuật đối chiếu, `pos_orders.totalAmount = 500` và `remoteActualPayment = 200`. |
| HK02 | Chạy với hai đơn vị hoặc áp voucher JPOS đã duyệt. Lấy tổng thực tế hiện trên từng bên. | Việt Nam dùng tổng đã thu sau voucher và VAT Việt Nam. HK xác nhận theo số tiền HK tính cho đúng mã và số lượng. Voucher JPOS không được dùng để ghi đè số tiền HK. |
| HK03 | Nếu đơn thử thật sự báo đồng bộ lỗi sau khi có mã HK, kiểm tra trạng thái HK trước, rồi dùng chức năng thử lại một lần theo quyền. Nếu không có đơn lỗi phù hợp, dùng kết quả kiểm thử giả lập cho nhánh này. | Dùng lại mã và số tiền HK đã lưu. Không tăng số đơn HK hoặc ghi nhận thanh toán Việt Nam lần hai. Không thay kết nối HK hay tạo lỗi chủ động trên production. |
| HK04 | Dùng gói thành viên đã duyệt với giá khác nhau, mở giao dịch cho một thành viên thử. Đối chiếu đơn Việt Nam, giao dịch HK và lịch sử quyền lợi. | JPOS thu theo giá Việt Nam, HK ghi số tiền HK và quyền lợi chỉ được cấp một lần. |
| HK05 | Sau khi bật Giai đoạn 4, bán riêng một SKU đã tắt **Gửi giao dịch bán sang HK**. Tải lại và đối chiếu lịch sử. Thử thêm cùng lúc một SKU nội bộ và một SKU gửi HK vào giỏ mới. | Đơn nội bộ hiện **Hoàn tất nội bộ**, có thể xem, in lại và chuẩn bị hóa đơn theo mã JPOS. HK không nhận đơn. Giỏ trộn bị yêu cầu tách thành hai đơn trước khi thu tiền. |

## 4. Ghi kết quả và điều kiện dừng

Mỗi ca ghi mã ca test, cửa hàng, máy quầy, thời điểm Việt Nam, mã đơn JPOS, mã đơn HK nếu có, phiên bản app, giá giỏ, tiền đã thu, tổng hóa đơn, số tiền HK, trạng thái và ảnh bằng chứng đã che dữ liệu khách. Đánh dấu **Đạt**, **Lỗi** hoặc **Chưa đủ điều kiện**.

Dừng tạo đơn thử nếu sai cửa hàng, sai số tiền ngay trên giỏ/QR, số tiền hóa đơn lệch đơn Việt Nam, HK nhận sai số tiền hoặc sinh thêm đơn, hoặc có khoản tiền chưa xác định trạng thái. Giữ mã đơn để đối chiếu trước khi thử lại. Kết thúc ca, đối chiếu doanh thu, khoản hoàn và quyền lợi đã cấp với người phụ trách cửa hàng và kế toán trước khi mở rộng.
