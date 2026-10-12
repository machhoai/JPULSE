import { db } from "../config/firebase.js";
import { payrollCollections, payrollRef } from "./payrollRepository.js";
import type { PayrollJobItem, PayrollJobMetadata } from "@bduck/shared-types";
export async function findPayrollCatalogRecords() {
  const [templates, signatures] = await Promise.all([
    db.collection(payrollCollections.templates).where("is_deleted", "==", false).get(),
    db.collection(payrollCollections.signatures).where("is_deleted", "==", false).get(),
  ]);
  return { templates: templates.docs.map(d => d.data()), signatures: signatures.docs.map(d => d.data()) };
}
export async function findPayrollFacilityRecord(id: string) {
  const doc = await db.collection("warehouses").doc(id).get();
  return doc.exists ? doc.data()! : null;
}
export async function findPayrollRecipientRecord(draft: string, id: string) {
  const doc = await payrollRef("drafts", draft).collection("recipients").doc(id).get();
  return doc.exists ? { id: doc.id, payload_path: doc.get("payload_path") as string, draft_revision: doc.get("draft_revision") as number } : null;
}
export async function findPayrollRecipientPage(draft: string, revision: number, after?: string) {
  let query = payrollRef("drafts", draft).collection("recipients").where("draft_revision", "==", revision).orderBy("id").limit(25);
  if (after) query = query.startAfter(after);
  const docs = await query.get();
  return { entries: docs.docs.map(doc => ({ id: doc.id, payload_path: doc.get("payload_path") as string })),
    cursor: docs.size === 25 ? docs.docs.at(-1)!.id : null };
}
export async function findPayrollDrafts(facility: string, actor: string) {
  const docs = await db.collection(payrollCollections.drafts).where("created_by", "==", actor).where("facility_id", "==", facility).where("is_deleted", "==", false).get();
  return docs.docs.map(d => d.data());
}
export async function findPayrollSentPage(facility: string, after?: string) {
  let query = db.collection(payrollCollections.history).where("facility_id", "==", facility).where("is_deleted", "==", false).orderBy("created_at", "desc").limit(25);
  if (after) { const cursor = await payrollRef("history", after).get(); if (cursor.exists && cursor.get("facility_id") === facility) query = query.startAfter(cursor); }
  const docs = await query.get();
  return { entries: docs.docs.map(d => ({ ...d.data(), id: d.id, facility_id: d.get("facility_id") as string,
    job_id: d.get("job_id") as string, recipient_id: d.get("recipient_id") as string, payload_path: d.get("payload_path") as string,
    message_id: d.get("message_id") as string | null, created_at: d.get("created_at").toDate().toISOString() as string })),
    cursor: docs.size === 25 ? docs.docs.at(-1)!.id : null };
}
export async function findPayrollSentRecord(id: string) {
  const doc = await payrollRef("history", id).get();
  if (!doc.exists || doc.get("is_deleted")) return null;
  return { id, facility_id: doc.get("facility_id") as string, job_id: doc.get("job_id") as string,
    recipient_id: doc.get("recipient_id") as string, payload_path: doc.get("payload_path") as string,
    message_id: doc.get("message_id") as string | null, created_at: doc.get("created_at").toDate() as Date };
}
export async function findPayrollJobItems(id: string) {
  const docs = await payrollRef("jobs", id).collection("items").orderBy("chunk").get();
  return docs.docs.map(d => d.data() as PayrollJobItem);
}
export async function findPayrollPendingJobs() {
  const docs = await db.collection("payroll_email_jobs").where("status", "in", ["PREPARING","QUEUED","PROCESSING"]).get();
  return docs.docs.map(d => d.data() as PayrollJobMetadata);
}
export async function markPayrollDispatch(id: string, revision?: number) {
  await db.runTransaction(async tx => {
    const ref = payrollRef("jobs", id); const doc = await tx.get(ref);
    if (!doc.exists || revision !== undefined && doc.get("revision") !== revision) return;
    tx.update(ref, { enqueue_pending: false });
  });
}
export async function bumpPayrollDispatchRevision(id: string) {
  return db.runTransaction(async tx => {
    const ref = payrollRef("jobs", id); const doc = await tx.get(ref);
    if (!doc.exists || !["PREPARING", "QUEUED", "PROCESSING"].includes(doc.get("status"))) return null;
    const wake = doc.get("wake_at"); const lease = doc.get("lease_until");
    if (wake?.toMillis?.() > Date.now() || lease?.toMillis?.() > Date.now()) return null;
    const revision = doc.get("revision") + 1;
    tx.update(ref, { revision, enqueue_pending: true }); return revision;
  });
}
