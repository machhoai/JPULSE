import type { PosDevice } from "@bduck/shared-types";

import type { AuthorizationService } from "./authorization/index.js";

class CashDrawerDeviceNotFoundError extends Error {
  readonly statusCode = 404;
  readonly messages = { vi: "Không tìm thấy máy POS.", zh: "未找到 POS 设备。" };
}

export function assertCashDrawerDeviceAccess(
  device: PosDevice | null, authorization: AuthorizationService, permission: "pos.settings.read" | "pos.settings.manage",
): PosDevice {
  if (!device || device.is_deleted) throw new CashDrawerDeviceNotFoundError();
  authorization.assert(permission, device.warehouse_id);
  return device;
}
