"use client";
import { useTranslation } from "@/lib/i18n";

const vi = {
  title: "Két tiền",
  hint: "Cấu hình riêng cho từng máy JPOS, tự cập nhật khi máy online. Máy in được chọn tại máy JPOS.",
  device: "Máy JPOS",
  none: "Chưa có máy JPOS đang hoạt động tại cửa hàng này.",
  enabled: "Tự mở két khi thanh toán tiền mặt thành công",
  protocol: "Loại lệnh mở két",
  pin: "Chân kích",
  escpos: "ESC/POS · Máy in bill BT-T080, XP-80C",
  tspl: "TSPL · 365B ở chế độ in tem",
  save: "Lưu cấu hình cho máy này",
  saving: "Đang lưu cấu hình két…",
  saved: "Đã lưu cấu hình két",
  failed: "Không thể lưu cấu hình két",
  success: "Máy JPOS nhận cấu hình khi online và lưu lại để dùng offline.",
  error: "Kiểm tra kết nối và phiên bản cấu hình, rồi thử lại.",
  retry: "Thử lại",
  conflict:
    "Cấu hình đã thay đổi ở nơi khác. Hãy dùng bản mới trước khi sửa tiếp.",
  useLatest: "Dùng cấu hình mới",
  unmanaged:
    "Chưa có cấu hình tập trung. Cấu hình cục bộ trên máy vẫn được giữ tới lần lưu đầu tiên.",
  readOnly: "Bạn chỉ có quyền xem. Cần quyền quản lý cấu hình POS để lưu.",
  note: "Chuyển khoản, in lại bill và in vé không tự mở két. TSPL dùng chân 2. Mở thủ công yêu cầu quyền Mở két tiền JPOS tại cửa hàng.",
  loadError:
    "Không thể theo dõi cấu hình két. Kiểm tra quyền truy cập hoặc kết nối.",
};
const zh: typeof vi = {
  title: "钱箱",
  hint: "按 JPOS 设备分别配置；设备在线时自动接收更新。打印机在 JPOS 本机选择。",
  device: "JPOS 设备",
  none: "此门店没有活动的 JPOS 设备。",
  enabled: "现金付款成功后自动打开钱箱",
  protocol: "钱箱命令类型",
  pin: "触发引脚",
  escpos: "ESC/POS · BT-T080、XP-80C 小票打印机",
  tspl: "TSPL · 标签模式下的 365B",
  save: "保存此设备配置",
  saving: "正在保存钱箱配置…",
  saved: "钱箱配置已保存",
  failed: "无法保存钱箱配置",
  success: "JPOS 在线时接收配置并缓存供离线使用。",
  error: "请检查连接和配置版本后重试。",
  retry: "重试",
  conflict: "配置已在其他位置更改，请使用最新配置后继续编辑。",
  useLatest: "使用最新配置",
  unmanaged: "尚无集中配置；首次保存前继续使用本机配置。",
  readOnly: "您只有查看权限；保存需要 POS 配置管理权限。",
  note: "转账、重印小票和打印票券不会自动开钱箱。TSPL 使用引脚 2；手动打开需门店的打开 JPOS 钱箱权限。",
  loadError: "无法监听钱箱配置，请检查权限或连接。",
};
export function usePosCashDrawerCopy() {
  const { lang } = useTranslation();
  return { ...(lang === "zh" ? zh : vi), lang };
}
