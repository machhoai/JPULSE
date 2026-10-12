"use client";
import { Activity } from "lucide-react";
import PayrollSectionHeading from "./PayrollSectionHeading";
import type { usePayrollDelivery } from "@/hooks/usePayrollDelivery";
import type { PayrollComposerState } from "@/hooks/usePayrollComposer";
import PayrollHistoryList from "./PayrollHistoryList";
export default function PayrollHistoryPanel({ state, delivery }: { state: PayrollComposerState; delivery: ReturnType<typeof usePayrollDelivery> }) {
  const { text, lang } = state;
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
    <PayrollHistoryList state={state} delivery={delivery} />
  </div>;
}
