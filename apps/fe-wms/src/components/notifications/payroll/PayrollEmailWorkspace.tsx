"use client";
import { useMemo, useState } from "react";
import { FileText, Mail, Eye, Users, FileSpreadsheet, Send } from "lucide-react";
import PayrollSectionHeading from "./PayrollSectionHeading";
import dynamic from "next/dynamic";
import { renderPayrollEmail, type PayrollComposer } from "@bduck/shared-types";
import { usePayrollComposer } from "@/hooks/usePayrollComposer";
import { usePayrollDelivery } from "@/hooks/usePayrollDelivery";
import { useWarehouses } from "@/hooks/useWarehouses";
import PayrollConfirmDialog, { type PayrollConfirmation } from "./PayrollConfirmDialog";
import PayrollFieldSettings, { payrollHiddenPeople, payrollHiddenLabels } from "./PayrollFieldSettings";
import PayrollImportPanel, { type PayrollParsedSources } from "./PayrollImportPanel";
import PayrollRecipientTable from "./PayrollRecipientTable";
import PayrollHistoryPanel from "./PayrollHistoryPanel";
import { payrollApi } from "@/api/payrollEmailApi";
import { payrollEligibleIds } from "@/utils/payrollRecipients";
const Editor = dynamic(() => import("./PayrollQuillEditor"), { ssr: false,
  loading: () => <div className="skeleton-pulse h-40 rounded-lg bg-surface-base" /> });
export default function PayrollEmailWorkspace() {
  const state = usePayrollComposer(); const { warehouses } = useWarehouses();
  const [confirmation, setConfirmation] = useState<PayrollConfirmation | null>(null);
  const delivery = usePayrollDelivery(state, setConfirmation);
  const [sources, setSources] = useState<PayrollParsedSources | null>(null);
  const [step, setStep] = useState(0);
  const [personId, setPersonId] = useState(""); const [testEmail, setTestEmail] = useState("");
  const { text, lang, composer, people, busy, facility, hasPermission } = state;
  const canCompose = !!facility && hasPermission("notifications.payroll.compose", facility);
  const canManage = hasPermission("notifications.payroll.templates.manage", facility || undefined);
  const currentPerson = people.find(p => p.id === personId) || people[0];
  const signature = state.catalog.signatures.find(s => s.id === composer.signature_id) || state.catalog.default_signature;
  const preview = useMemo(() => {
    if (!currentPerson) return { html: "", subject: "", error: "" };
    try { return { ...renderPayrollEmail(composer, currentPerson, state.draft.clock || new Date().toISOString(), signature.html, signature.text), error: "" }; }
    catch (e) { return { html: "", subject: "", error: e instanceof Error ? e.message : String(e) }; }
  }, [composer, currentPerson, signature, state.draft.clock]);
  const requestComposer = (next: PayrollComposer, accept = () => state.setComposer(next)) => {
    const affected = payrollHiddenPeople(composer, next, people);
    if (affected.length) setConfirmation({ message: text.hideWarning + "\n" + payrollHiddenLabels(composer, next, people, lang) + "\n" + affected.map(p => p.name + " - " + p.email).join("\n"), accept });
    else accept();
  };
  const selectTemplate = (id: string) => {
    const apply = () => { state.applyTemplate(id); setSources(null); setPersonId(""); setStep(0); };
    if (people.length) setConfirmation({ message: text.hideWarning + "\n" + people.map(p => p.name + " - " + p.email).join("\n"), accept: apply });
    else apply();
  };
  const eligible = useMemo(() => payrollEligibleIds(people), [people]);
  const valid = people.filter(p => p.selected && eligible.has(p.id));
  const invalidSelected = people.some(p => p.selected && !eligible.has(p.id));
  return <div className="space-y-4 text-text-primary">
    <PayrollConfirmDialog value={confirmation} text={text} close={() => setConfirmation(null)} />
    {state.loading && <div className="skeleton-pulse h-24 rounded-lg bg-surface-base" />}
    {state.error && <p role="alert" className="whitespace-pre-wrap rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
    {state.offline && <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">{text.offline}</p>}
    <nav aria-label={text.title} className="sticky top-0 z-10 grid grid-cols-4 gap-1 rounded-xl border border-border-subtle bg-surface-elevated p-1 shadow-sm md:static md:gap-3 md:bg-surface-card md:p-2">
      {[text.import, text.recipients, text.content, text.preview].map((label, index) => <button key={index}
        className={`flex h-8 items-center justify-center gap-2 rounded-lg px-1 text-xs font-medium transition md:justify-start md:px-3 ${step === index ? "bg-brand-primary text-white shadow-sm" : "text-text-muted hover:bg-surface-base"}`}
        aria-current={step === index ? "step" : undefined} onClick={() => { setStep(index); if (window.matchMedia("(min-width: 768px)").matches) document.getElementById(`payroll-step-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><span className="hidden size-5 items-center justify-center rounded-full bg-white/20 text-xxs md:flex">{index + 1}</span>{label}</button>)}
    </nav>
    <section className="space-y-3 rounded-xl border border-border-subtle bg-surface-elevated p-4 shadow-sm">
      <PayrollSectionHeading icon={FileText} title={text.template} description={text.title} />
      <div className="flex flex-wrap items-center gap-2"><label className="w-full text-xs md:w-auto md:flex-1">{text.template}
        <select className="h-8 w-full rounded-lg border border-border-subtle bg-surface-input px-3 text-sm text-text-primary outline-none transition focus:border-border-focus focus:ring-2 focus:ring-brand-primary-muted disabled:bg-surface-base disabled:text-text-muted" value={state.catalog.templates.some(t => t.id === state.templateId) ? state.templateId : ""}
          disabled={busy} onChange={e => selectTemplate(e.target.value)}><option value="">{text.choose}</option>
          {state.catalog.templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        {hasPermission("notifications.payroll.templates.manage") && <button className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-base disabled:cursor-not-allowed disabled:opacity-50" disabled={busy}
          onClick={() => { if (people.length) setConfirmation({ message: text.hideWarning, accept: state.newTemplate }); else state.newTemplate(); }}>{text.newTemplate}</button>}
        <button className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-base disabled:cursor-not-allowed disabled:opacity-50" disabled={busy} onClick={() => void state.restoreLocal()}>{text.restore}</button>
      </div>
      {state.templateId && <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs">{text.name}<input className="h-8 w-full rounded-lg border border-border-subtle bg-surface-input px-3 text-sm text-text-primary outline-none transition focus:border-border-focus focus:ring-2 focus:ring-brand-primary-muted disabled:bg-surface-base disabled:text-text-muted" value={state.templateName} disabled={busy || !canManage}
          onChange={e => state.setTemplateName(e.target.value)} /></label>
        <label className="text-xs">{text.facility}<select className="h-8 w-full rounded-lg border border-border-subtle bg-surface-input px-3 text-sm text-text-primary outline-none transition focus:border-border-focus focus:ring-2 focus:ring-brand-primary-muted disabled:bg-surface-base disabled:text-text-muted" value={facility} disabled={busy || !canManage || !!state.draft.id || people.length > 0}
            onChange={e => state.setFacility(e.target.value)}><option value="">{text.choose}</option>{warehouses.filter(w => w.type === "STORE").map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        <label className="text-xs">{text.signature}<select className="h-8 w-full rounded-lg border border-border-subtle bg-surface-input px-3 text-sm text-text-primary outline-none transition focus:border-border-focus focus:ring-2 focus:ring-brand-primary-muted disabled:bg-surface-base disabled:text-text-muted" disabled={busy || (!canCompose && !canManage)}
          value={composer.signature_id || ""} onChange={e => state.setComposer({ ...composer, signature_id: e.target.value || null })}>
          <option value="">{text.defaultSignature}</option>{state.catalog.signatures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      </div>}
      {state.templateId && canManage && <div className="flex gap-2"><button disabled={busy} className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-base disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void state.saveTemplate()}>{text.saveTemplate}</button>
        {state.catalog.templates.some(t => t.id === state.templateId) && <button disabled={busy} className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-base disabled:cursor-not-allowed disabled:opacity-50" onClick={() => setConfirmation({
          message: text.remove + ": " + state.templateName, accept: () => void state.run(async () => {
            await payrollApi("/templates/" + state.templateId, "DELETE", undefined, lang); await state.refreshCatalog(); state.newTemplate();
          }) })}>{text.remove}</button>}</div>}
    </section>
    {!state.templateId && <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-subtle bg-surface-card px-4 py-10 text-center"><FileSpreadsheet size={28} className="text-brand-primary" aria-hidden="true" /><p className="text-sm text-text-muted">{text.chooseTemplate}</p></div>}
    {state.templateId && !state.catalog.templates.some(t => t.id === state.templateId) && <p className="text-sm text-text-muted">{text.pendingSave}</p>}
    {state.templateId && !canCompose && !canManage && <p className="rounded-xl border border-border-subtle bg-surface-elevated p-4 shadow-sm text-sm">{text.noPermission}</p>}
    {state.templateId && (canCompose || canManage) && <>
      {canCompose && <div id="payroll-step-0" className={step === 0 ? "block" : "hidden md:block"}><PayrollImportPanel key={state.templateId} text={text} lang={lang} composer={composer}
        setMappings={mappings => state.setComposer({ ...composer, mappings })} busy={busy} run={state.run}
        onRead={(next, parsed) => {
          const apply = () => { state.setPeople(next); setSources(parsed); setPersonId(""); setStep(1); };
          // Applying a saved template can hide fields in newly imported data: re-confirm now.
          const allFields = { ...composer, fields: { "employee-info": ["name","email","job_title","bank_account","bank"],
            attendance: ["date","weekday","shift","day_type","check_in","check_out","standard_hours","hours","missing_minutes","extra_minutes","shift_status","in_status","out_status","source"],
            payslip: ["days","shifts7","shifts8","holiday","standard_days","gross","tax","net","overtime_hours","overtime_pay","insurance","advance","notes"] },
            ops: [{ insert: { payroll: "employee-info" } }, { insert: { payroll: "attendance" } }, { insert: { payroll: "payslip" } }] } as PayrollComposer;
          const affected = payrollHiddenPeople(allFields, composer, next);
          if (affected.length) setConfirmation({ message: text.hideWarning + "\n" + payrollHiddenLabels(allFields, composer, next, lang) + "\n" + affected.map(p => p.name).join(", "), accept: apply }); else apply();
        }} /></div>}
      {people.length > 0 && <div id="payroll-step-1" className={step === 1 ? "block" : "hidden md:block"}><PayrollRecipientTable people={people} change={state.setPeople} sources={sources} lang={lang} text={text} disabled={busy || !canCompose} /></div>}
      <div className="grid gap-3 xl:grid-cols-2">
        <section id="payroll-step-2" className={`min-w-0 space-y-3 rounded-xl border border-border-subtle bg-surface-elevated p-4 shadow-sm ${step === 2 ? "block" : "hidden md:block"}`}><PayrollSectionHeading icon={Mail} title={text.content} /><label className="block space-y-1 text-xs font-medium text-text-secondary">{text.subject}
          <input className="h-8 w-full rounded-lg border border-border-subtle bg-surface-input px-3 text-sm text-text-primary outline-none transition focus:border-border-focus focus:ring-2 focus:ring-brand-primary-muted disabled:bg-surface-base disabled:text-text-muted" disabled={busy || (!canCompose && !canManage)} value={composer.subject}
            onChange={e => state.setComposer({ ...composer, subject: e.target.value })} /></label>
          <Editor ops={composer.ops} onChange={ops => state.setComposer({ ...composer, ops })}
            requestChange={(ops, accept) => requestComposer({ ...composer, ops }, accept)}
            text={text} lang={lang} disabled={busy || (!canCompose && !canManage)} />
          <PayrollFieldSettings composer={composer} change={requestComposer} lang={lang} text={text} disabled={busy || (!canCompose && !canManage)} />
          {canCompose && <div className="flex flex-wrap gap-2"><button className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-base disabled:cursor-not-allowed disabled:opacity-50" disabled={busy} onClick={() => void state.run(state.persist)}>{text.saveDraft}</button>
            <select aria-label={text.openDraft} className="h-8 rounded-lg border border-border-subtle bg-surface-input px-3 text-sm outline-none focus:border-border-focus focus:ring-2 focus:ring-brand-primary-muted" disabled={busy} value="" onChange={e => void state.openDraft(e.target.value)}>
              <option value="">{text.openDraft}</option>{state.drafts.map(d => <option value={d.id} key={d.id}>{d.name}</option>)}</select></div>}
        </section>
        <section id="payroll-step-3" className={`min-w-0 space-y-3 rounded-xl border border-border-subtle bg-surface-elevated p-4 shadow-sm ${step === 3 ? "block" : "hidden md:block"}`}><div className="flex flex-wrap items-center justify-between gap-2"><PayrollSectionHeading icon={Eye} title={text.preview} /><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${invalidSelected ? "bg-warning-bg text-warning-text" : "bg-brand-primary-muted text-brand-primary"}`}><Users size={13} aria-hidden="true" />{text.count}: {valid.length}</span></div>
          <select className="h-8 w-full rounded-lg border border-border-subtle bg-surface-input px-3 text-sm text-text-primary outline-none transition focus:border-border-focus focus:ring-2 focus:ring-brand-primary-muted disabled:bg-surface-base disabled:text-text-muted" value={currentPerson?.id || ""} onChange={e => setPersonId(e.target.value)} aria-label={text.preview}>
            {people.map(p => <option key={p.id} value={p.id}>{p.name} — {p.email}</option>)}</select>
          <p className="break-words rounded-lg bg-surface-card px-3 py-2 text-sm font-medium">{preview.subject || text.subject}</p>{preview.error && <p role="alert" className="text-sm text-error-text">{preview.error}</p>}
          {currentPerson ? <iframe title={text.preview} sandbox="" referrerPolicy="no-referrer" className="h-96 w-full rounded-lg border border-border-subtle bg-white" srcDoc={preview.html} /> : <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-subtle bg-surface-card text-text-muted"><Eye size={24} aria-hidden="true" /><p className="text-sm">{text.previewEmpty}</p></div>}
          <label className="block space-y-1 text-xs font-medium text-text-secondary">{text.testEmail}<input className="h-8 w-full rounded-lg border border-border-subtle bg-surface-input px-3 text-sm text-text-primary outline-none transition focus:border-border-focus focus:ring-2 focus:ring-brand-primary-muted disabled:bg-surface-base disabled:text-text-muted" type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)} /></label>
          <div className="flex flex-wrap gap-2 border-t border-border-soft pt-3">
            <button className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-base disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || state.offline || !currentPerson || !testEmail || !!preview.error || !hasPermission("notifications.payroll.send", facility)}
              onClick={() => delivery.test(currentPerson.id, testEmail)}>{text.test}</button>
            <button className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-base disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || state.offline || !valid.length || invalidSelected || !!preview.error || !hasPermission("notifications.payroll.download", facility)}
              onClick={delivery.exportZip}>{text.export}</button>
            <button className="inline-flex h-8 items-center justify-center gap-2 rounded-lg bg-brand-primary px-3 text-sm font-medium text-white transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || state.offline || !!delivery.job && ["PREPARING", "QUEUED", "PROCESSING"].includes(delivery.job.status) || !valid.length || invalidSelected || !!preview.error || !hasPermission("notifications.payroll.send", facility)}
              onClick={() => delivery.send()}><Send size={14} aria-hidden="true" />{text.send} ({valid.length})</button>
          </div>
        </section>
      </div>
    </>}
    {state.templateId && <div className="flex justify-between gap-2 md:hidden"><button className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-base disabled:cursor-not-allowed disabled:opacity-50" disabled={step === 0} onClick={() => setStep(s => s - 1)}>{text.back}</button>
      <button className="inline-flex h-8 items-center justify-center gap-2 rounded-lg bg-brand-primary px-3 text-sm font-medium text-white transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50" disabled={step === 3} onClick={() => setStep(s => s + 1)}>{text.next}</button></div>}
    <PayrollHistoryPanel state={state} delivery={delivery} />
  </div>;
}
