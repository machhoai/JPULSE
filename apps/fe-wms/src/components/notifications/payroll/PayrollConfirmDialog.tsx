"use client";
import { useEffect, useRef } from "react";
import type { PayrollText } from "@/lib/i18n/payrollEmailTranslations";
export interface PayrollConfirmation { message: string; accept: () => void }
export default function PayrollConfirmDialog({ value, text, close }: { value: PayrollConfirmation | null; text: PayrollText; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (value) ref.current?.showModal(); else ref.current?.close(); }, [value]);
  return <dialog ref={ref} onCancel={close} aria-label={text.warning} className="m-auto max-h-[90dvh] w-[90%] max-w-[560px] overflow-y-auto rounded-2xl border border-border-subtle bg-surface-elevated p-4 text-sm text-text-primary shadow-xl backdrop:bg-black/30 backdrop:backdrop-blur-sm">
    <h3 className="text-base font-semibold">{text.warning}</h3>
    <p className="my-3 rounded-lg bg-warning-bg p-3 leading-relaxed whitespace-pre-wrap text-warning-text">{value?.message}</p>
    <div className="flex justify-end gap-2"><button className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-base disabled:cursor-not-allowed disabled:opacity-50" onClick={close}>{text.cancel}</button>
      <button className="h-8 rounded bg-brand-primary px-3 text-white" onClick={() => { const accept = value?.accept; close(); accept?.(); }}>{text.confirm}</button></div>
  </dialog>;
}
