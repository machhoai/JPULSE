import { randomUUID } from "node:crypto";
import type { PayrollJobMetadata, PayrollJobItem, PayrollSnapshot } from "@bduck/shared-types";
import { db } from "../config/firebase.js";
import { payrollRef, writePayrollAudit } from "./payrollRepository.js";
import { receiptRef } from "./payrollJobRepository.js";
export const payrollTime = (value: unknown) => value instanceof Date ? value.getTime() :
  value && typeof value === "object" && "toMillis" in value ? (value as { toMillis(): number }).toMillis() : 0;
const leaseMs = 5 * 60 * 1000;
export async function claimPayrollItems(id: string) {
  return db.runTransaction(async tx => {
    const ref = payrollRef("jobs", id); const doc = await tx.get(ref);
    if (!doc.exists) return null;
    const job = doc.data() as PayrollJobMetadata;
    if (!["QUEUED","PROCESSING"].includes(job.status) || payrollTime(job.lease_until) > Date.now()) return null;
    const stale = await tx.get(ref.collection("items").where("status", "==", "PROCESSING"));
    const queued = await tx.get(ref.collection("items").where("status", "==", "QUEUED").orderBy("chunk").limit(25));
    const receipts = await Promise.all(stale.docs.filter(d => d.get("receipt_id")).map(d => tx.get(db.collection("payroll_session_receipts").doc(d.get("receipt_id")))));
    const now = new Date(); const token = randomUUID();
    stale.docs.forEach(d => tx.update(d.ref, { status: "UNKNOWN", error: {
      vi: "Worker bị gián đoạn trong lúc gửi. SMTP có thể đã nhận thư; cần đối chiếu trước khi gửi lại.",
      zh: "工作器在发送时中断；SMTP 可能已收到邮件，请核对后再重新发送。" }, updated_at: now }));
    receipts.filter(d => d.exists && d.get("job_id") === id && d.get("status") === "PROCESSING").forEach(d => tx.update(d.ref, { status: "UNKNOWN", updated_at: now }));
    const after = { ...job, status: "PROCESSING" as const, lease_token: token, lease_until: new Date(Date.now() + leaseMs),
      unknown: job.unknown + stale.size, revision: job.revision + 1, updated_at: now, sync_time: now };
    tx.set(ref, after);
    writePayrollAudit(tx, "payroll_email_jobs", id, job.created_by, job.facility_id, { ...job }, { ...after });
    return { job: after, items: queued.docs.map(d => d.data() as PayrollJobItem).filter(item => payrollTime(item.next_retry_at) <= Date.now()), token };
  });
}
export async function completePayrollItem(job: PayrollJobMetadata, item: PayrollJobItem, token: string, snapshot: PayrollSnapshot,
  status: "SENT" | "FAILED" | "UNKNOWN" | "QUEUED", messageId: string | null, error: PayrollJobItem["error"]) {
  await db.runTransaction(async tx => {
    const ref = payrollRef("jobs", job.id); const itemRef = ref.collection("items").doc(item.id);
    const [j, i] = await Promise.all([tx.get(ref), tx.get(itemRef)]);
    if (j.get("lease_token") !== token || i.get("status") !== "PROCESSING") return;
    const now = new Date(); const after = { ...i.data(), status, message_id: messageId, error, updated_at: now,
      ...(status === "QUEUED" ? { attempt: item.attempt + 1, next_retry_at: new Date(Date.now() + Math.min(60000, 5000 * 2 ** item.attempt)) } : {}) };
    tx.set(itemRef, after);
    tx.update(ref, { sent: j.get("sent") + (status === "SENT" ? 1 : 0),
      failed: j.get("failed") + (status === "FAILED" ? 1 : 0), unknown: j.get("unknown") + (status === "UNKNOWN" ? 1 : 0),
      lease_until: new Date(Date.now() + leaseMs), updated_at: now, sync_time: now });
    if (status === "SENT") {
      const recordId = job.id + "_" + item.id + "_" + item.attempt;
      const history = { id: recordId, facility_id: job.facility_id, job_id: job.id, created_by: job.created_by,
        payload_path: item.payload_path, recipient_id: item.id, message_id: messageId,
        action_time: job.action_time, sync_time: now, created_at: now, updated_at: now, is_deleted: false };
      tx.set(payrollRef("history", recordId), history);
      tx.set(receiptRef(job.created_by, job.session_id, snapshot.email), { record_id: recordId, status: "SENT", job_id: job.id, updated_at: now });
      writePayrollAudit(tx, "payroll_email_sent_records", recordId, job.created_by, job.facility_id, null, history);
    }
    if (status !== "SENT") tx.set(receiptRef(job.created_by, job.session_id, snapshot.email), {
      record_id: job.id + "_" + item.id + "_" + item.attempt, job_id: job.id, status: status === "QUEUED" ? "PROCESSING" : status, updated_at: now });
    writePayrollAudit(tx, "payroll_email_job_items", item.id, job.created_by, job.facility_id, i.data()!, after);
  });
}

export async function beginPayrollItem(claimed: { job: PayrollJobMetadata; token: string }, item: PayrollJobItem, snapshot: PayrollSnapshot) {
const id = claimed.job.id;
return db.runTransaction(async tx => {
        const ref = payrollRef("jobs", id); const itemRef = ref.collection("items").doc(item.id);
        const receipt = receiptRef(claimed.job.created_by, claimed.job.session_id, snapshot.email);
        const [j, i, prior] = await Promise.all([tx.get(ref), tx.get(itemRef), tx.get(receipt)]);
        if (j.get("lease_token") !== claimed.token || i.get("status") !== "QUEUED") return false;
        if (prior.exists && prior.get("job_id") !== id && (prior.get("status") === "PROCESSING" ||
          ["SENT", "UNKNOWN"].includes(prior.get("status")) && !(claimed.job.confirmed_receipt_ids || []).includes(prior.get("record_id")))) {
          tx.update(itemRef, { status: "FAILED", error: { vi: "Người nhận vừa được gửi hoặc đang gửi bởi đợt khác trong phiên này. Hãy đối chiếu trước khi tạo đợt gửi mới.", zh: "收件人刚刚或正在本会话的其他任务中发送，请先核对再创建新任务。" }, updated_at: new Date() });
          tx.update(ref, { failed: j.get("failed") + 1 }); return false;
        }
        tx.update(itemRef, { status: "PROCESSING", updated_at: new Date() });
        tx.set(receipt, { status: "PROCESSING", job_id: id, record_id: id + "_" + item.id + "_" + item.attempt, updated_at: new Date() });
        tx.update(ref, { lease_until: new Date(Date.now() + leaseMs) });
        return true;
      });
}

export async function finalizePayrollJob(id: string, token: string) {
return db.runTransaction(async tx => {
    const ref = payrollRef("jobs", id); const doc = await tx.get(ref);
    if (doc.get("lease_token") !== token) return null;
    const queued = await tx.get(ref.collection("items").where("status", "==", "QUEUED").orderBy("next_retry_at").limit(1));
    const job = doc.data() as PayrollJobMetadata;
    const after = { ...job, status: queued.empty ? (job.failed || job.unknown ? "PARTIAL" : "COMPLETED") : "QUEUED",
      lease_token: null, lease_until: null, revision: job.revision + 1, enqueue_pending: !queued.empty, updated_at: new Date() };
    const wakeAt = queued.empty ? null : queued.docs[0].get("next_retry_at");
    const withWake = { ...after, wake_at: wakeAt };
    tx.set(ref, withWake);
    writePayrollAudit(tx, "payroll_email_jobs", id, job.created_by, job.facility_id, { ...job }, { ...withWake });
    return withWake;
  });
}
