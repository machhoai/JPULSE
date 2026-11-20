import {
  LayoutDashboard, Megaphone, MonitorSmartphone, PackageSearch, Settings2, ShoppingBag,
} from "lucide-react";

export const jposSections = [
  { id: "overview", vi: "Tổng quan", zh: "总览", icon: LayoutDashboard },
  { id: "devices", vi: "Thiết bị", zh: "设备", icon: MonitorSmartphone },
  { id: "orders", vi: "Đơn hàng", zh: "订单", icon: ShoppingBag },
  { id: "settings", vi: "Cấu hình", zh: "配置", icon: Settings2 },
  { id: "products", vi: "Sản phẩm hiển thị", zh: "显示商品", icon: PackageSearch },
  { id: "advertising", vi: "Quảng cáo", zh: "广告", icon: Megaphone },
] as const;

export type JposSection = (typeof jposSections)[number]["id"];

export const jposReadPermissions = [
  "pos.devices.read",
  "pos.orders.read",
  "pos.settings.read",
  "pos.advertising.read",
] as const;
