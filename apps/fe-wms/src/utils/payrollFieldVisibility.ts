import { PAYROLL_AVAILABLE_FIELDS, payrollFieldLabel, PAYROLL_BLOCK_LABELS, type PayrollBlock, type PayrollComposer, type PayrollRecipient } from "@bduck/shared-types";
const all = PAYROLL_AVAILABLE_FIELDS;
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
    })).map(field => PAYROLL_BLOCK_LABELS[block][index] + ": " + payrollFieldLabel(old, field, lang));
  }).join(", ");
}
