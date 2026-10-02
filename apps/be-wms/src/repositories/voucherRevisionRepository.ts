import type { ApprovalRecord } from "@bduck/shared-types";

import type { Firestore } from "firebase-admin/firestore";

export interface RejectedRevisionWrite {
  collection: "import_vouchers" | "export_vouchers" | "transfer_orders";
  id: string;
  creatorId: string;
  oldValues: Record<string, unknown>;
  values: Record<string, unknown>;
  items: Array<{ id: string } & Record<string, unknown>>;
  approvals: ApprovalRecord[];
  audit: Record<string, unknown>;
}

export async function commitRejectedRevision(input: RejectedRevisionWrite, injectedDatabase?: Firestore): Promise<void> {
  const database = injectedDatabase ?? (await import("../config/firebase.js")).db;
  const ref = database.collection(input.collection).doc(input.id);
  const approvalQuery = database.collection("pending_approvals").where("entity_id", "==", input.id)
    .where("entity_type", "in", input.collection === "transfer_orders" ? ["TRANSFER_ORDER", "TRANSFER_INTRA"] :
      [input.collection === "import_vouchers" ? "IMPORT_VOUCHER" : "EXPORT_VOUCHER"]);
  await database.runTransaction(async (transaction) => {
    const [current, oldItems, oldApprovals] = await Promise.all([
      transaction.get(ref), transaction.get(ref.collection("items")), transaction.get(approvalQuery),
    ]);
    const data = current.data();
    if (!current.exists || !data || data.status !== "REJECTED" || data.is_deleted !== false ||
      data.creator_id !== input.creatorId ||
      data.warehouse_id !== input.oldValues.warehouse_id ||
      data.source_warehouse_id !== input.oldValues.source_warehouse_id) {
      throw Object.assign(new Error("VOUCHER_REVISION_CONFLICT"), {
        statusCode: 409,
        messages: { vi: "Phiếu đã thay đổi, không thể gửi duyệt lại.", zh: "单据已更改，无法重新提交审批。" },
      });
    }
    const latestAttempt = oldApprovals.docs.reduce(
      (max, doc) => Math.max(max, Number(doc.data().approval_attempt ?? 1)), 0,
    );
    if (input.approvals.some((approval) => approval.approval_attempt !== latestAttempt + 1)) {
      throw Object.assign(new Error("APPROVAL_REVISION_CONFLICT"), {
        statusCode: 409,
        messages: { vi: "Luồng duyệt đã thay đổi. Vui lòng thao tác lại.", zh: "审批流程已更改，请重试。" },
      });
    }
    transaction.update(ref, input.values);
    for (const item of oldItems.docs) {
      transaction.update(item.ref, { is_deleted: true, updated_at: input.values.sync_time });
    }
    for (const item of input.items) transaction.set(ref.collection("items").doc(item.id), item);
    for (const approval of oldApprovals.docs) {
      if (approval.data().status !== "PENDING") continue;
      transaction.update(approval.ref, {
        status: "CANCELLED", sync_time: input.values.sync_time,
        action_time: input.values.action_time, rejected_reason: "Superseded by voucher revision",
      });
    }
    for (const approval of input.approvals) {
      const values = Object.fromEntries(Object.entries(approval).filter(([, value]) => value !== undefined));
      transaction.set(database.collection("pending_approvals").doc(approval.id), values);
    }
    const auditRef = database.collection("audit_logs").doc();
    transaction.set(auditRef, {
      ...input.audit, id: auditRef.id,
      old_value: { ...input.oldValues, items: oldItems.docs.map(item => item.data()) },
    });
  });
}
