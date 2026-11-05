# Kiểm tra khóa MFA sau 24 giờ không hoạt động — 05/11/2026

## Phạm vi

- Đã `git pull --ff-only` nhánh `main`, từ `be50d15` lên `8b2f457` trước khi kiểm tra.
- Kiểm tra mã nguồn và kiểm thử giả lập tại máy; chưa truy cập phiên của người dùng hoặc log sự cố production. Các lỗi dưới đây được xác nhận trong code, chưa khẳng định mỗi phản ánh của người dùng đều do cùng một nguyên nhân.
- Next.js đang cài là 15.5.18; gói này không có thư mục `node_modules/next/dist/docs/` mà AGENTS.md chỉ định. Đã đối chiếu hướng dẫn Client Components chính thức: https://nextjs.org/docs/app/getting-started/server-and-client-components. Bản sửa không thay đổi API Next.js.

## Lỗi khóa màn hình đã xác nhận

1. `hooks/useMFA.ts` trước đây kiểm tra bằng interval 60 giây, nhưng cập nhật hoạt động bằng sự kiện chuột/phím mà không kiểm tra deadline trước. Khi máy ngủ hoặc tab bị treo, sự kiện đầu tiên sau hơn 24 giờ có thể ghi đè `lastActiveTime` trước khi interval chạy, làm mất dấu thời gian không hoạt động.
2. Không kiểm tra ngay lúc mount, focus, visibilitychange hoặc pageshow. Vì vậy reload hay quay lại tab phụ thuộc vào lịch chạy timer của trình duyệt.
3. `app/(dashboard)/layout.tsx` trả về trang lỗi xác thực/phân quyền trước nhánh render `MFALockScreen`. Khi lỗi quyền xuất hiện cùng lúc hết hạn idle, màn hình khóa có thể không được render dù store đã khóa.

Đã sửa: kiểm tra deadline ngay trước cập nhật hoạt động; khóa khi đủ 24 giờ; không cập nhật timestamp lúc đang khóa; kiểm tra ngay khi mở/quay lại tab; dùng chung một monitor cho layout và màn hình MFA. Hiển thị MFA cả trên trang lỗi runtime khi danh tính vẫn đang đăng nhập. Mở khóa vẫn chỉ xảy ra sau API xác minh MFA thành công như trước.

## Lỗi khôi phục quyền truy cập đã xác nhận

`AccessVersionProvider.tsx` xử lý lỗi của `onSnapshot` bằng cách đặt quyền về ERROR, nhưng không đăng ký lại listener đã kết thúc. Sự kiện online chỉ thực hiện một lần đọc; focus/visibilitychange chưa có xử lý phục hồi tại provider này. Đăng xuất rồi đăng nhập đổi userId và tạo lại listener, giải thích được một đường đi dẫn tới hiện tượng người dùng báo.

Đã sửa: kiểm tra lại quyền khi focus, quay về tab và online; đăng ký lại listener nếu listener trước đã lỗi; giữ nguyên kiểm tra version, quyền bị thu hồi và việc bỏ kết quả bất đồng bộ sau unmount. Kiểm thử xác nhận sau phục hồi vẫn nhận được các cập nhật tiếp theo, không tạo listener trùng khi listener còn khỏe.

## Phân biệt các loại thời hạn và giới hạn

- Khóa idle 24 giờ là trạng thái giao diện lưu trong `mfa-storage`, độc lập với cookie backend.
- Cache khôi phục phiên có TTL 24 giờ, không phải thời hạn đăng nhập.
- Cookie backend trong `authSessionFlow.ts` có hạn 14 ngày. Một số API như `api/stockCountApi.ts` và `api/payrollEmailApi.ts` vẫn chỉ gửi cookie. `GET /api/auth/session` có thể thành công nhờ bearer token mà không cấp lại cookie, nên các API chỉ dùng cookie vẫn có nguy cơ lỗi khi cookie hết hạn hoặc không được gửi. Chưa thay đổi các API này trong bản sửa idle; cần đối chiếu endpoint và tuổi phiên trong log production nếu sự cố còn xảy ra.
- Backend hiện xác minh danh tính và quyền, chưa lưu/ép thời hạn idle hay trạng thái mở khóa MFA phía server. Bản sửa này khôi phục hành vi khóa màn hình theo thiết kế hiện tại; không bổ sung chính sách MFA phía server.
- Chưa thử mã TOTP/email thực hoặc giả lập đầy đủ việc hệ điều hành ngủ trên trình duyệt production. Kiểm thử hiện dùng thời gian giả lập và mock transport/listener.

## Kiểm tra

- `node --test apps/fe-wms/src/security/idleSessionRecovery.test.mjs apps/fe-wms/src/utils/authenticatedFetch.test.mjs`: 10/10 đạt.
- `pnpm test:access-session`: 10/10 đạt.
- ESLint các file TypeScript/TSX thay đổi: đạt sau sắp xếp import.
- `pnpm --filter @bduck/fe-wms typecheck`: đạt sau khi chạy `pnpm install --frozen-lockfile` và build `@bduck/shared-types` để đồng bộ dependencies/declaration với code mới pull.
- `git diff --check`: đạt.

Chưa commit, push hoặc deploy.

## Bổ sung đối chiếu production

Sau khi người dùng cho phép kiểm tra Cloud Console, đã đọc log auth 7 ngày gần nhất. Không thấy 401/403/429/5xx hoặc request auth >=6 giây trong khoảng truy vấn; chỉ có ba lần MFA verify HTTP 400. Cold start backend 12–17 giây có thật và đã đối chiếu cùng instance với request dữ liệu chậm, nhưng chưa đủ bằng chứng gắn trực tiếp cold start hoặc listener lỗi với lần mất phiên cụ thể của người dùng. Xem [báo cáo độ trễ production](production-login-latency-review-2026-11-05.md).
