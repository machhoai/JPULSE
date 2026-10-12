import { db } from "../config/firebase.js";
import { payrollRef, payrollCollections, writePayrollAudit, touchPayrollCatalog } from "./payrollRepository.js";
import type { PayrollDraftMetadata, PayrollEmailTemplate, EmailSignature } from "@bduck/shared-types";
function payrollError(vi: string, zh: string, statusCode = 409): never { throw { statusCode, messages: { vi, zh } }; }

export async function softRemovePayrollCatalog(kind: "templates" | "signatures", id: string, actor: string, old: PayrollEmailTemplate | EmailSignature) {
  await db.runTransaction(async tx => {
    const ref = payrollRef(kind, id); const doc = await tx.get(ref); const before = doc.data()!;
    if (before.revision !== old.revision) payrollError("Mẫu/chữ ký vừa được sửa ở phiên khác. Hãy mở lại trước khi xóa.", "模板或签名刚被其他会话修改，请重新打开后删除。", 409);
    const now = new Date(); const after = { ...before, is_deleted: true, revision: before.revision + 1, updated_at: now, action_time: now, sync_time: now };
    tx.set(ref, after); writePayrollAudit(tx, payrollCollections[kind], id, actor, kind === "templates" ? (old as PayrollEmailTemplate).facility_id : null, before, after);
    touchPayrollCatalog(tx);
  });
}

export async function writePayrollRecipient(draft: PayrollDraftMetadata, id: string, path: string, payloadHash: string, actor: string, action_time?: Date) {
const draftId = draft.id;
  await db.runTransaction(async tx => {
    const ref = payrollRef("drafts", draftId).collection("recipients").doc(id);
    const [old, parent] = await Promise.all([tx.get(ref), tx.get(payrollRef("drafts", draftId))]);
    if (parent.get("revision") !== draft.revision) payrollError("Bản nháp đang được sửa ở tab khác. Hãy mở lại phiên bản mới.", "草稿正在其他标签页修改，请重新打开最新版本。", 409);
    if (old.get("draft_revision") === draft.revision) {
      if (old.get("payload_hash") !== payloadHash) payrollError("Dữ liệu người nhận thay đổi trong cùng phiên lưu. Hãy lưu bản nháp mới.", "同一保存版本内收件人数据已改变，请重新保存草稿。", 409);
      return;
    }
    const after = { id, payload_path: path, payload_hash: payloadHash, draft_revision: draft.revision, updated_at: new Date(), action_time: action_time ?? new Date(), is_deleted: false };
    tx.set(ref, after); writePayrollAudit(tx, "payroll_email_draft_recipients", id, actor, draft.facility_id, old.data() ?? null, after);
  });

}
