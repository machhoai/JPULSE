import type { PayrollBlock, PayrollComposer, PayrollImportSource } from './payrollEmail.js';
import { PAYROLL_FIELDS, type PayrollField } from './payrollEmailFields.js';

export const PAYROLL_SOURCE_BLOCK: Record<PayrollImportSource, PayrollBlock> = {
  roster: 'employee-info', salary: 'payslip', attendance: 'attendance',
};
export const PAYROLL_AVAILABLE_FIELDS: Record<PayrollBlock, string[]> = {
  'employee-info': ['name', 'email', 'job_title', 'bank_account', 'bank'],
  attendance: ['date', 'weekday', 'shift', 'day_type', 'check_in', 'check_out', 'standard_hours', 'hours', 'missing_minutes', 'extra_minutes', 'shift_status', 'in_status', 'out_status', 'source'],
  payslip: ['days', 'shifts7', 'shifts8', 'holiday', 'standard_days', 'gross', 'overtime_hours', 'overtime_pay', 'tax', 'insurance', 'advance', 'net', 'notes'],
};
export const PAYROLL_CUSTOM_FIELD_PATTERN = /^custom_(roster|salary|attendance)_[a-f0-9]{32}$/;
export function payrollCustomFieldSource(id: string): PayrollImportSource | null {
  return (id.match(PAYROLL_CUSTOM_FIELD_PATTERN)?.[1] as PayrollImportSource | undefined) ?? null;
}
export function payrollFieldLabel(composer: PayrollComposer, field: string, lang: 'vi' | 'zh' = 'vi'): string {
  return Object.hasOwn(PAYROLL_FIELDS, field) ? PAYROLL_FIELDS[field as PayrollField][lang === 'zh' ? 1 : 0]
    : composer.custom_fields?.find(item => item.id === field)?.label ?? field;
}
export function payrollBlockFields(composer: PayrollComposer, block: PayrollBlock): string[] {
  return [...PAYROLL_AVAILABLE_FIELDS[block], ...(composer.custom_fields ?? [])
    .filter(field => PAYROLL_SOURCE_BLOCK[field.source] === block).map(field => field.id)];
}
export function payrollOrderedFields(composer: PayrollComposer, block: PayrollBlock): string[] {
  const available = payrollBlockFields(composer, block);
  // Old templates already store visible fields in display order.
  return [...new Set([...(composer.field_order?.[block] ?? composer.fields[block]), ...available])]
    .filter(field => available.includes(field));
}
export function isPayrollCustomLabelValid(composer: PayrollComposer, source: PayrollImportSource, label: string, excludeId?: string): boolean {
  const normalize = (value: string) => value.normalize('NFC').trim().toLocaleLowerCase('vi');
  if (!label.trim() || label.trim().length > 160 || [...label].some(character => character.charCodeAt(0) < 32)) return false;
  return !payrollBlockFields(composer, PAYROLL_SOURCE_BLOCK[source]).filter(id => id !== excludeId)
    .some(id => (['vi', 'zh'] as const).some(lang => normalize(payrollFieldLabel(composer, id, lang)) === normalize(label)));
}
