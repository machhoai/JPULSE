import { AuditAction } from "@bduck/shared-types";
import { randomUUID } from "node:crypto";
import { db } from "../config/firebase.js";
import { FieldValue } from "firebase-admin/firestore";
export function touchPayrollCatalog(tx: FirebaseFirestore.Transaction) {
  tx.set(db.collection("payroll_catalog").doc("version"), { revision: FieldValue.increment(1), updated_at: new Date() }, { merge: true });
}
export const payrollCollections = { templates: "payroll_email_templates", signatures: "email_signatures",
  drafts: "payroll_email_drafts", jobs: "payroll_email_jobs", history: "payroll_email_sent_records" } as const;
export function payrollRef(kind: keyof typeof payrollCollections, id: string) {
  return db.collection(payrollCollections[kind]).doc(id);
}
export async function getPayrollRecord<T>(kind: keyof typeof payrollCollections, id: string) {
  const doc = await payrollRef(kind, id).get();
  return doc.exists && doc.get("is_deleted") !== true ? doc.data() as T : null;
}
export function writePayrollAudit(tx: FirebaseFirestore.Transaction, collection: string, id: string, actor: string,
  facility: string | null, before: Record<string, unknown> | null, after: Record<string, unknown>) {
  const ref = db.collection("audit_logs").doc(randomUUID()); const now = new Date();
  tx.create(ref, { id: ref.id, entity_type: collection, entity_id: id, warehouse_id: facility,
    user_id: actor, action: before ? AuditAction.UPDATE : AuditAction.CREATE,
    old_value: before, new_value: after, action_time: after.action_time ?? now, sync_time: now,
    user_name: null, entity_name: null, notes: null, ip_address: null, device_id: null, session_token: null });
}
export async function savePayrollRecord(kind: keyof typeof payrollCollections, id: string, value: Record<string, unknown>,
  expectedRevision: number, actor: string, facility: string | null) {
  return db.runTransaction(async tx => {
    const ref = payrollRef(kind, id); const doc = await tx.get(ref);
    const before = doc.exists ? doc.data()! : null;
    if ((before?.revision ?? 0) !== expectedRevision) throw { statusCode: 409,
      messages: { vi: "Dữ liệu đã được thay đổi ở phiên khác. Vui lòng mở lại bản hiện tại trước khi lưu.",
        zh: "数据已被其他会话修改，请重新打开当前版本后保存。" } };
    const now = new Date(); const after = { ...value, id, revision: expectedRevision + 1,
      created_by: before?.created_by ?? actor, created_at: before?.created_at ?? now,
      updated_at: now, action_time: value.action_time ?? now, sync_time: now, is_deleted: false };
    tx.set(ref, after); writePayrollAudit(tx, payrollCollections[kind], id, actor, facility, before, after);
    if (kind === "templates" || kind === "signatures") touchPayrollCatalog(tx);
    return after;
  });
}
