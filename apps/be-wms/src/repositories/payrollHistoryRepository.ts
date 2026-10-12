import { FieldValue } from "firebase-admin/firestore";
import type { PayrollJobMetadata, PayrollJobItem } from "@bduck/shared-types";
import { db } from "../config/firebase.js";

export const payrollHistoryId = (job: string, person: string, attempt: number) => job + "_" + person + "_" + attempt;
export function payrollHistoryMetadata(job: PayrollJobMetadata, item: PayrollJobItem, now: Date) {
  return { id: payrollHistoryId(job.id, item.id, item.attempt), facility_id: job.facility_id, job_id: job.id, created_by: job.created_by,
    resend_source_id: job.resend_source_id || null,
    payload_path: item.payload_path, recipient_id: item.id, message_id: null, attempt: item.attempt,
    submission_status: "PROCESSING", delivery_status: "PENDING", error: null,
    action_time: job.action_time, sync_time: now, created_at: now, updated_at: now, is_deleted: false };
}
export function touchPayrollHistory(tx: FirebaseFirestore.Transaction, facility: string) {
  tx.set(db.collection("payroll_history_signals").doc(facility), { facility_id: facility, revision: FieldValue.increment(1), updated_at: new Date() }, { merge: true });
}
