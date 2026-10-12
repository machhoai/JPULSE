"use client";
import { useState } from "react";
import { History, Activity, Inbox } from "lucide-react";
import PayrollSectionHeading from "./PayrollSectionHeading";
import type { usePayrollDelivery } from "@/hooks/usePayrollDelivery";
import type { PayrollComposerState } from "@/hooks/usePayrollComposer";
import type { PayrollSnapshot } from "@bduck/shared-types";
import { downloadPayrollZip } from "@/api/payrollEmailApi";
export default function PayrollHistoryPanel({ state, delivery }: { state: PayrollComposerState; delivery: ReturnType<typeof usePayrollDelivery> }) {
  const [selected, setSelected] = useState<PayrollSnapshot | null>(null); const { text, lang } = state;
  return <div className="space-y-3">
    {delivery.job && <section className="space-y-3 rounded-xl border border-border-subtle bg-surface-elevated p-4 shadow-sm">
      <PayrollSectionHeading icon={Activity} title={text.progress} />
      <p className="text-xs text-text-muted">{delivery.job.status === "PREPARING" ? text.preparing : delivery.job.status === "COMPLETED" ? text.done : delivery.job.status === "PARTIAL" ? text.failed : text.processing}</p>
      <p className="text-sm">{text.sent}: {delivery.job.sent}/{delivery.job.total} · {text.failed}: {delivery.job.failed} · {text.unknown}: {delivery.job.unknown}</p>
      {delivery.progress.map(p => <div key={p.id} className="border-t border-border-soft pt-2 text-sm">
        <p>{p.name} — {p.email} · {p.status === "SENT" ? text.sent : p.status === "FAILED" ? text.failed : p.status === "UNKNOWN" ? text.unknown : text.queued}</p>
        {p.error && <p className="text-xs text-error-text">{p.error[lang]}</p>}
      </div>)}
      {delivery.job.failed > 0 && <button disabled={state.busy} className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-base disabled:cursor-not-allowed disabled:opacity-50" onClick={delivery.retry}>{text.retry}</button>}
    </section>}
    {state.hasPermission("notifications.payroll.history.read", state.facility) && <section className="space-y-3 rounded-xl border border-border-subtle bg-surface-elevated p-4 shadow-sm">
      <PayrollSectionHeading icon={History} title={text.history} />
      {!delivery.history.length && !delivery.historyError && <div className="flex items-center gap-3 rounded-lg bg-surface-card p-3 text-sm text-text-muted"><Inbox size={18} aria-hidden="true" />{text.historyEmpty}</div>}
      {delivery.historyError && <p className="text-sm text-error-text">{delivery.historyError}</p>}
      {delivery.history.map(record => <div key={record.id} className="flex items-center gap-2 rounded-lg border border-border-soft bg-surface-card p-2">
        <button className="min-w-0 flex-1 break-words text-left text-sm" onClick={() => setSelected(record.snapshot)}>{record.snapshot.name} — {record.snapshot.email}
          <span className="mt-1 block text-xs text-text-muted">{record.snapshot.subject} · {new Date(record.created_at).toLocaleString(lang === "vi" ? "vi-VN" : "zh-CN", { timeZone: "Asia/Ho_Chi_Minh" })}</span></button>
        {state.hasPermission("notifications.payroll.download", state.facility) && <button className="inline-flex h-6 items-center rounded-md border border-border-subtle bg-surface-elevated px-2 text-xs text-text-secondary hover:bg-surface-base disabled:opacity-50" disabled={state.busy}
          onClick={() => void state.run(() => downloadPayrollZip(record.id, [], lang, true))}>{text.export}</button>}
      </div>)}
      {delivery.cursor && <button disabled={state.busy} className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-base disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void state.run(() => delivery.loadHistory(delivery.cursor!))}>{text.more}</button>}
      {selected && <div className="space-y-2"><button className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-base disabled:cursor-not-allowed disabled:opacity-50" onClick={() => setSelected(null)}>{text.close}</button>
        <iframe title={text.history} sandbox="" referrerPolicy="no-referrer" className="h-96 w-full rounded-lg border border-border-subtle bg-surface-elevated" srcDoc={selected.html} /></div>}
    </section>}
  </div>;
}
