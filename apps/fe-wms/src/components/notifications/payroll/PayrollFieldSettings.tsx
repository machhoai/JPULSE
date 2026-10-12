"use client";
import { PAYROLL_FIELDS, PAYROLL_BLOCK_LABELS, type PayrollBlock, type PayrollComposer, type PayrollRecipient } from "@bduck/shared-types";
import type { PayrollText } from "@/lib/i18n/payrollEmailTranslations";
const all: Record<PayrollBlock, string[]> = {
  "employee-info": ["name","email","job_title","bank_account","bank"],
  attendance: ["date","weekday","shift","day_type","check_in","check_out","standard_hours","hours","missing_minutes","extra_minutes","shift_status","in_status","out_status","source"],
  payslip: ["days","shifts7","shifts8","holiday","standard_days","gross","overtime_hours","overtime_pay","tax","insurance","advance","net","notes"],
};
export function payrollHiddenPeople(old: PayrollComposer, next: PayrollComposer, people: PayrollRecipient[]) {
  const blocks = (composer: PayrollComposer) => composer.ops.filter(op => typeof op.insert !== "string").map(op => (op.insert as { payroll: PayrollBlock }).payroll);
  return people.filter(p => (Object.keys(all) as PayrollBlock[]).some(block => {
    if (!blocks(old).includes(block)) return false;
    const removed = !blocks(next).includes(block) ? old.fields[block] : old.fields[block].filter(f => !next.fields[block].includes(f));
    return removed.some(f => {
      const values = block === "attendance" ? p.attendance.map(row => row[f]) :
        [f === "name" ? p.name : f === "email" ? p.email : p.values[f]];
      return values.some(v => v !== null && v !== undefined && v !== "");
    });
  }));
}
export function payrollHiddenLabels(old: PayrollComposer, next: PayrollComposer, people: PayrollRecipient[], lang: "vi" | "zh") {
  const contains = (composer: PayrollComposer, block: PayrollBlock) => composer.ops.some(op => typeof op.insert !== "string" && op.insert.payroll === block);
  const index = lang === "zh" ? 1 : 0;
  return (Object.keys(all) as PayrollBlock[]).flatMap(block => {
    if (!contains(old, block)) return [];
    const removed = contains(next, block) ? old.fields[block].filter(f => !next.fields[block].includes(f)) : old.fields[block];
    return removed.filter(field => people.some(p => {
      const values = block === "attendance" ? p.attendance.map(r => r[field]) : [field === "name" ? p.name : field === "email" ? p.email : p.values[field]];
      return values.some(v => v !== null && v !== undefined && v !== "");
    })).map(field => PAYROLL_BLOCK_LABELS[block][index] + ": " + PAYROLL_FIELDS[field as keyof typeof PAYROLL_FIELDS][index]);
  }).join(", ");
}
export default function PayrollFieldSettings({ composer, change, lang, text, disabled }: {
  composer: PayrollComposer; change: (next: PayrollComposer) => void; lang: "vi" | "zh"; text: PayrollText; disabled: boolean;
}) {
  return <details className="rounded-xl border border-border-subtle bg-surface-elevated p-4 shadow-sm"><summary className="cursor-pointer text-base font-semibold">{text.fields}</summary>
    <div className="grid gap-3 pt-3 lg:grid-cols-3">{(Object.keys(all) as PayrollBlock[]).map(block =>
      <fieldset key={block} disabled={disabled} className="space-y-2 rounded-lg border border-border-soft bg-surface-card p-3"><legend className="px-1 text-xs font-semibold text-text-primary">{PAYROLL_BLOCK_LABELS[block][lang === "zh" ? 1 : 0]}</legend>
        {all[block].map(field => <label key={field} className="flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
          <input className="size-4 shrink-0 cursor-pointer accent-brand-primary disabled:cursor-not-allowed" type="checkbox" checked={composer.fields[block].includes(field)} onChange={e => change({ ...composer, fields: { ...composer.fields,
            [block]: e.target.checked ? all[block].filter(f => f === field || composer.fields[block].includes(f)) : composer.fields[block].filter(f => f !== field) } })} />
          {PAYROLL_FIELDS[field as keyof typeof PAYROLL_FIELDS][lang === "zh" ? 1 : 0]}</label>)}
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
