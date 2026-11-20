# Mini App thẻ thành viên B.Duck

## Chỉnh giao diện từng trang

| Màn hình | Đường dẫn | File |
| --- | --- | --- |
| Chào mừng | `#/` | [WelcomePage.tsx](src/pages/WelcomePage.tsx) |
| Số chưa đăng ký | `#/chua-dang-ky` | [UnregisteredPage.tsx](src/pages/UnregisteredPage.tsx) |
| Đăng ký | `#/dang-ky` | [RegistrationPage.tsx](src/pages/RegistrationPage.tsx) · [Biểu mẫu](src/components/RegistrationScreen.tsx) |
| Số dư | `#/so-du` | [BalancePage.tsx](src/pages/BalancePage.tsx) |
| Hồ sơ | `#/ho-so` | [ProfilePage.tsx](src/pages/ProfilePage.tsx) · [Biểu mẫu](src/components/ProfileScreen.tsx) |

Header và footer nằm trong [AppLayout.tsx](src/components/AppLayout.tsx), hình thẻ nằm trong [MemberCard.tsx](src/components/MemberCard.tsx). Khi chạy local, chọn tình huống thử nghiệm trên trang chào mừng để vào các trang có yêu cầu phiên thành viên.

## Luồng hiện tại

Khi mở My BDuck, Mini App xác thực tài khoản bằng access token Zalo. Khách chưa liên kết bấm **Liên kết tài khoản** để cấp quyền chia sẻ số điện thoại và tìm hồ sơ. Khách đã liên kết mở thẳng màn hình số dư. Để thử đăng ký trong bản mẫu, chọn **Khách mới** trong **Đổi tình huống thử nghiệm**, rồi bấm **Liên kết tài khoản**.

Để thử với JPULSE, cấu hình `VITE_ZALO_MEMBER_API_URL` bằng URL HTTPS của `/api/zalo-members` và build chế độ Zalo Testing. Trên Cloud Run, cấu hình `ZALO_MEMBER_APP_SECRET` của Zalo App cha cùng `HK_API_BASE_URL` (HTTPS), `HK_API_APP_ID`, `HK_API_KEY` và `HK_API_SHOP_ID` cùng phạm vi với JPOS. Lưu khóa HK và Zalo App Secret trong Secret Manager. Backend cần kết nối cùng Firestore mặc định với JPOS.

Backend xác thực access token tại `POST /authenticate` và chỉ đổi token số điện thoại tại `POST /link` sau khi kiểm tra phiên và danh tính Zalo. Sau khi xác minh số, backend tra `pos_members` hoặc HK theo shop đã cấu hình và lấy số dư theo UID. Backend lưu liên kết trong `zalo_member_links` và xóa liên kết khi nhận webhook rút quyền hợp lệ. Chỉ khi HK xác nhận chưa có thành viên thì ứng dụng mới hiện luồng đăng ký. Triển khai backend mới và build Mini App mới cùng đợt vì luồng mới dùng hai endpoint thay cho `/lookup`.

Khi endpoint HK của môi trường Testing chỉ hỗ trợ HTTP, có thể đặt `ZALO_MEMBER_HK_ALLOW_HTTP=true` riêng trên revision Testing. Mini App vẫn gọi Cloud Run qua HTTPS. Kết nối từ Cloud Run tới HK qua HTTP truyền dữ liệu thành viên không mã hóa. Các action thành viên dùng phiên bản `10.11.8` giống JPOS, độc lập với phiên bản mặc định `HK_API_VERSION`.

Bật `ZALO_MEMBER_REGISTRATION_ENABLED=true` trên môi trường thử sau khi xác nhận `member_join` tạo hồ sơ mà chưa cấp thẻ, xác nhận cơ chế chống tạo trùng của Joyworld và đối chiếu biểu mẫu POS. Thử cả cập nhật hồ sơ bằng `member_info_modify`. Tên loại số dư được cố định trong backend theo mã HK. Điểm nạp và Điểm thưởng luôn hiện, các loại còn lại chỉ hiện khi khác 0.

## Build để phát hành

```sh
pnpm --filter @bduck/zalo-mini-app build:zalo-production
```

Cấu hình `VITE_ZALO_MEMBER_API_URL` qua biến môi trường hoặc `.env.zalo-production.local` trong thư mục ứng dụng. Build sẽ báo lỗi nếu URL không phải HTTPS hoặc thiếu đường dẫn `/api/zalo-members`. Gói nằm ở `dist/zalo-production` và dùng dữ liệu thật.

JPULSE xác minh số điện thoại qua Zalo khi đăng nhập và cấp phiên 15 phút. Mini App giữ phiên trong bộ nhớ để đăng ký hoặc lưu hồ sơ. Khi phiên hết hạn, khách đăng nhập lại. Khóa Zalo App cha chỉ cấu hình phía JPULSE.

Trước khi phát hành, triển khai API JPULSE lên môi trường thử, upload gói kết nối API dưới trạng thái Testing và kiểm tra trên iOS, Android với tài khoản khách. Nghiệm thu các số đã đăng ký, chưa đăng ký, cập nhật hồ sơ, quyền bị từ chối và số dư theo cơ sở. Sau đó mới nộp duyệt và phát hành.

## Ghi chú bản OCR ban đầu

Đây là bản mẫu local của giai đoạn 1. Luồng đăng nhập, liên kết, số dư và hồ sơ dùng dữ liệu giả lập trong phiên hiện tại. OCR chạy trong trình duyệt với worker, WebAssembly và dữ liệu nhận dạng đi kèm ứng dụng. Ảnh được xử lý trên thiết bị. Bản local không cần Mini App ID, thông tin kết nối JPULSE hay Joyworld.

## Chạy từ thư mục gốc của repo

Để tra số điện thoại với dữ liệu JPOS/HK thật, chạy hai terminal PowerShell từ thư mục gốc. Backend chỉ lắng nghe loopback và tra cứu trên Firebase production. Cấu hình `HK_API_APP_ID`, `HK_API_KEY`, `HK_API_BASE_URL`, `HK_API_SHOP_ID` ở môi trường terminal backend hoặc `.env.local` của repo, cùng thông tin Firebase production đã có. Nếu endpoint HK chỉ hỗ trợ HTTP, đặt `ZALO_MEMBER_HK_ALLOW_HTTP=true` cho tiến trình này.

```powershell
$env:NODE_ENV = 'development'
pnpm --filter @bduck/be-wms dev:zalo-lookup
```

```powershell
$env:VITE_ZALO_LOCAL_LOOKUP = 'true'
pnpm --filter @bduck/zalo-mini-app dev
```

Mở địa chỉ `http://127.0.0.1` kèm cổng Vite in ra. Nhập số điện thoại vào ô **Số điện thoại thành viên**. Chế độ này chỉ xem số dư và hồ sơ, không đăng ký hoặc cập nhật dữ liệu thật. Chạy Vite mà không bật `VITE_ZALO_LOCAL_LOOKUP` để dùng dữ liệu demo.

```sh
pnpm install --frozen-lockfile
pnpm --filter @bduck/zalo-mini-app dev
pnpm --filter @bduck/zalo-mini-app typecheck
pnpm --filter @bduck/zalo-mini-app build
```

Mở địa chỉ Vite in trong terminal. Để chạy bản đã build, dùng `pnpm --filter @bduck/zalo-mini-app preview`.

## Thử các luồng

- Chọn **Số điện thoại đã đăng ký** rồi bấm **Liên kết tài khoản** để xem số dư demo và thử sửa hồ sơ.
- Để thử OCR, chọn [ảnh thẻ giả lập](examples/sample-card.jpg). Mã in là `BD12PAYDUCK543218`. Đối chiếu nội dung OCR rồi bấm **Liên kết thẻ**. Mã này mở thẻ có số dư bằng 0. Có thể sửa mã hoặc nhập tay nếu OCR đọc nhầm.
- Mở **Mã thẻ dùng thử** để thử số điện thoại không khớp, thẻ đã liên kết, lỗi tra cứu và lỗi tải số dư. Thử mã bất kỳ chưa đăng ký để thấy thông báo không tìm thấy.
- Trên màn hình đầu, **Đổi tình huống thử nghiệm** cho phép thử khách đã liên kết và khách từ chối chia sẻ số điện thoại.

## Nghiệm thu local

Đã chạy build và kiểm tra bằng Chromium trên bản local. Các luồng nhập mã, OCR rồi xác nhận mã, lỗi liên kết, số dư bằng 0, tải lại số dư và lưu rồi mở lại hồ sơ đều hoạt động. Giao diện đã kiểm tra ở chiều rộng 320, 390, 768 và 1440 px.

OCR đọc đúng toàn bộ mã trên ảnh rõ và ảnh mờ nhẹ trong bộ ảnh giả lập. Ảnh nghiêng và ảnh thẻ vật lý do B.Duck cung cấp vẫn có thể đọc sai. Ảnh không có mã hiển thị hướng dẫn nhập tay. Đây là kết quả trên bộ ảnh thử nhỏ, cần đo lại trên nhiều thẻ thật trong giai đoạn 2.

## Chuẩn bị bản Zalo Testing

```sh
pnpm --filter @bduck/zalo-mini-app build:zalo-testing
```

Bản build nằm ở `dist/zalo-testing` trong thư mục ứng dụng, kèm `app-config.json` trỏ tới các entry CSS và JavaScript đã build. Lệnh kiểm tra giới hạn 3 MB mỗi tệp và 10 MB cho cả gói. Lõi OCR được tách thành tệp JavaScript và WebAssembly. Chạy lệnh này sau build local nếu cần giữ cả hai đầu ra cùng lúc. [Giới hạn đóng gói của Zalo](https://docs.zaloplatforms.com/docs/MA/intro/getting-started/frequently-solved-issues)

Bản Testing gọi ZMP SDK để kiểm tra quyền số điện thoại và mở camera Zalo. Token chỉ dùng để xác nhận SDK trả kết quả trong bước thử quyền. Bản này vẫn hiển thị hồ sơ và số dư giả lập. Ảnh từ camera được đọc qua đường dẫn tạm trên thiết bị, còn nhập mã thủ công dùng được khi camera hoặc OCR gặp lỗi.

1. Gắn Mini App ID của B.Duck, đăng nhập công cụ Zalo bằng tài khoản có quyền deploy và upload thư mục build dưới dạng Testing. [Hướng dẫn deploy](https://docs.zaloplatforms.com/docs/MA/devtools/ext/deploy)
2. Mở bản Testing trên iOS và Android. Thử đồng ý, từ chối và cấp lại quyền số điện thoại. Chụp ảnh thẻ, kiểm tra đường dẫn ảnh tạm, việc tải worker và WebAssembly, rồi đối chiếu mã OCR với dòng in. Dùng mã mẫu trong mục trên để thử luồng liên kết giao diện.
3. Khi có cơ sở và tài khoản thử Joyworld, đối chiếu mã in với `memberCode` hoặc `serialNumber`, so sánh số dư với quầy và xác nhận trường hồ sơ có thể cập nhật. Bước này cần cấu hình OpenAPI thành viên của cơ sở thử, khác với thông tin đăng nhập Joyworld Manager. Sau đó nối xác thực và dữ liệu thật qua JPULSE.

Nền thẻ mẫu tại [member-card.png](src/assets/member-card.png) được tạo bằng ImageGen từ tham chiếu thẻ vàng, sticker vịt nhiều màu và họa tiết tím, hồng, xanh. Mã và hạng được hiển thị động trên giao diện.
