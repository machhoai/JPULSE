import { prepareApprovalsForEntity } from "./approvalPreparationService.js";
import { completePreparedApprovals } from "./approvalService.js";

export async function prepareExternalVoucherRevision(voucherId: string, warehouseId: string, creatorId: string) {
  const plan = await prepareApprovalsForEntity({
    entityType: "EXPORT_VOUCHER", entityId: voucherId, warehouseId, creatorId,
    options: { minLevel: 1, maxLevel: 2, configEntityType: "EXTERNAL_QUEUE_EXPORT" },
  });
  if (plan.mode !== "RECORDS") {
    throw Object.assign(new Error("VOUCHER_REVISION_APPROVAL_REQUIRED"), {
      statusCode: 409,
      messages: { vi: "Cần cấu hình cấp duyệt đang hoạt động để gửi duyệt lại.", zh: "重新提交前，需要配置启用的审批层级。" },
    });
  }
  return plan;
}

export async function notifyExternalVoucherRevision(plan: Awaited<ReturnType<typeof prepareExternalVoucherRevision>>) {
  try {
    await completePreparedApprovals(plan);
  } catch (error) {
    console.error("[externalVoucherRevision] approval notification failed:", error);
  }
}
