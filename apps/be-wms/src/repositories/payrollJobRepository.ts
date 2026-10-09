import { createHash } from "node:crypto";
import type { PayrollJobMetadata, PayrollJobItem } from "@bduck/shared-types";
import { db } from "../config/firebase.js";
import { payrollRef, writePayrollAudit } from "./payrollRepository.js";
function payrollError(vi: string, zh: string): never { throw { statusCode: 409, messages: { vi, zh } }; }
export const emailFingerprint = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
export const receiptRef = (actor: string, session: string, email: string) =>
  db.collection("payroll_session_receipts").doc(createHash("sha256").update(actor + ":" + session + ":" + emailFingerprint(email)).digest("hex"));
export async function findPayrollReceipt(actor: string, session: string, email: string) { return receiptRef(actor, session, email).get(); }
export async function existsPayrollJobItem(jobId: string, personId: string) { return (await payrollRef("jobs", jobId).collection("items").doc(personId).get()).exists; }

export async function createPayrollJobRecord(job: PayrollJobMetadata) {
const id = job.id; const actor = job.created_by; const meta = { facility_id: job.facility_id };
return db.runTransaction(async tx => {
    const ref = payrollRef("jobs", id); const old = await tx.get(ref);
    if (old.exists) return false;
    tx.create(ref, job); writePayrollAudit(tx, "payroll_email_jobs", id, actor, meta.facility_id, null, { ...job });
    return true;
  });
}

export async function createPayrollPreparedItem(jobId: string, personId: string, path: string, email: string, actor: string, session: string, index: number) {
const ref = payrollRef("jobs", jobId).collection("items").doc(personId);
return db.runTransaction(async tx => {
      const [item, current] = await Promise.all([tx.get(ref), tx.get(payrollRef("jobs", jobId))]);
      if (item.exists || current.get("status") !== "PREPARING") return;
      tx.create(ref, { id: personId, status: "QUEUED", payload_path: path, chunk: Math.floor(index / 25),
        receipt_id: receiptRef(actor, session, email).id,
        attempt: 1, error: null, message_id: null, next_retry_at: new Date(), updated_at: new Date() } satisfies PayrollJobItem);
    });
}

export async function advancePayrollPreparation(jobId: string, start: number, end: number, total: number) {
return db.runTransaction(async tx => {
    const ref = payrollRef("jobs", jobId); const doc = await tx.get(ref);
    if (doc.get("status") !== "PREPARING" || (doc.get("prepared_count") ?? 0) !== start) return;
    const now = new Date(); const after = { ...doc.data(), prepared_count: end, status: end === total ? "QUEUED" : "PREPARING",
      revision: doc.get("revision") + 1, enqueue_pending: true, updated_at: now, sync_time: now };
    tx.set(ref, after); writePayrollAudit(tx, "payroll_email_jobs", jobId, doc.get("created_by"), doc.get("facility_id"), doc.data()!, after);
  });
}

export async function resetPayrollFailedItems(id: string, ids: string[], actor: string, facility: string) {
return db.runTransaction(async tx => {
    const ref = payrollRef("jobs", id); const current = (await tx.get(ref)).data() as PayrollJobMetadata;
    const docs = await Promise.all(ids.map(person => tx.get(ref.collection("items").doc(person))));
    if (docs.some(d => !d.exists || d.get("status") !== "FAILED"))
      payrollError("Chỉ có thể thử lại những người gửi lỗi xác định; người đã gửi hoặc chưa rõ kết quả không được tự gửi lại.",
        "仅可重试明确失败的收件人；已发送或结果未知的收件人不能自动重发。");
    for (const doc of docs) tx.update(doc.ref, { status: "QUEUED", error: null, attempt: doc.get("attempt") + 1, updated_at: new Date() });
    const after = { ...current, status: "QUEUED", failed: current.failed - docs.length,
      revision: current.revision + 1, enqueue_pending: true, updated_at: new Date(), action_time: new Date() };
    tx.set(ref, after); writePayrollAudit(tx, "payroll_email_jobs", id, actor, facility, { ...current }, after);
  });
}
