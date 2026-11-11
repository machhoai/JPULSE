import { randomUUID } from "node:crypto";

import {
  AuditAction,
  MARKETING_VOUCHER_CODES_COLLECTION,
  marketingVoucherToday,
  type ExtendMarketingVoucherCampaignInput,
  type MarketingVoucherCampaignMutationResult,
} from "@bduck/shared-types";

import { db } from "../config/firebase.js";

import {
  loadMarketingVoucherMutationResult,
  newMarketingVoucherJob,
  type MarketingVoucherMutationPointer,
} from "./marketingVoucherJobMutationHelpers.js";
import {
  campaignRef,
  jobRef,
  mapMarketingVoucherCampaign,
  marketingVoucherError,
  prepareMarketingVoucherOperation,
  writeMarketingVoucherAudit,
  writeMarketingVoucherOperation,
  type MarketingVoucherOperationContext,
} from "./marketingVoucherRepository.js";
import {
  assertCampaignMutable,
  assertCampaignActivityAllowed,
  assertMarketingVoucherRevision,
} from "./marketingVoucherRepositoryGuards.js";

export const createMarketingVoucherExtensionJobRecord = async (input: {
  campaign_id: string;
  request: ExtendMarketingVoucherCampaignInput;
  context: MarketingVoucherOperationContext;
}): Promise<MarketingVoucherCampaignMutationResult> => {
  const eligibleCount = await db
    .collection(MARKETING_VOUCHER_CODES_COLLECTION)
    .where("campaign_id", "==", input.campaign_id)
    .where("is_deleted", "==", false)
    .where("status", "in", ["AVAILABLE", "DISTRIBUTED"])
    .count()
    .get();
  const total = eligibleCount.data().count;
  const jobId = randomUUID();
  const pointer = await db.runTransaction<MarketingVoucherMutationPointer>(
    async (transaction) => {
      const operation = await prepareMarketingVoucherOperation(
        transaction,
        "EXTEND_EXPIRY",
        input.context,
        { campaign_id: input.campaign_id, request: input.request },
      );
      if (operation.replay) {
        return {
          ...operation.replay,
          replayed: true,
        } as MarketingVoucherMutationPointer;
      }
      const ref = campaignRef(input.campaign_id);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists || snapshot.get("is_deleted") === true) {
        throw marketingVoucherError(
          "MARKETING_VOUCHER_CAMPAIGN_NOT_FOUND",
          { vi: "Không tìm thấy chiến dịch.", zh: "未找到优惠券活动。" },
          404,
        );
      }
      const previous = mapMarketingVoucherCampaign(snapshot);
      assertMarketingVoucherRevision(
        previous.revision,
        input.request.expected_revision,
      );
      assertCampaignMutable(previous);
      assertCampaignActivityAllowed(previous, "EXTEND");
      const now = new Date();
      const targetValidTo = input.request.valid_to;
      if (targetValidTo === previous.valid_to) {
        throw marketingVoucherError(
          "MARKETING_VOUCHER_EXTENSION_DATE_INVALID",
          {
            vi: "Ngày hết hạn mới phải khác ngày hết hạn hiện tại.",
            zh: "新到期日必须与当前到期日不同。",
          },
          400,
        );
      }
      if (targetValidTo < previous.valid_from) {
        throw marketingVoucherError(
          "MARKETING_VOUCHER_DATE_RANGE_INVALID",
          {
            vi: "Ngày hết hạn phải bằng hoặc sau ngày bắt đầu.",
            zh: "到期日期必须等于或晚于生效日期。",
          },
          400,
        );
      }
      if (targetValidTo < previous.valid_to && targetValidTo < marketingVoucherToday(now)) {
        throw marketingVoucherError(
          "MARKETING_VOUCHER_SHORTEN_DATE_IN_PAST",
          {
            vi: "Chỉ có thể rút ngắn ngày hết hạn đến hôm nay hoặc muộn hơn.",
            zh: "缩短有效期时，新到期日不得早于今天。",
          },
          400,
        );
      }
      if (
        previous.active_generation_job_id ||
        previous.active_extension_job_id ||
        previous.active_export_job_id
      ) {
        throw marketingVoucherError(
          "MARKETING_VOUCHER_CAMPAIGN_JOB_CONFLICT",
          {
            vi: "Chiến dịch đang có job thay đổi mã voucher.",
            zh: "活动已有券码变更任务。",
          },
          409,
        );
      }
      const job = newMarketingVoucherJob({
        id: jobId,
        campaignId: previous.id,
        type: "EXTEND_EXPIRY",
        generationMode: null,
        targetValidTo,
        total,
        context: input.context,
        now,
      });
      const updated = {
        ...previous,
        active_extension_job_id: jobId,
        revision: previous.revision + 1,
        updated_by: input.context.actor_id,
        updated_at: now,
        action_time: input.context.action_time,
        sync_time: now,
      };
      const result = { campaign_id: previous.id, job_id: jobId };
      transaction.create(jobRef(jobId), job);
      transaction.set(ref, updated);
      writeMarketingVoucherAudit(transaction, {
        id: `${operation.id}:extend`,
        action: AuditAction.MARKETING_VOUCHER_EXPIRY_EXTEND,
        entity_type: "marketing_voucher_campaigns",
        entity_id: previous.id,
        entity_name: previous.name,
        context: input.context,
        old_value: previous,
        new_value: updated,
        sync_time: now,
        notes: `Queued expiry change from ${previous.valid_to} to ${targetValidTo}`,
      });
      writeMarketingVoucherOperation(
        transaction,
        operation,
        "EXTEND_EXPIRY",
        input.context,
        result,
        now,
      );
      return { ...result, replayed: false };
    },
  );
  return loadMarketingVoucherMutationResult(pointer);
};
