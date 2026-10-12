import { payrollHistoryStatus, type PayrollHistoryEntry } from "@bduck/shared-types";
import type { PayrollText } from "@/lib/i18n/payrollEmailTranslations";
export default function PayrollHistoryStatusBadge({ record, text }: { record: PayrollHistoryEntry; text: PayrollText }) {
  const status = payrollHistoryStatus(record);
  const label = status === "SUCCESS" ? text.historySuccess : status === "ERROR" ? text.historyFailure : record.submission_status === "UNKNOWN" ? text.unknown : text.historyPending;
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${status === "SUCCESS" ? "bg-success-bg text-success-text" : status === "ERROR" ? "bg-error-bg text-error-text" : "bg-warning-bg text-warning-text"}`}>{label}</span>;
}
