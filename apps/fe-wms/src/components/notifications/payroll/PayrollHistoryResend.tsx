"use client";
import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { Send } from "lucide-react";
import { payrollHistoryResendPolicy, type PayrollHistoryEntry, type PayrollJobMetadata } from "@bduck/shared-types";
import type { PayrollComposerState } from "@/hooks/usePayrollComposer";
import { payrollApi } from "@/api/payrollEmailApi";
import { db } from "@/lib/firebase";

export default function PayrollHistoryResend({ record, state }: { record: PayrollHistoryEntry; state: PayrollComposerState }) {
  const { text, lang } = state;
  const [email, setEmail] = useState(record.snapshot.email);
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [job, setJob] = useState<PayrollJobMetadata | null>(null);
  const [error, setError] = useState("");
  const failedJob = useRef("");
  const request = useRef(crypto.randomUUID());
  const lock = useRef(false);
  const policy = payrollHistoryResendPolicy(record);
  const different = email.trim().toLowerCase() !== record.snapshot.email.trim().toLowerCase();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const active = job && ["PREPARING", "QUEUED", "PROCESSING"].includes(job.status);
  const submitted = job && (active || job.sent > 0 || job.unknown > 0);
  useEffect(() => {
    if (!job?.id) return;
    return onSnapshot(doc(db, "payroll_email_jobs", job.id), snapshot => {
      if (snapshot.exists()) {
        const next = snapshot.data() as PayrollJobMetadata; setJob(next);
        if (next.failed > 0 && failedJob.current !== next.id) { failedJob.current = next.id; request.current = crypto.randomUUID(); setConfirmed(false); }
      }
    }, () => state.setError(text.historyLiveError));
  }, [job?.id, state.setError, text.historyLiveError]);
  const send = async () => {
    if (lock.current || submitted || !policy.allowed || !confirmed || !valid || (policy.requireDifferentEmail && !different)) return;
    lock.current = true; setSending(true); setError("");
    const payload = { email: email.trim(), confirmed, request_id: request.current, action_time: new Date().toISOString() };
    try {
      await state.run(async () => {
        if (!navigator.onLine) throw new Error(text.offline);
        try {
          const next = await payrollApi<PayrollJobMetadata>("/history/" + record.id + "/resend", "POST", payload, lang);
          setJob(next); setConfirmed(false);
        } catch (e) { setError(e instanceof Error ? e.message : text.error); throw e; }
      });
    } finally { lock.current = false; setSending(false); }
  };
  if (!state.hasPermission("notifications.payroll.send", record.facility_id)) return null;
  return <section className="mt-3 space-y-3 rounded-lg border border-border-subtle bg-surface-card p-3">
    <h4 className="text-sm font-semibold">{text.historyResend}</h4>
    {error && <p role="alert" className="rounded-lg bg-error-bg p-3 text-sm text-error-text">{error}</p>}
    {!policy.allowed ? <p className="text-sm text-text-muted">{text.historyResendPending}</p> : <>
      <p className="text-xs text-text-muted">{text.historyResendContent}</p>
      {policy.delivered && <p className="rounded-lg bg-warning-bg p-3 text-sm text-warning-text">{record.snapshot.name} — {record.snapshot.email}: {text.historyResendDelivered}</p>}
      {record.delivery_status === "SOFT_BOUNCE" && <p className="text-sm text-warning-text">{text.historyResendSoft}</p>}
      {policy.requireDifferentEmail && <p className="text-sm text-warning-text">{text.historyResendDifferent}</p>}
      <label className="block space-y-1 text-xs font-medium text-text-secondary">{text.historyResendEmail}
        <input type="email" value={email} disabled={sending || Boolean(submitted)} className="h-8 w-full rounded-lg border border-border-subtle bg-surface-input px-3 text-sm disabled:opacity-50"
          onChange={e => { setEmail(e.target.value); setConfirmed(false); setJob(null); request.current = crypto.randomUUID(); }} />
      </label>
      {!valid && <p className="text-xs text-error-text">{text.historyResendInvalid}</p>}
      {different && <p className="break-all text-sm text-warning-text">{text.historyResendChange}: {record.snapshot.email} → {email.trim()}</p>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmed} disabled={sending || Boolean(submitted)} onChange={e => setConfirmed(e.target.checked)} />
        <span className="break-words">{text.historyResendConfirm}: {record.snapshot.name} — {email.trim()}</span>
      </label>
      <button type="button" disabled={sending || state.busy || Boolean(submitted) || !confirmed || !valid || (policy.requireDifferentEmail && !different)} onClick={() => void send()}
        className="inline-flex h-8 items-center gap-2 rounded-lg bg-brand-primary px-3 text-sm font-medium text-white disabled:opacity-50"><Send size={14} />{text.historyResend}</button>
    </>}
    {job && <p role="status" className="text-sm text-text-secondary">{active ? text.historyResendAccepted : job.failed ? text.failed : job.unknown ? text.unknown : text.historyPending}</p>}
  </section>;
}
