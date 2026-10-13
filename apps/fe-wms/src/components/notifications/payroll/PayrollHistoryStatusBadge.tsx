import { payrollHistoryStatus, type PayrollHistoryEntry } from "@bduck/shared-types";
import type { PayrollText } from "@/lib/i18n/payrollEmailTranslations";
export default function PayrollHistoryStatusBadge({ record, text }: { record: PayrollHistoryEntry; text: PayrollText }) {
  const status = payrollHistoryStatus(record);
  const label = status === "SUCCESS" ? text.historySuccess : status === "ERROR" ? text.historyFailure : record.submission_status === "UNKNOWN" ? text.unknown : text.historyPending;
  const detail = record.delivery_status === "SOFT_BOUNCE" ? text.historySoftBounce : record.delivery_status === "HARD_BOUNCE" ? text.historyHardBounce : record.delivery_status === "BLOCKED" ? text.historyBlocked : record.delivery_status === "INVALID" ? text.historyInvalid : record.delivery_status === "DEFERRED" ? text.historyDeferred : record.delivery_status === "DELIVERED" ? text.historyReceived : record.submission_status === "SENT" ? text.historySent : null;
  return <span className="inline-flex flex-wrap items-center gap-1">
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${status === "SUCCESS" ? "bg-success-bg text-success-text" : status === "ERROR" ? "bg-error-bg text-error-text" : "bg-warning-bg text-warning-text"}`}>{label}</span>
    {detail && <span className="text-xs text-text-secondary">{detail}</span>}
    {record.tracking?.first_opened_at && <span className="rounded-full bg-success-bg px-2 py-1 text-xs text-success-text">{text.historyOpened}</span>}
  </span>;
}
