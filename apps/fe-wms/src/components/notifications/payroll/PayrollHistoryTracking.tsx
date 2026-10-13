import type { PayrollHistoryEntry } from "@bduck/shared-types";
import type { PayrollText } from "@/lib/i18n/payrollEmailTranslations";

export default function PayrollHistoryTracking({ record, text, lang }: { record: PayrollHistoryEntry; text: PayrollText; lang: "vi" | "zh" }) {
  const tracking = record.tracking || {};
  const format = (stamp: string) => new Date(stamp).toLocaleString(lang === "vi" ? "vi-VN" : "zh-CN", { timeZone: "Asia/Ho_Chi_Minh" });
  const delivered = tracking.delivered_at || (record.delivery_status === "DELIVERED" ? record.delivery_updated_at : null);
  const milestones = [
    { label: text.historySent, stamp: tracking.sent_at, known: Boolean(tracking.sent_at || record.submission_status === "SENT"), detail: text.historySentHint },
    { label: text.historyReceived, stamp: delivered, known: Boolean(delivered || record.delivery_status === "DELIVERED"), detail: text.historyReceivedHint },
    { label: text.historyOpened, stamp: tracking.first_opened_at, known: Boolean(tracking.first_opened_at), detail: text.historyOpenedHint },
  ];
  return <section aria-label={text.historyTracking} className="mb-3 space-y-2">
    <div className="grid gap-3 sm:grid-cols-3">{milestones.map(m => <div key={m.label} className="space-y-1 rounded-lg border border-border-subtle bg-surface-card p-3">
      <p className={`text-sm font-medium ${m.known ? "text-success-text" : "text-text-muted"}`}>{m.label}</p>
      <p className="text-xs text-text-secondary">{m.stamp ? format(m.stamp) : m.known ? text.historyTimeUnavailable : text.historyNotRecorded}</p>
      <p className="text-xs text-text-muted">{m.detail}</p>
    </div>)}</div>
    {tracking.last_opened_at && tracking.last_opened_at !== tracking.first_opened_at && <p className="text-xs text-text-muted">{text.historyLastOpened}: {format(tracking.last_opened_at)}</p>}
    {tracking.first_proxy_opened_at && <p className="rounded-lg bg-warning-bg p-3 text-xs text-warning-text">{text.historyProxyOpened}: {format(tracking.first_proxy_opened_at)}. {text.historyProxyHint}</p>}
  </section>;
}
