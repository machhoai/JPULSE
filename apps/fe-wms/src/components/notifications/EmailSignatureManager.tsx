"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PenLine, X } from "lucide-react";
import { useEmailSignatures } from "@/hooks/useEmailSignatures";
import { useUserStore } from "@/stores/useUserStore";
import { useTranslation } from "@/lib/i18n";
import { payrollEmailTranslations } from "@/lib/i18n/payrollEmailTranslations";

interface SignatureModalProps { close: () => void }
const inputClass = "h-8 w-full rounded-lg border border-border-subtle bg-surface-input px-3 text-sm text-text-primary outline-none focus:border-border-focus focus:ring-2 focus:ring-brand-primary-muted disabled:bg-surface-base";
const buttonClass = "inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 text-sm font-medium text-text-secondary hover:bg-surface-base disabled:opacity-50";

function SignatureModal({ close }: SignatureModalProps) {
  const state = useEmailSignatures();
  const { text, signatures, busy, loading } = state;
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [html, setHtml] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const reset = () => { setId(""); setName(""); setHtml(""); };
  return createPortal(<dialog ref={dialog} aria-labelledby="email-signatures-title" onCancel={e => { if (busy) e.preventDefault(); else close(); }}
    className="m-auto max-h-[90dvh] w-[90%] max-w-[640px] overflow-y-auto rounded-2xl border border-border-subtle bg-surface-elevated p-4 text-text-primary shadow-xl backdrop:bg-black/30 backdrop:backdrop-blur-sm">
    <header className="mb-3 flex items-center justify-between gap-3 border-b border-border-soft pb-3">
      <h2 id="email-signatures-title" className="flex items-center gap-2 text-base font-semibold"><PenLine size={18} className="text-brand-primary" aria-hidden="true" />{text.signatures}</h2>
      <button type="button" aria-label={text.close} className={buttonClass} disabled={busy} onClick={close}><X size={16} aria-hidden="true" /></button>
    </header>
    {state.error && <p role="alert" className="mb-3 whitespace-pre-wrap rounded-lg bg-error-bg p-3 text-sm text-error-text">{state.error}</p>}
    {loading ? <div className="space-y-3" aria-busy="true"><div className="skeleton-pulse h-8 rounded-lg bg-surface-base" /><div className="skeleton-pulse h-8 rounded-lg bg-surface-base" /><div className="skeleton-pulse h-40 rounded-lg bg-surface-base" /></div> : <fieldset disabled={busy} className="space-y-3">
      <label className="block space-y-1 text-xs font-medium text-text-secondary">{text.signature}<select className={inputClass} value={id} onChange={e => {
        const signature = signatures.find(s => s.id === e.target.value);
        setId(e.target.value); setName(signature?.name || ""); setHtml(signature?.html || "");
      }}><option value="">{text.newSignature}</option>{signatures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <p className="text-xs text-text-muted">{text.defaultSignatureHint}</p>
      <label className="block space-y-1 text-xs font-medium text-text-secondary">{text.name}<input className={inputClass} value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="block space-y-1 text-xs font-medium text-text-secondary">{text.html}<textarea className="h-52 w-full rounded-lg border border-border-subtle bg-surface-card p-3 font-mono text-sm text-text-primary outline-none focus:border-border-focus focus:ring-2 focus:ring-brand-primary-muted" value={html} onChange={e => setHtml(e.target.value)} /></label>
      <footer className="flex flex-wrap justify-end gap-2 border-t border-border-soft pt-3">
        {id && <button type="button" className={buttonClass} onClick={() => void state.remove(id).then(ok => { if (ok) reset(); })}>{text.remove}</button>}
        <button type="button" className={buttonClass} onClick={close}>{text.close}</button>
        <button type="button" disabled={!name.trim()} className="inline-flex h-8 items-center gap-2 rounded-lg bg-brand-primary px-3 text-sm font-medium text-white hover:bg-brand-primary-hover disabled:opacity-50" onClick={() => void state.save(id, name, html).then(ok => { if (ok) reset(); })}>{text.save}</button>
      </footer>
    </fieldset>}
  </dialog>, document.body);
}

export default function EmailSignatureManager() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open && wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);
  const canManage = useUserStore(s => s.hasPermission("notifications.email_signatures.manage"));
  const { lang } = useTranslation();
  const text = payrollEmailTranslations[lang];
  if (!canManage) return null;
  return <>
    <button ref={trigger} type="button" className={`${buttonClass} shrink-0`} aria-haspopup="dialog" onClick={() => setOpen(true)}><PenLine size={14} className="text-brand-primary" aria-hidden="true" />{text.signatures}</button>
    {open && <SignatureModal close={() => setOpen(false)} />}
  </>;
}
