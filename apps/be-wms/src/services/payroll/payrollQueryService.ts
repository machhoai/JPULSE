import type { PayrollSnapshot } from "@bduck/shared-types";
import type { AuthorizationService } from "../authorization/index.js";
import { findPayrollDrafts, findPayrollSentPage, findPayrollSentRecord } from "../../repositories/payrollQueryRepository.js";
import { assertPayroll } from "./payrollAccess.js";
import { readPayrollPayload } from "./payrollCrypto.js";
import { payrollError } from "./payrollSchemas.js";
export async function fetchPayrollDrafts(facility: string, actor: string, access: AuthorizationService) {
  assertPayroll(access, "notifications.payroll.compose", facility);
  return findPayrollDrafts(facility, actor);
}
export async function fetchPayrollHistory(facility: string, after: string | undefined, access: AuthorizationService) {
  assertPayroll(access, "notifications.payroll.history.read", facility);
  const page = await findPayrollSentPage(facility, after);
  return { records: await Promise.all(page.entries.map(async entry => ({ ...entry,
    snapshot: await readPayrollPayload<PayrollSnapshot>(entry.payload_path, "snapshot:" + entry.job_id + ":" + entry.recipient_id + ":" + facility) }))), cursor: page.cursor };
}
export async function fetchPayrollHistorySnapshot(id: string, access: AuthorizationService) {
  const record = await findPayrollSentRecord(id);
  if (!record) payrollError("Email lịch sử không tồn tại.", "历史邮件不存在。", 404);
  assertPayroll(access, "notifications.payroll.history.read", record.facility_id);
  assertPayroll(access, "notifications.payroll.download", record.facility_id);
  const snapshot = await readPayrollPayload<PayrollSnapshot>(record.payload_path,
    "snapshot:" + record.job_id + ":" + record.recipient_id + ":" + record.facility_id);
  return { record, snapshot };
}
