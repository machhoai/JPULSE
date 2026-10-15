"use client";
import { PAYROLL_AVAILABLE_FIELDS, PAYROLL_BLOCK_LABELS, type PayrollBlock, type PayrollComposer } from "@bduck/shared-types";

import type { PayrollText } from "@/lib/i18n/payrollEmailTranslations";

import PayrollSortableFields from "./PayrollSortableFields";
const all = PAYROLL_AVAILABLE_FIELDS;
export { payrollHiddenPeople, payrollHiddenLabels } from "@/utils/payrollFieldVisibility";
export default function PayrollFieldSettings({ composer, change, lang, text, disabled }: {
  composer: PayrollComposer; change: (next: PayrollComposer) => void; lang: "vi" | "zh"; text: PayrollText; disabled: boolean;
}) {
  return <details className="rounded-xl border border-border-subtle bg-surface-elevated p-4 shadow-sm"><summary className="cursor-pointer text-base font-semibold">{text.fields}</summary>
    <p className="pt-2 text-xs text-text-muted">{text.reorderHint}</p>
    <div className="grid gap-3 pt-3 lg:grid-cols-3">{(Object.keys(all) as PayrollBlock[]).map(block =>
      <fieldset key={block} disabled={disabled} className="space-y-2 rounded-lg border border-border-soft bg-surface-card p-3"><legend className="px-1 text-xs font-semibold text-text-primary">{PAYROLL_BLOCK_LABELS[block][lang === "zh" ? 1 : 0]}</legend>
        <PayrollSortableFields composer={composer} block={block} change={change} lang={lang} text={text} disabled={disabled} />
        <div className="flex flex-wrap gap-1">{composer.ops.filter(op => typeof op.insert !== "string" && op.insert.payroll === block).map((op, occurrence) => {
          const index = composer.ops.indexOf(op);
          const move = (direction: number) => { const next = [...composer.ops]; const target = index + direction;
            if (target >= 0 && target < next.length) { [next[index], next[target]] = [next[target], next[index]]; change({ ...composer, ops: next }); } };
          return <div key={occurrence} className="flex gap-1">
            <button className="inline-flex h-6 items-center rounded-md border border-border-subtle bg-surface-elevated px-2 text-xs text-text-secondary hover:bg-surface-base disabled:opacity-50" onClick={() => move(-1)}>{text.moveUp}</button>
            <button className="inline-flex h-6 items-center rounded-md border border-border-subtle bg-surface-elevated px-2 text-xs text-text-secondary hover:bg-surface-base disabled:opacity-50" onClick={() => move(1)}>{text.moveDown}</button>
            <button className="inline-flex h-6 items-center rounded-md border border-border-subtle bg-surface-elevated px-2 text-xs text-text-secondary hover:bg-surface-base disabled:opacity-50" onClick={() => change({ ...composer, ops: composer.ops.filter((_, i) => i !== index) })}>{text.remove}</button>
          </div>;
        })}</div>
      </fieldset>)}</div></details>;
}
