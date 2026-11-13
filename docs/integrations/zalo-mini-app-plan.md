# Kế hoạch triển khai Mini App thẻ thành viên B.Duck

## Phạm vi đã cập nhật · Tra cứu theo số điện thoại

My B.Duck xác minh số điện thoại qua Zalo rồi tra hồ sơ và số dư theo cơ sở qua Joyworld. Khách có hồ sơ vào thẳng màn hình số dư, kể cả khi chưa được cấp thẻ vật lý. Khách chưa đăng ký thấy thông báo và nút **Đăng ký**. Biểu mẫu dùng số Zalo đã xác minh, họ tên, ngày sinh, giới tính và email. Cần đối chiếu với màn hình POS thật để xác nhận các trường và quy tắc bắt buộc. Đăng ký tạo hồ sơ thành viên để cấp thẻ tại quầy sau.

Các mốc liên kết thẻ và OCR bên dưới ghi lại phạm vi thử nghiệm ban đầu. Việc triển khai luồng xem số dư ưu tiên xác thực và tra số điện thoại, xác nhận đăng ký chưa cấp thẻ trên Joyworld thử nghiệm, rồi kiểm thử hai tình huống trên Zalo thật.

## Phạm vi bản đầu

Khách dùng tài khoản Zalo để tạo tài khoản Mini App hoặc đăng nhập, liên kết thẻ hiện có, xem số dư và sửa các trường hồ sơ được phép. Khách có thể chụp thẻ để đọc dòng mã in hoặc nhập mã thủ công. Nhân viên dùng JPULSE để cấu hình theo cơ sở và xử lý ngoại lệ tại quầy. Khách chưa có thẻ có thể tạo tài khoản và xem hướng dẫn đăng ký tại quầy.

B.Duck xác thực Mini App bằng hồ sơ doanh nghiệp, dùng số điện thoại do Zalo cung cấp khi khách đồng ý và xử lý các ca cần xác minh lại tại quầy. Phạm vi này không cần mua gói OA, gửi OTP qua Zalo hay dùng dịch vụ OCR tính phí theo lượt. Mức 0 đồng trả cho Zalo vẫn phụ thuộc xác nhận về phí phát hành, phí sử dụng và hạn mức `getPhoneNumber`.

## Luồng khách hàng

1. **Đăng nhập.** Khách chọn “Tiếp tục bằng Zalo”. Backend JPULSE xác thực tài khoản Zalo và lấy số điện thoại sau khi khách đồng ý chia sẻ. Tài khoản Mini App gắn với định danh Zalo đã xác thực.
2. **Chụp thẻ hoặc nhập mã.** Hướng dẫn khách chụp rõ dòng chữ đen ở mép dưới thẻ RFID. OCR đọc vùng chứa dòng chữ và điền mã vào ô cho khách xác nhận hoặc sửa. Giữ nguyên số 0 đầu chuỗi và để khách kiểm tra các ký tự dễ nhầm như O/0 và I/1. Luôn cho phép nhập tay nếu ảnh khó đọc hoặc khách từ chối quyền camera.
3. **Liên kết.** JPULSE tra Joyworld theo mã đã xác nhận, kiểm tra số trên hồ sơ khớp số Zalo và tạo liên kết với thẻ. Nếu số không khớp, thẻ thiếu số hoặc đã gắn tài khoản khác, hướng dẫn khách xác minh tại quầy. Việc ghi liên kết cần bảo đảm hai yêu cầu đồng thời chỉ tạo được một liên kết có hiệu lực cho cùng thẻ.
4. **Xem thẻ và số dư.** Dùng nền vàng, góc bo và bố cục sticker nhiều màu theo ảnh thẻ vật lý. Ưu tiên artwork gốc của B.Duck. Nền bỏ dòng seri mẫu và hiển thị động mã thẻ đã che bớt cùng hạng thành viên. Đặt số dư bên dưới, có đơn vị, cơ sở áp dụng nếu cần và thời điểm cập nhật.
5. **Sửa hồ sơ.** Khách sửa các trường B.Duck cho phép, chẳng hạn họ tên và email. JPULSE ghi vào Joyworld rồi đọc lại để xác nhận. Đổi số điện thoại dùng để xác minh thẻ được xử lý tại quầy.

Tài liệu Joyworld gọi `memberCode` là mã in trên thẻ. Mẫu in có chữ và số nên thử tra theo trường này trước. Xác nhận với thẻ thật cả giá trị mã, tiền tố và phạm vi cơ sở. Joyworld cũng có API tra `serialNumber` với ví dụ dạng số. [Tra mã thẻ](../../海外-鲸舰-OpenApi_EN.md#obtain-member-information-through-membership-card-number) · [Tra số seri](../../海外-鲸舰-OpenApi_EN.md#obtain-member-information-through-membership-card-serial-number)

Ưu tiên thử OCR mã nguồn mở trên thiết bị để JPULSE chỉ nhận mã khách xác nhận. Nếu WebView Zalo không đạt yêu cầu trên thiết bị thử, đánh giá phương án OCR trên backend hiện có với ảnh đã cắt và xử lý tạm thời. [Tesseract.js](https://github.com/naptha/tesseract.js)

## Cấu hình và vận hành trong JPULSE

| Mục | Nội dung |
| --- | --- |
| Cơ sở áp dụng | Bật Mini App theo từng cơ sở. Dùng lại ánh xạ cửa hàng Joyworld nếu phù hợp với API thành viên. |
| Hiển thị thẻ và số dư | Mẫu nền mặc định B.Duck, tên và đơn vị từng loại số dư, thứ tự hiển thị. Chỉ cộng gộp khi nghiệp vụ xác nhận số dư dùng chung. |
| Chính sách hồ sơ | Danh sách trường được sửa và hướng dẫn xác minh khi đổi số điện thoại. |
| Hỗ trợ liên kết | Tra cứu trạng thái, gỡ hoặc liên kết lại sau khi xác minh. Phân quyền theo cơ sở, ghi người thao tác, thời điểm và lý do. |
| Vận hành | Theo dõi lỗi Joyworld và tỷ lệ OCR, bật hoặc tắt quét theo cơ sở, giữ luồng nhập mã. Khóa Zalo và Joyworld lưu phía máy chủ. |

Joyworld là nguồn gốc của dữ liệu thẻ, số dư và hồ sơ. JPULSE lưu tài khoản Mini App, liên kết thẻ, cấu hình và nhật ký. Backend kiểm tra quyền trên từng yêu cầu đọc hoặc sửa hồ sơ và số dư.

## Lộ trình dự kiến

Điểm xuất phát của kế hoạch là chưa có mã nguồn Mini App. Công việc đầu tiên của agent là tạo ứng dụng trong monorepo. Có thể bắt đầu phát triển và chạy bản mẫu bằng dữ liệu giả lập trong khi B.Duck chuẩn bị Mini App ID, quyền deploy, quyền API thành viên Joyworld, thẻ thử và artwork.

| Giai đoạn | Công việc thực hiện | Đầu ra để chuyển bước |
| --- | --- | --- |
| **1 · Khởi tạo và chạy bản mẫu (tuần 1)** | Tạo ứng dụng riêng, dự kiến `apps/zalo-mini-app`, bằng React, TypeScript, Vite và ZMP SDK. Thiết lập lệnh chạy local và build. Làm màn hình liên kết thẻ, nhập mã và thẻ điện tử nền vàng với dữ liệu giả lập. Viết bản thử OCR nhận ảnh thẻ mẫu và điền mã vào ô xác nhận. | Agent chạy được bản mẫu tại máy, thử được luồng ảnh hoặc nhập mã đến màn hình thẻ mẫu và tạo được bản build đầu tiên. |
| **2 · Thử tích hợp trên thiết bị thật (tuần 1–2)** | Khi có Mini App ID và quyền deploy, agent đưa bản thử lên Zalo. Kiểm tra luồng lấy số điện thoại và chụp ảnh trên iOS, Android. Đo thời gian và tỷ lệ đọc đúng toàn bộ mã ngay lần chụp đầu. Với thẻ thử, kiểm chứng trường mã in, cách trả số dư theo cơ sở và khả năng đọc lại hồ sơ sau khi sửa qua Joyworld. | Có kết quả thử trên Zalo thật và dữ liệu để chốt cách OCR, cách tra mã in và cách hiển thị số dư. |
| **3 · Phát triển MVP và JPULSE (tuần 2–4)** | Xây luồng đăng nhập và tạo tài khoản, chụp hoặc nhập mã, xác minh chủ thẻ, xem thẻ và số dư, sửa hồ sơ. Thêm API, lưu liên kết và nhật ký, xây màn hình quản trị JPULSE, phân quyền theo cơ sở và xử lý ngoại lệ tại quầy. | Mini App và JPULSE chạy cùng nhau trên môi trường thử nghiệm với dữ liệu kiểm thử Joyworld. |
| **4 · Nghiệm thu tại một cơ sở (tuần 4–5)** | Agent deploy bản JPULSE thử nghiệm và upload bản Mini App Testing. Đối chiếu số dư tại quầy, kiểm thử ảnh mờ, số không khớp, thẻ trùng, từ chối quyền và Joyworld gián đoạn trên thiết bị thật. | Có bản Testing đạt nghiệm thu và hồ sơ sẵn sàng nộp duyệt. |
| **5 · Xét duyệt và phát hành (tuần 5 trở đi)** | Agent nộp bản nghiệm thu và yêu cầu quyền Zalo. Sau khi được duyệt, agent deploy production và phát hành trong phạm vi được B.Duck giao quyền. Bật cho một cơ sở trước, theo dõi tỷ lệ quét thành công, nhập tay và xác minh tại quầy trước khi mở rộng. | Bản Live chạy tại cơ sở đầu tiên. |

## Chi tiết giai đoạn 1 · Khởi tạo app và hoàn thành bản mẫu local

Mục tiêu của tuần đầu là tạo mã nguồn Mini App, chạy và build được trong workspace pnpm, rồi trình diễn toàn bộ hành trình khách hàng bằng dữ liệu giả lập. Các mốc ngày dưới đây là thứ tự dự kiến. Mỗi chức năng có tiêu chí nghiệm thu local và mốc tích hợp thật trong bảng.

| Mốc | Chức năng và công việc của agent | Tiêu chí hoàn thành bản mẫu | Mốc tích hợp thật |
| --- | --- | --- | --- |
| **1.1 · Ngày 1** | Tạo `apps/zalo-mini-app`. Thiết lập React, TypeScript, Vite, ZMP SDK, cấu trúc màn hình, cấu hình môi trường mẫu và lệnh chạy local, kiểm tra kiểu, build. | Cài phụ thuộc từ workspace và chạy được app. Kiểm tra kiểu và build thành công. Màn hình đầu hiển thị trên khung điện thoại. | Giai đoạn 2 gắn Mini App ID, build và chạy trong Zalo. |
| **1.2 · Ngày 1–2** | Dựng màn hình “Tiếp tục bằng Zalo”, giải thích lý do xin số điện thoại. Giả lập khách lần đầu, khách quay lại và khách từ chối chia sẻ số. | Khách mới được đưa tới màn hình liên kết. Khách đã liên kết mở được thẻ mẫu. Khách từ chối thấy hướng dẫn và có thể thử lại. | Giai đoạn 2 thử lấy số trên thiết bị thật. Giai đoạn 3 hoàn thành xác thực phía JPULSE, tạo tài khoản và quản lý phiên. |
| **1.3 · Ngày 2** | Làm form nhập mã, màn hình xác nhận và thao tác liên kết giả lập. Dùng dữ liệu mẫu cho thẻ hợp lệ, mã không tìm thấy, số điện thoại không khớp, thẻ đã liên kết và lỗi tạm thời. | Mã chữ–số giữ nguyên số 0 đầu chuỗi. Khách sửa được mã và gửi lại. Chỉ tình huống hợp lệ mở được thẻ và số dư mẫu. | Giai đoạn 2 kiểm chứng mã in với Joyworld. Giai đoạn 3 lưu liên kết thật và kiểm tra quyền sở hữu. |
| **1.4 · Ngày 3** | Làm bản thử OCR bằng ảnh mẫu local hoặc ảnh người thử chọn. Cắt vùng dòng seri, chạy OCR trên thiết bị và đưa kết quả về cùng form ở mốc 1.3. Thử ảnh rõ, nghiêng, lóa hoặc mờ. | Ít nhất một ảnh rõ đi được từ OCR tới xác nhận bằng văn bản có thể sửa. Khi ảnh không đọc được, có thể chọn ảnh lại hoặc nhập tay. Ghi lại kết quả đọc đúng toàn chuỗi và thời gian xử lý trên bộ ảnh nhỏ. | Giai đoạn 2 đo trên iOS và Android thật với luồng chụp Zalo. Giai đoạn 3 hoàn thiện luồng camera và xử lý lỗi. |
| **1.5 · Ngày 3–4** | Dựng thẻ điện tử theo ảnh tham chiếu. Dùng nền vàng, góc bo và họa tiết nhiều màu với mã đã che, hạng thành viên và số dư mẫu bên dưới. Thử số dư bằng 0, nhiều loại số dư và lỗi tải. | Thẻ và số dư đọc được trên màn hình nhỏ. Nền không chứa seri in sẵn của ảnh gốc. Các loại số dư có nhãn, đơn vị và thời điểm cập nhật. | Giai đoạn 3 gắn artwork đã duyệt và dữ liệu Joyworld qua JPULSE. |
| **1.6 · Ngày 4** | Dựng màn hình hồ sơ mẫu. Cho sửa họ tên và email, hiển thị số điện thoại và hướng dẫn xác minh tại quầy khi muốn đổi số. | Form báo dữ liệu không hợp lệ, có thể lưu vào dữ liệu giả lập và hiển thị lại giá trị đã sửa. | Giai đoạn 2 kiểm chứng trường Joyworld hỗ trợ cập nhật. Giai đoạn 3 ghi và đọc lại qua backend. |
| **1.7 · Ngày 5** | Chạy thử toàn luồng, kiểm tra kiểu và build lại. Ghi hướng dẫn chạy, danh sách dữ liệu mẫu và các điểm cần xác minh khi chuyển sang Zalo thật. | Trình diễn được cả hai đường chụp ảnh hoặc nhập mã, sau đó xác nhận liên kết, xem số dư và sửa hồ sơ. Có bản build local và kết quả kiểm tra cho các ca lỗi chính. | Giai đoạn 2 agent upload bản thử sau khi có Mini App ID và quyền deploy. |

**Đầu vào cho bản local** gồm ảnh thẻ tham chiếu và dữ liệu thành viên, mã thẻ, số dư giả lập. Có thể dùng nền tạm theo ảnh tham chiếu trong khi chờ artwork đã duyệt. B.Duck chuẩn bị song song Mini App ID, quyền deploy, thẻ thử theo cơ sở và quyền API Joyworld để giai đoạn 2 bắt đầu khi bản build sẵn sàng.

## Triển khai và phát hành do agent thực hiện

| Bước | Trách nhiệm của agent | Điều kiện |
| --- | --- | --- |
| Deploy JPULSE thử nghiệm | Build và deploy backend cùng màn hình quản trị qua quy trình Google Cloud hiện có. Kiểm tra kết nối Joyworld, xác thực Zalo và cấu hình cơ sở thử nghiệm. | Quyền triển khai môi trường thử nghiệm và thông tin kết nối qua kho bí mật. |
| Upload Mini App Testing | Cấu hình CI/CD hoặc CLI để build và upload bản Testing. Ghi lại phiên bản và chạy kiểm tra tích hợp. | Mini App ID và quyền deploy. Người được B.Duck cấp quyền quét QR nếu Zalo yêu cầu mở phiên đăng nhập. |
| Nghiệm thu trên điện thoại | Dùng kết quả chạy trên iOS và Android thật, có tài khoản ngoài nhóm Admin/Developer. Xác nhận luồng đăng nhập, quét seri, sửa mã, liên kết đúng chủ thẻ và đối chiếu số dư tại quầy. | Thiết bị thật, thẻ thử và cơ sở có thể đối chiếu Joyworld. |
| Nộp xét duyệt | Chuẩn bị hồ sơ và ảnh minh họa. Nộp bản Testing cùng yêu cầu quyền lấy số điện thoại và quyền camera hoặc ảnh tương ứng với API đã dùng. Theo dõi phản hồi, sửa và nộp lại nếu cần. | B.Duck cung cấp hồ sơ xác thực doanh nghiệp và quyền nộp trên Mini App Center. Zalo thực hiện xét duyệt. |
| Deploy production và Publish | Triển khai bản JPULSE tương thích theo pipeline hiện có, kiểm tra nhanh production, phát hành bản Mini App đã duyệt và bật cơ sở thử nghiệm. Theo dõi lỗi sau phát hành và dùng quy trình rollback JPULSE hoặc tắt OCR theo cơ sở khi cần. | B.Duck giao quyền triển khai production và quyền phát hành trên Mini App Center. |

Thông tin xác thực dùng trong CI/CD được cấp qua kho bí mật của hệ thống triển khai. Mốc nộp duyệt là kết quả nghiệm thu thiết bị thật. Mốc Publish là phiên bản được Zalo duyệt và agent đã được B.Duck giao quyền phát hành.

[Quy trình deploy JPULSE](../deployment-cicd.md) · [Công cụ deploy Zalo](https://docs.zaloplatforms.com/docs/MA/devtools/ext/deploy) · [CI/CD Zalo](https://docs.zaloplatforms.com/docs/MA/intro/getting-started/frequently-solved-issues) · [Quy trình phát hành](https://docs.zaloplatforms.com/docs/MA/intro/public-mini-program)
