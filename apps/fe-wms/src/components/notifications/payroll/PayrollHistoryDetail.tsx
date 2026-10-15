"use client";
import type { PayrollHistoryEntry } from "@bduck/shared-types";
import { doc, onSnapshot } from "firebase/firestore";
import { X, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { payrollApi } from "@/api/payrollEmailApi";
import type { PayrollComposerState } from "@/hooks/usePayrollComposer";
import { db } from "@/lib/firebase";
import type { PayrollText } from "@/lib/i18n/payrollEmailTranslations";
import { payrollDeliveryReason, payrollDeliveryFeedback } from "@/utils/payrollHistory";

import { PayrollDeliverySummary } from "./PayrollDeliverySettings";
import PayrollHistoryResend from "./PayrollHistoryResend";
import PayrollHistoryStatusBadge from "./PayrollHistoryStatusBadge";
import PayrollHistoryTracking from "./PayrollHistoryTracking";

interface DetailProps { record: PayrollHistoryEntry; state: PayrollComposerState; text: PayrollText; lang: "vi" | "zh"; close: () => void; download?: () => void; busy: boolean }
export default function PayrollHistoryDetail({ record: initial, state, text, lang, close, download, busy }: DetailProps) {
  const [record, setRecord] = useState(initial);
  const [error, setError] = useState("");
  useEffect(() => { setRecord(initial); }, [initial]);
  useEffect(() => {
    let active = true, request = 0;
    const stop = onSnapshot(doc(db, "payroll_email_sent_records", initial.id), () => {
      const seq = ++request;
      void payrollApi<PayrollHistoryEntry>("/history/" + initial.id, "GET", undefined, lang).then(next => {
        if (active && request === seq && next.facility_id === initial.facility_id) { setRecord(next); setError(""); }
      }).catch(e => { if (active && request === seq) setError(e.message); });
    }, () => { if (active) setError(text.historyLiveError); });
    return () => { active = false; stop(); };
  }, [initial.id, initial.facility_id, lang, text.historyLiveError]);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const feedback = payrollDeliveryFeedback(record.delivery_status);
  const reason = feedback ? record.delivery_reason : null;
  return <dialog ref={dialog} onCancel={close} aria-labelledby="payroll-history-detail-title" className="m-auto max-h-[90dvh] w-[90%] max-w-[1040px] overflow-y-auto rounded-2xl border border-border-subtle bg-surface-elevated p-4 text-text-primary shadow-xl backdrop:bg-black/30">
    <header className="flex items-center justify-between gap-3 border-b border-border-soft pb-3">
      <h3 id="payroll-history-detail-title" className="text-base font-semibold">{text.historyDetail}</h3>
      <button type="button" aria-label={text.close} className="flex size-8 items-center justify-center rounded-lg hover:bg-surface-base" onClick={close}><X size={16} /></button>
    </header>
    <div className="my-3 grid gap-3 sm:grid-cols-2">
      <div className="min-w-0 text-sm"><p className="font-semibold">{record.snapshot.name}</p><p className="break-all text-text-muted">{record.snapshot.email}</p></div>
      <div className="flex flex-wrap items-center justify-between gap-2"><PayrollHistoryStatusBadge record={record} text={text} /><span className="text-xs text-text-muted">{text.historyAttempt}: {record.attempt || 1}</span></div>
      <p className="break-words text-sm sm:col-span-2"><span className="font-medium">{text.subject}: </span>{record.snapshot.subject}</p>
      <p className="text-xs text-text-muted">{text.historyDate}: {new Date(record.created_at).toLocaleString(lang === "vi" ? "vi-VN" : "zh-CN", { timeZone: "Asia/Ho_Chi_Minh" })}</p>
      <p className="text-xs text-text-muted">{text.historySubmission}: {record.submission_status === "SENT" || !record.submission_status ? text.historyAccepted : record.submission_status === "FAILED" ? text.failed : record.submission_status === "UNKNOWN" ? text.unknown : text.processing}</p>
    </div>
    {error && <p role="alert" className="mb-3 rounded-lg bg-error-bg p-3 text-sm text-error-text">{error}</p>}
    <div className="mb-3"><PayrollDeliverySummary options={record.snapshot} text={text} /></div>
    <PayrollHistoryTracking record={record} text={text} lang={lang} />
    {record.error && <div role="alert" className="mb-3 rounded-lg bg-warning-bg p-3 text-sm text-warning-text">{record.error[lang]}</div>}
    {reason && <section className={`mb-3 space-y-2 rounded-lg border p-3 ${feedback === "DEFERRED" ? "border-warning-border bg-warning-bg text-warning-text" : "border-error-border bg-error-bg text-error-text"}`}>
      <h4 className="text-sm font-semibold">{feedback === "DEFERRED" ? text.historyDeliveryDeferred : text.historyDeliveryError}</h4>
      <p className="text-sm">{payrollDeliveryReason(reason, lang)}</p>
      <details><summary className="cursor-pointer text-xs">{feedback === "DEFERRED" ? text.historyRawDeliveryInfo : text.historyRawError}</summary><pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs">{reason}</pre></details>
    </section>}
    <iframe title={text.historyContent} sandbox="" referrerPolicy="no-referrer" className="h-96 w-full rounded-lg border border-border-subtle bg-white" srcDoc={record.snapshot.html} />
    <PayrollHistoryResend key={record.id} record={record} state={state} />
    <footer className="mt-3 flex justify-end gap-2">
      {download && <button disabled={busy} className="inline-flex h-8 items-center gap-2 rounded-lg border border-border-subtle px-3 text-sm disabled:opacity-50" onClick={download}><Download size={14} />{text.export}</button>}
      <button className="h-8 rounded-lg bg-brand-primary px-3 text-sm font-medium text-white" onClick={close}>{text.close}</button>
    </footer>
  </dialog>;
}
