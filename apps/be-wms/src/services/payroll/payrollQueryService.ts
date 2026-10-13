import { payrollHistoryStatus, payrollHistoryAttempt, type PayrollHistoryFilters, type PayrollSnapshot, type PayrollDeliveryStatus, type PayrollItemStatus, type PayrollTrackingField } from "@bduck/shared-types";
import type { AuthorizationService } from "../authorization/index.js";
import { findPayrollDrafts, findPayrollSentPage, findPayrollSentRecord } from "../../repositories/payrollQueryRepository.js";
import { assertPayroll } from "./payrollAccess.js";
import { readPayrollPayload } from "./payrollCrypto.js";
import { payrollError } from "./payrollSchemas.js";
export async function fetchPayrollDrafts(facility: string, actor: string, access: AuthorizationService) {
  assertPayroll(access, "notifications.payroll.compose", facility);
  return findPayrollDrafts(facility, actor);
}
export async function fetchPayrollHistory(facility: string, after: string | undefined, access: AuthorizationService, filters: PayrollHistoryFilters = {}) {
  assertPayroll(access, "notifications.payroll.history.read", facility);
  const entries: Awaited<ReturnType<typeof findPayrollSentPage>>["entries"] = [];
  let cursor = after; let next: string | null = null; let scanned = 0;
  do {
    const page = await findPayrollSentPage(facility, cursor, filters, 100);
    for (const entry of page.entries) {
      scanned++; next = entry.id;
      const record = entry as typeof entry & { submission_status?: PayrollItemStatus; delivery_status?: PayrollDeliveryStatus };
      if (!filters.status || filters.status === "ALL" || payrollHistoryStatus(record) === filters.status) entries.push(entry);
      if (entries.length === 25) break;
    }
    if (entries.length === 25) break;
    if (!page.cursor) { next = null; break; }
    cursor = page.cursor;
  } while (scanned < 500);
  return { records: await Promise.all(entries.map(hydrateHistory)), cursor: next };
}
async function hydrateHistory(entry: Awaited<ReturnType<typeof findPayrollSentPage>>["entries"][number]) {
    const metadata = entry as typeof entry & { tracking?: Partial<Record<PayrollTrackingField, { toDate(): Date }>>; submission_status?: PayrollItemStatus; delivery_status?: PayrollDeliveryStatus; delivery_payload_path?: string; delivery_updated_at?: { toDate(): Date }; attempt?: number; error?: { vi: string; zh: string } | null };
    const delivery = metadata.delivery_payload_path ? await readPayrollPayload<{ reason: string }>(metadata.delivery_payload_path, "delivery:" + entry.id + ":" + entry.facility_id) : null;
    return { ...entry, submission_status: metadata.submission_status || "SENT", delivery_status: metadata.delivery_status || "PENDING",
      tracking: Object.fromEntries(Object.entries(metadata.tracking || {}).map(([field, value]) => [field, value.toDate().toISOString()])),
      delivery_updated_at: metadata.delivery_updated_at?.toDate?.().toISOString() || null, attempt: payrollHistoryAttempt(metadata) ?? 1,
      error: metadata.error || null, delivery_reason: delivery?.reason || null,
      snapshot: await readPayrollPayload<PayrollSnapshot>(entry.payload_path, "snapshot:" + entry.job_id + ":" + entry.recipient_id + ":" + entry.facility_id) };
}
export async function fetchPayrollHistoryRecord(id: string, access: AuthorizationService) {
  const record = await findPayrollSentRecord(id);
  if (!record) payrollError("Email lịch sử không tồn tại.", "历史邮件不存在。", 404);
  assertPayroll(access, "notifications.payroll.history.read", record.facility_id);
  return hydrateHistory({ ...record, created_at: record.created_at.toISOString() });
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
