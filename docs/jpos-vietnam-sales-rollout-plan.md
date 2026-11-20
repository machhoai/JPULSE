# Kế hoạch triển khai web quản trị JPOS và chuyển đổi bán hàng Việt Nam

## Mục tiêu và phạm vi

- Web JPOS tại `jpos.joyworldcityfuns.vn` là nơi quản trị thiết bị, đơn hàng, cấu hình, sản phẩm hiển thị và quảng cáo POS, cùng danh mục HK, giá và VAT Việt Nam và cấu hình đồng bộ mới.
- JPOS Tauri phục vụ bán hàng, thanh toán, in vé và nghiệp vụ thành viên tại quầy. Tạo thành viên, tra cứu số dư, nạp bù, cấp thẻ và các nghiệp vụ thành viên hiện có tiếp tục theo luồng hiện tại.
- JPULSE phụ trách hóa đơn, đối soát MISA, báo cáo và quản trị quyền. Web JPOS dùng chung backend, dữ liệu và phân quyền của JPULSE.
- Đơn JPOS dùng giá và VAT Việt Nam đã chốt lúc lập đơn. Hóa đơn sử dụng dữ liệu Việt Nam. Hủy đơn JPOS được xử lý nội bộ, kể cả đơn đã có mã HK.

## Giai đoạn chuẩn bị — Web JPOS và phiên đăng nhập chung

Hoàn thành giai đoạn này trước Giai đoạn 0.

1. Dựng web quản trị tại `jpos.joyworldcityfuns.vn`. Sao chép mã nguồn trang đăng nhập và màn hình MFA của JPULSE sang JPOS. Thay logo trên giao diện sao chép, giữ nguyên biểu mẫu, nội dung và quy trình xác thực.
2. Mỗi web có trang đăng nhập riêng. Cả hai dùng chung cơ chế xác thực, phiên và trạng thái MFA phía backend. Rà soát cách cấp, đọc, hết hạn và thu hồi phiên trên hai tên miền. Kiểm tra quyền quản trị POS theo cửa hàng ở mỗi API.
3. Kiểm tra truy cập trực tiếp vào web JPOS và các URL trả kết quả PayOS đang dùng tên miền này khi thay đổi định tuyến. Giữ cơ chế đăng nhập hiện tại của ứng dụng Tauri. Chuyển menu **Quản lý JPOS** sau khi nghiệm thu các chức năng hiện có ở Giai đoạn 1A.

**Nghiệm thu** — Khi chưa có phiên, từng web mở trang đăng nhập mang logo tương ứng. Đăng nhập và hoàn tất MFA ở một web cho phép vào web kia trên cùng trình duyệt, theo cả hai chiều. Phiên chưa hoàn tất MFA chưa truy cập được chức năng quản trị. Đăng xuất hoặc hết phiên kết thúc truy cập trên cả hai web. Người thiếu quyền chỉ xem được phạm vi đã cấp. URL PayOS hoạt động cho cả kết quả thành công và hủy.

## Giai đoạn 0 — Chốt dữ liệu và phạm vi thí điểm

- Lập danh sách SKU theo nhóm vé, combo, gói xu, gói điểm, nạp thẻ và hàng lưu niệm. Ghi mã HK, cửa hàng, giá VND, VAT, nhu cầu cập nhật từ HK, nhu cầu gửi giao dịch sang HK và hệ thống cấp quyền lợi sau bán.
- Xác minh nơi soát vé, kích hoạt quyền vào cửa, cấp xu, điểm và quyền lợi thẻ. Chọn SKU thí điểm có thể hoàn tất quyền lợi nội bộ.
- Chốt cửa hàng, mốc chuyển đổi, bảng giá đã duyệt và quy trình hủy, trả tiền mặt hoặc hoàn chuyển khoản. Xác định phương án cho giỏ có cả SKU gửi HK và SKU bán nội bộ. Đề xuất cho đợt đầu là tách thành hai giao dịch.
- Chuẩn bị đơn mẫu có và không có mã HK, đơn nhập lịch sử từ HK, đơn có voucher, đơn có bản nháp và đơn đã phát hành hóa đơn. Lấy số liệu theo ca để đối chiếu sau thử nghiệm.

**Đầu ra** — Bảng cấu hình được duyệt, danh sách cửa hàng và SKU thí điểm, quy trình hoàn tiền và bộ đơn mẫu nghiệm thu.

## Giai đoạn 1A — Chuyển màn hình vận hành POS sang web JPOS

Bổ sung các trang dưới đây trước khi đưa danh mục HK và giá Việt Nam vào hoạt động. Dùng sidebar JPULSE với logo JPOS cho điều hướng cấp trang. Giữ bố cục bên trong từng chức năng và lưu cửa hàng đã chọn trong phiên điều hướng.

| Tab hiện tại | Phạm vi chuyển |
| --- | --- |
| Tổng quan | Chọn cửa hàng, xem trạng thái tổng quan và phiên bản cấu hình. |
| Thiết bị | Xem và quản lý thiết bị POS theo cửa hàng, gồm các thao tác chuyển thiết bị hiện có. |
| Đơn hàng | Lịch sử, chi tiết và thao tác đơn theo quyền. Thay đổi nghiệp vụ hủy và hoàn tiền được thực hiện ở Giai đoạn 3. |
| Cấu hình | Hóa đơn, In vé, Phiếu bốc thăm, Voucher, Chuyển khoản QR và Két tiền. |
| Sản phẩm hiển thị | Trang riêng cho cấu hình hiển thị và đồng bộ sản phẩm hiện có. |
| Quảng cáo | Quản lý nội dung và cấu hình quảng cáo POS theo cửa hàng. |

Quản trị tài khoản, quyền và tra cứu nhật ký tiếp tục ở JPULSE. Các thao tác quản trị trên JPOS vẫn dùng quyền và nhật ký phía backend.

1. Dùng lại màn hình, API, dữ liệu, phiên bản cấu hình và nhật ký hiện có. Kiểm tra các phụ thuộc vào bố cục, đường dẫn và API của JPULSE để từng tab hoạt động khi mở trực tiếp trên tên miền JPOS.
2. Kiểm tra toàn bộ chức năng với tài khoản có quyền xem, quyền sửa và tài khoản bị giới hạn theo cửa hàng. Xác minh cấu hình lưu từ web JPOS được Tauri nhận và áp dụng qua luồng cập nhật hiện tại.
3. Sau khi nghiệm thu đủ các tab, chuyển menu **Quản lý JPOS** và các liên kết nội bộ tới web JPOS. Thiết lập chuyển hướng từ `/pos-management` cũ cho liên kết đã lưu và giữ bộ lọc hoặc tab nếu đường dẫn có mang thông tin này. Nếu cần quay lui trong đợt chuyển, đưa menu và đường dẫn về giao diện JPULSE đang dùng cùng dữ liệu.

**Nghiệm thu** — Sáu trang trên sidebar và sáu mục trong Cấu hình hoạt động trên web JPOS. Người dùng mở được từ menu hoặc đường dẫn trực tiếp bằng phiên chung. Cửa hàng đã chọn được giữ khi chuyển trang. Thao tác đọc, lưu và nhật ký đúng quyền và đúng cửa hàng. Dữ liệu lưu từ web JPOS xuất hiện trên Tauri. Đường dẫn JPULSE cũ tới đúng đích sau khi chuyển.

## Giai đoạn 1B — Danh mục HK và cấu hình giá trên web JPOS

| Hạng mục | Yêu cầu |
| --- | --- |
| Dữ liệu HK | Hiển thị mã, tên, nhóm, giá trước và sau thuế, thuế, cách tính thuế, trạng thái bán và thời điểm cập nhật. Có tìm kiếm và lọc theo nhóm hoặc trạng thái. |
| Giá Việt Nam | Cấu hình giá bán VND, VAT, cửa hàng áp dụng và ngày hiệu lực. Hiển thị giá JPOS đang dùng, lưu người thay đổi và lịch sử phiên bản. |
| Cập nhật danh mục | Bật hoặc tắt cập nhật từng SKU từ HK vào danh mục bán. Bản ghi tham khảo HK vẫn tra cứu được trên web. |
| Gửi giao dịch | Bật hoặc tắt gửi giao dịch sang HK theo SKU, độc lập với việc cập nhật danh mục. |
| Hiển thị tại quầy | Dùng cơ chế cấu hình hiển thị theo cửa hàng hiện có. |

Lưu dữ liệu tham khảo HK và cấu hình bán Việt Nam riêng. Tác vụ đồng bộ HK chỉ cập nhật các trường thuộc phạm vi cho phép. Bảo vệ SKU bán nội bộ khỏi quy trình vô hiệu hóa hoặc đánh dấu xóa khi SKU vắng khỏi danh mục HK. Cho phép nhập và duyệt cấu hình trước khi bật giá mới tại quầy.

**Nghiệm thu** — Thay giá hoặc trạng thái SKU ở HK rồi chạy lại đồng bộ. Thông tin tham khảo được cập nhật, cấu hình Việt Nam và quyền hiển thị theo cửa hàng vẫn đúng. Kiểm tra quyền đọc, quyền sửa và lịch sử thay đổi.

## Giai đoạn 2 — Hóa đơn dùng dữ liệu Việt Nam

- Dùng mã đơn nội bộ, thời điểm thanh toán, dòng hàng, giá, VAT và chiết khấu đã lưu trên JPOS. Loại bỏ việc lấy đơn HK, so sánh giá HK và ưu tiên dữ liệu HK trong luồng chuẩn bị hóa đơn. Mã HK cũ phục vụ tra cứu lịch sử.
- Rà soát tạo và cập nhật bản nháp, yêu cầu hóa đơn từ khách, phát hành hàng loạt, xuất dữ liệu chuẩn bị hóa đơn và đối soát với MISA. Kiểm tra nhận diện đơn nhập lịch sử từ HK để dữ liệu này không trở thành nguồn của đợt phát hành Việt Nam.
- Hoàn thiện phân bổ voucher và làm tròn VAT trên từng dòng. Xử lý bản nháp cũ theo trạng thái và bảo toàn chứng từ đã phát hành. Kiểm tra chống tạo trùng với các đơn từng có dữ liệu từ hai nguồn.

**Nghiệm thu** — Khi HK không khả dụng, đơn Việt Nam đủ điều kiện vẫn chuẩn bị và phát hành được hóa đơn. Tổng tiền, VAT và chiết khấu khớp số đã chốt trên đơn. Chạy lại cùng ngày vẫn chỉ có một hồ sơ hóa đơn cho mỗi đơn.

## Giai đoạn 3 — Hủy đơn nội bộ

- Dùng cùng quy trình hủy nội bộ cho đơn JPOS đã gửi HK, chưa gửi hoặc gửi lỗi. Bỏ tra cứu điều kiện, lấy số tiền hoàn và gửi yêu cầu hoàn qua HK trong luồng hủy.
- Kiểm tra quyền theo cửa hàng, lý do hủy và trạng thái hóa đơn. Cập nhật trạng thái đơn, lịch sử và số liệu ca theo kết quả xử lý. Ghi nhận việc hủy đơn và việc trả tiền thực tế theo quy trình đã chốt ở Giai đoạn 0.
- Xử lý thao tác lặp, PayOS báo thanh toán muộn và tác vụ gửi HK đang chạy. Kiểm kê các yêu cầu hoàn HK đang dở ở mốc chuyển đổi. Với gói đã cấp quyền lợi ở HK, dùng quy trình vận hành đã duyệt cho quyền lợi còn hiệu lực sau hủy.

**Nghiệm thu** — Hủy được đơn JPOS có và không có mã HK mà không phát sinh yêu cầu hoàn mới sang HK. Báo cáo ca khớp số tiền thực tế. Đơn đã phát hành hóa đơn đi đúng quy trình xử lý chứng từ.

## Giai đoạn 4 — Bật giá Việt Nam và thí điểm bán nội bộ trên Tauri

- Dùng cùng cấu hình giá đã phát hành cho màn hình bán, giỏ hàng và backend. Lưu phiên bản cấu hình, giá, VAT và chính sách gửi HK trên đơn. Giao dịch đã tạo mã PayOS hoàn tất theo số tiền đã chốt.
- Với đơn có gửi HK, để HK tính giá từ mã và số lượng sản phẩm khi tạo đơn. Lưu riêng số tiền HK trả về để xác nhận và thử lại trên HK. Ví dụ JPOS thu 500 và xuất hóa đơn theo 500, còn HK nhận số tiền 200 nếu đơn HK có giá 200.
- Với SKU tắt gửi HK, hoàn tất đơn sau khi xác nhận thanh toán nội bộ. Cập nhật màn hình trạng thái, in và in lại, lịch sử và khôi phục giao dịch để nhận biết đơn hoàn tất khi chưa có mã HK. Áp dụng chính sách đã lưu cả khi gửi lần đầu và khi thử lại.
- Bật theo cửa hàng và SKU sau khi nghiệm thu Giai đoạn 2 và 3. Kiểm tra đủ một ca với tiền mặt, PayOS, voucher, in vé, hóa đơn, hủy và chốt doanh thu. Theo dõi lỗi thanh toán, đồng bộ, phát hành và chênh lệch báo cáo theo cửa hàng trước khi mở rộng.
- Khi cần dừng thí điểm, tạm dừng áp dụng cấu hình mới cho giao dịch mới tại cửa hàng bị ảnh hưởng. Giữ dữ liệu giá, thuế và chính sách đã chốt của các giao dịch đang xử lý hoặc đã thu tiền.

Triển khai cho vé lượt và hàng lưu niệm. Bật hoặc tạm dừng tại **Sản phẩm hiển thị** theo từng cửa hàng. Giá có hiệu lực theo ngày Việt Nam. SKU bán nội bộ phải có giá và VAT có hiệu lực. Tách giỏ có cả SKU nội bộ và SKU gửi HK thành hai giao dịch. Đơn đã tạo QR giữ số tiền và chính sách ban đầu, kể cả khi đổi cấu hình cửa hàng hoặc SKU.

Triển khai worker HK và các API thanh toán mới trước khi bật thí điểm. Cập nhật Tauri tại quầy thí điểm, mở lại danh mục rồi xác nhận giá trên giỏ trước khi thu tiền. Các cấu hình nháp cũ tắt cập nhật danh mục HK cần được kiểm tra và lưu lại để chốt dữ liệu SKU. Theo dõi [kịch bản nghiệm thu production](jpos-production-pilot-test.md) và chỉ mở rộng sau một ca đã đối chiếu.

**Nghiệm thu** — Giá trên giỏ, số tiền thu, biên lai và dữ liệu hóa đơn khớp. Đồng bộ lại từ HK giữ đúng giá Việt Nam đã duyệt. SKU tắt gửi không phát sinh giao dịch HK sau khởi động lại hoặc thử lại.

## Giai đoạn 5 — Mở rộng sang gói còn cấp quyền lợi qua HK

- Kiểm thử cơ chế cấp quyền lợi khi giá HK khác số tiền Việt Nam. Xác nhận thanh toán trên HK theo số tiền đơn HK và giữ số tiền đã thu tại Việt Nam trên đơn nội bộ.
- Thử tiền mặt, PayOS, gửi lại sau lỗi và hủy nội bộ sau khi HK đã cấp quyền lợi. Chỉ mở rộng cho nhóm gói đã có phương án vận hành được duyệt.
- Chạy hồi quy các nghiệp vụ tạo và tra cứu thành viên, số dư, nạp bù, cấp thẻ và các luồng thẻ hiện tại trên Tauri.

Gói đã áp giá Việt Nam bán qua **Thành viên** trên JPOS 2.0.11 trở lên. Cấu hình theo SKU cần giá dương, VAT và ngày có hiệu lực. Gói phụ thuộc HK phải bật gửi giao dịch HK. Khi HK đang xử lý, thử lại theo mã đơn JPOS hiện có để kiểm tra trạng thái. Khi hủy nội bộ sau khi đã cấp quyền lợi, giữ mã HK để bộ phận vận hành đối chiếu quyền lợi theo quy trình đã duyệt.

**Nghiệm thu** — JPOS thu đúng giá cấu hình, quyền lợi được cấp đúng một lần, thử lại không cộng trùng và các nghiệp vụ thành viên hiện có hoạt động bình thường.

## Điều kiện chuyển giai đoạn

| Mốc | Điều kiện |
| --- | --- |
| Bắt đầu Giai đoạn 0 | Web đăng nhập JPOS, MFA, phiên chung hai chiều và định tuyến PayOS đã nghiệm thu. |
| Chuyển đường dẫn Quản lý JPOS | Sáu trang và sáu mục cấu hình đã nghiệm thu trên web JPOS, gồm phiên chung, quyền, dữ liệu và đồng bộ cấu hình xuống Tauri. |
| Bắt đầu cấu hình thí điểm | Đã chuyển chức năng quản lý POS hiện có và đã duyệt SKU, cửa hàng, giá, VAT và phạm vi gửi HK. |
| Bật giá mới tại quầy | Trang cấu hình, hóa đơn Việt Nam và hủy nội bộ đã nghiệm thu. |
| Mở rộng cửa hàng hoặc SKU | Đã đối chiếu ít nhất một ca thí điểm và xử lý các sai lệch phát hiện được. |
| Bật cho gói phụ thuộc HK | Đã xác nhận cấp quyền lợi khi chênh giá, thử lại và xử lý sau hủy. |
