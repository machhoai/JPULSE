import type {
  MarketingVoucherCampaign,
  MarketingVoucherCode,
  MarketingVoucherEffectiveStatus,
  MarketingVoucherJob,
  MarketingVoucherPermission,
} from "@bduck/shared-types";

export const marketingVoucherPermissionGranted = (
  hasPermission: (permission: string, facilityId?: string) => boolean,
  workplaceId: string | null | undefined,
  permission: MarketingVoucherPermission,
) => Boolean(workplaceId && hasPermission(permission, workplaceId));

export const getMarketingVoucherEffectiveStatus = (
  code: MarketingVoucherCode,
  campaign: MarketingVoucherCampaign | undefined,
  today: string,
): MarketingVoucherEffectiveStatus => {
  if (code.status === "USED" || code.status === "REVOKED") return code.status;
  if (campaign?.status === "PAUSED") return "PAUSED";
  if (code.valid_to < today) return "EXPIRED";
  return code.status;
};

export const marketingVoucherJobProgress = (job: MarketingVoucherJob) =>
  job.progress.total <= 0
    ? job.status === "COMPLETED"
      ? 100
      : 0
    : Math.min(
        100,
        Math.round((job.progress.processed / job.progress.total) * 100),
      );

export const summarizeMarketingVoucherCampaigns = (
  campaigns: MarketingVoucherCampaign[],
  jobs: MarketingVoucherJob[],
) => ({
  campaigns: campaigns.length,
  activeCampaigns: campaigns.filter((campaign) => campaign.status === "ACTIVE")
    .length,
  totalCodes: campaigns.reduce(
    (sum, campaign) => sum + campaign.code_counts.total,
    0,
  ),
  available: campaigns.reduce(
    (sum, campaign) => sum + campaign.code_counts.available,
    0,
  ),
  distributed: campaigns.reduce(
    (sum, campaign) => sum + campaign.code_counts.distributed,
    0,
  ),
  used: campaigns.reduce((sum, campaign) => sum + campaign.code_counts.used, 0),
  revoked: campaigns.reduce(
    (sum, campaign) => sum + campaign.code_counts.revoked,
    0,
  ),
  activeJobs: jobs.filter((job) =>
    ["QUEUED", "PROCESSING", "PAUSED"].includes(job.status),
  ).length,
});

export { marketingVoucherToday } from "@bduck/shared-types";
