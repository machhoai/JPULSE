# Quyền và cấu hình két tiền JPOS theo từng máy

- Quyền nhân viên: `pos.cash_drawer.open`, trong nhóm POS của danh mục quyền dùng chung.
  Cấp qua vai trò và phạm vi cửa hàng như các quyền POS hiện có; không tự cấp cho mọi thu ngân.
- Quản trị cấu hình: `pos.settings.read` để xem; `pos.settings.manage` để lưu.
  Quyền mở thủ công không tự cho phép chỉnh cấu hình tập trung.
- JPULSE: **Quản lý JPOS → Cấu hình → Két tiền**, chọn từng máy đang hoạt động.
  Bật/tắt tự mở sau tiền mặt, chọn ESC/POS–TSPL và chân 2/5; TSPL chỉ chân 2.
- Máy in vẫn chọn tại từng JPOS, cấu hình két không chứa tên máy in hay thông tin kích hoạt.

## Schema và ownership

`pos_cash_drawer_settings/{device_id}` là collection POS-owned mới, được JPULSE
backend quản lý theo types trong `packages/shared-types/src/posCashDrawer.ts`.
Không trùng collection khác theo kiểm tra cả POS và bduck-system. Document chứa
`device_id`, `warehouse_id`, giá trị cấu hình, `version`, `updated_by`, các thời
điểm ISO và `is_deleted`. Không chứa credential/hash/PIN kích hoạt máy.

Backend xác thực JWT và kiểm tra quyền tại cửa hàng hiện tại của máy.
Transaction đọc lại thiết bị để chặn race khi khóa/chuyển cửa hàng, kiểm tra
`expected_version`, tăng version và ghi `audit_logs` với người thao tác,
old/new value, `action_time` của client và `sync_time` server. Không hard delete.
Đọc theo device_id hoặc một điều kiện warehouse_id không cần composite index mới.

Firestore Rules cho phép quản trị đọc theo `pos.settings.read`; thu ngân đọc
document tại cửa hàng có `pos.login` để nhận realtime. Mọi client write bị chặn.
Collection thiết bị/credential vẫn backend-only. Document chưa tồn tại được
đọc là null theo cửa hàng của thiết bị mà không lộ credential.

JPOS nhận cấu hình trong config API và listener Firestore. Cache lưu theo
device/cửa hàng, bỏ phiên bản cũ hơn và loại cấu hình sai scope. Mất mạng giữ
cache; chuyển thiết bị/cửa hàng không dùng cấu hình cửa hàng trước. Máy chưa có
cấu hình tập trung giữ cấu hình local cũ; lần lưu đầu trên JPULSE bắt đầu quản lý
tập trung, JPOS khóa phần chỉnh local nhưng vẫn có nút thử/mở theo quyền.

## Đưa vào sử dụng

1. Deploy shared types/backend và frontend JPULSE, deploy **rules hợp nhất của
   bduck-system**, không deploy riêng rules từ repository POS.
2. Phát hành JPOS có listener và schema mới. Các phiên bản JPOS cũ chưa nhận cấu
   hình két tập trung; việc mở két hiện tại của chúng không đổi.
3. Cấp quyền mở két cho vai trò cần thiết. Dùng cơ chế cập nhật access hiện có;
   xác nhận phiên đăng nhập JPOS đã nhận quyền mới.
4. Lưu cấu hình riêng cho hai máy, kiểm tra realtime, offline/restart và kiểm tra
   rằng sửa máy A không thay đổi máy B. Thử cả tài khoản có/không có quyền mở.

Không tự sửa vai trò hoặc cấu hình production trong quá trình phát triển.
