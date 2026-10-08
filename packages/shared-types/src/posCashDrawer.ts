/** POS-owned configuration, one document per enrolled device. No device credentials. */
export const POS_CASH_DRAWER_SETTINGS_COLLECTION = "pos_cash_drawer_settings";
export type PosCashDrawerProtocol = "ESCPOS" | "TSPL";
export interface PosCashDrawerSettingsValue {
  auto_open_enabled: boolean;
  protocol: PosCashDrawerProtocol;
  pin: 2 | 5;
}
export interface PosCashDrawerSettingsInput extends PosCashDrawerSettingsValue {
  expected_version: number;
  action_time: string;
}
export interface PosCashDrawerSettings extends PosCashDrawerSettingsValue {
  id: string;
  device_id: string;
  warehouse_id: string;
  version: number;
  updated_by: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}
