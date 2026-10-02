import { AuditAction, type ProcessEntityType } from "@bduck/shared-types";

import { commitRejectedRevision, type RejectedRevisionWrite } from "../repositories/voucherRevisionRepository.js";

import { prepareApprovalsForEntity } from "./approvalPreparationService.js";
import { completePreparedApprovals } from "./approvalService.js";

interface RevisionInput extends Omit<RejectedRevisionWrite, "approvals" | "audit"> {
  entityType: ProcessEntityType;
  warehouseId: string;
  actorId: string;
  voucherNumber: string;
  scopeInfo?: { sourceWarehouseId: string; destinationWarehouseId: string };
}

export async function reviseRejectedVoucher(input: RevisionInput): Promise<void> {
  if (input.actorId !== input.creatorId) {
    throw Object.assign(new Error("VOUCHER_REVISION_FORBIDDEN"), {
      statusCode: 403,
      messages: { vi: "Chỉ người tạo phiếu có quyền sửa và gửi duyệt lại.", zh: "只有单据创建人可以修改并重新提交审批。" },
    });
  }
  const plan = await prepareApprovalsForEntity({
    entityType: input.entityType, entityId: input.id, warehouseId: input.warehouseId,
    creatorId: input.creatorId, displayInfo: { voucher_number: input.voucherNumber }, scopeInfo: input.scopeInfo,
  });
  if (plan.mode !== "RECORDS") {
    throw Object.assign(new Error("VOUCHER_REVISION_APPROVAL_REQUIRED"), {
      statusCode: 409,
      messages: {
        vi: "Cần cấu hình cấp duyệt đang hoạt động để gửi duyệt lại phiếu bị từ chối.",
        zh: "重新提交已拒绝单据前，需要配置启用的审批层级。",
      },
    });
  }
  await commitRejectedRevision({
    ...input, approvals: plan.records,
    audit: {
      entity_type: input.entityType, entity_id: input.id, warehouse_id: input.warehouseId,
      action: AuditAction.UPDATE, user_id: input.actorId,
      action_time: input.values.action_time, sync_time: input.values.sync_time,
      old_value: input.oldValues,
      new_value: { ...input.values, approval_attempt: plan.records[0].approval_attempt, items: input.items },
      notes: "Sửa và gửi duyệt lại phiếu bị từ chối",
    },
  });
  // Notification delivery must not turn an already committed revision into a failed submission.
  try {
    await completePreparedApprovals(plan);
  } catch (error) {
    console.error("[voucherRevisionService] approval notification failed:", error);
  }
}
