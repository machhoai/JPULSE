"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { payrollApi, PayrollApiError, downloadPayrollZip } from "@/api/payrollEmailApi";
import type { PayrollJobMetadata, PayrollSnapshot, PayrollItemStatus } from "@bduck/shared-types";
import type { PayrollComposerState } from "./usePayrollComposer";
import { payrollEligibleIds } from "@/utils/payrollRecipients";
import type { PayrollConfirmation } from "@/components/notifications/payroll/PayrollConfirmDialog";
export interface PayrollProgressPerson { id: string; name: string; email: string; status: PayrollItemStatus; error: { vi: string; zh: string } | null }
export interface PayrollHistoryRecord { id: string; created_at: string; snapshot: PayrollSnapshot }
export function usePayrollDelivery(state: PayrollComposerState, confirm: (c: PayrollConfirmation) => void) {
  const { facility, hasPermission, lang, people, persist, run, text } = state;
  const [jobId, setJobId] = useState(""); const [job, setJob] = useState<PayrollJobMetadata | null>(null);
  const [progress, setProgress] = useState<PayrollProgressPerson[]>([]);
  const [history, setHistory] = useState<PayrollHistoryRecord[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState("");
  const session = useRef(""); const request = useRef("");
  useEffect(() => { session.current = crypto.randomUUID(); }, []);
  useEffect(() => { setJobId(""); setJob(null); setProgress([]); setHistory([]); request.current = ""; session.current = crypto.randomUUID(); }, [state.userId, facility]);
  useEffect(() => {
    if (!jobId) return;
    let disposed = false; let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = onSnapshot(doc(db, "payroll_email_jobs", jobId), snapshot => {
      if (snapshot.exists()) setJob(snapshot.data() as PayrollJobMetadata);
      clearTimeout(timer); timer = setTimeout(() => {
        void payrollApi<{ job: PayrollJobMetadata; people: PayrollProgressPerson[] }>("/jobs/" + jobId, "GET", undefined, lang)
          .then(data => { if (!disposed) { setJob(data.job); setProgress(data.people); } })
          .catch(e => { if (!disposed) state.setError(e.message); });
      }, 500);
    }, e => state.setError(text.progress + ": " + e.code));
    return () => { disposed = true; clearTimeout(timer); unsubscribe(); };
  }, [jobId, lang, state.userId, facility]);
  const loadHistory = useCallback(async (after?: string) => {
    if (!facility || !hasPermission("notifications.payroll.history.read", facility)) return;
    const page = await payrollApi<{ records: PayrollHistoryRecord[]; cursor: string | null }>("/history?facility_id=" + facility + (after ? "&after=" + after : ""), "GET", undefined, lang);
    setHistory(old => after ? [...old, ...page.records] : page.records); setCursor(page.cursor); setHistoryError("");
  }, [facility, hasPermission, lang]);
  useEffect(() => {
    setHistory([]); setCursor(null);
    if (!facility || !hasPermission("notifications.payroll.history.read", facility)) return;
    let disposed = false; let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = onSnapshot(query(collection(db, "payroll_email_sent_records"), where("facility_id", "==", facility),
      where("is_deleted", "==", false), orderBy("created_at", "desc"), limit(25)), () => {
        clearTimeout(timer); timer = setTimeout(() => { void loadHistory().catch(e => { if (!disposed) setHistoryError(e.message); }); }, 300);
      }, e => { if (!disposed) setHistoryError(text.history + ": " + e.code); });
    return () => { disposed = true; clearTimeout(timer); unsubscribe(); };
  }, [facility, hasPermission, lang, loadHistory]);
  const selectedIds = () => { const eligible = payrollEligibleIds(people); return people.filter(p => p.selected && eligible.has(p.id)).map(p => p.id); };
  const send = (confirmation?: string) => void run(async () => {
    if (!navigator.onLine) throw new Error(text.offline);
    const ids = selectedIds(); if (!ids.length) throw new Error(text.invalidEmail);
    const draftId = await persist(); request.current ||= crypto.randomUUID();
    const signature = state.catalog.signatures.find(s => s.id === state.composer.signature_id) || state.catalog.default_signature;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ html: signature.html, text: signature.text })));
    const fingerprint = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
    const draftRevision = state.savedRevision.current;
    try {
      const created = await payrollApi<PayrollJobMetadata>("/jobs", "POST", {
        draft_id: draftId, draft_revision: draftRevision, signature_fingerprint: fingerprint, recipient_ids: ids, session_id: session.current, request_id: request.current, confirmation,
      }, lang);
      setJobId(created.id); setJob(created); request.current = "";
    } catch (e) {
      if (e instanceof PayrollApiError && e.data?.confirmation) {
        const token = e.data.confirmation;
        // Confirm against the exact persisted draft version; do not save/revise again.
        confirm({ message: e.message, accept: () => void run(async () => {
          const created = await payrollApi<PayrollJobMetadata>("/jobs", "POST", { draft_id: draftId, draft_revision: draftRevision, signature_fingerprint: fingerprint, recipient_ids: ids,
            session_id: session.current, request_id: request.current || crypto.randomUUID(), confirmation: token }, lang);
          setJobId(created.id); setJob(created); request.current = "";
        }) });
        return;
      }
      throw e;
    }
  });
  const test = (personId: string, email: string) => void run(async () => {
    if (!navigator.onLine) throw new Error(text.offline);
    const draftId = await persist(); await payrollApi("/drafts/" + draftId + "/test", "POST", { person_id: personId, email }, lang);
  });
  const exportZip = () => void run(async () => {
    if (!navigator.onLine) throw new Error(text.offline);
    const draftId = await persist(); await downloadPayrollZip(draftId, selectedIds(), lang);
  });
  const retry = () => void run(async () => {
    await payrollApi("/jobs/" + jobId + "/retry", "POST", { recipient_ids: progress.filter(p => p.status === "FAILED").map(p => p.id) }, lang);
  });
  return { job, jobId, progress, history, historyError, cursor, loadHistory, send, test, exportZip, retry };
}
