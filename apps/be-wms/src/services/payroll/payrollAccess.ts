import type { Request } from "express";
import { requireRequestAuthorization, requireAuthenticatedRequestUser } from "../../api/middlewares/requestAccessContext.js";
import type { AuthorizationService } from "../authorization/index.js";
import { payrollError } from "./payrollSchemas.js";
export function payrollActor(req: Request) {
  return { actor: requireAuthenticatedRequestUser(req).id, access: requireRequestAuthorization(req) };
}
export function assertPayroll(access: AuthorizationService, action: string, facility: string) {
  if (!access.context.isSystemAdmin && !access.can(action, facility))
    payrollError("Bạn không có quyền thực hiện thao tác bảng lương tại cửa hàng của mẫu.",
      "您无权在此模板门店执行工资操作。", 403);
}
export function assertPayrollGlobal(access: AuthorizationService, actions: string[]) {
  if (!access.context.isSystemAdmin && !actions.some(a => access.facilityIdsFor(a).length))
    payrollError("Bạn chưa được cấp quyền sử dụng chức năng này.", "您尚未获得此功能权限。", 403);
}
