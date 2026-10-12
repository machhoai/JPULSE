import { PAYROLL_FIELDS, PAYROLL_BLOCK_LABELS } from './payrollEmailFields.js';
import type { PayrollField } from './payrollEmailFields.js';
import type { PayrollBlock, PayrollComposer, PayrollDeltaOp, PayrollRecipient } from './payrollEmail.js';
import { isPayrollBankAccountValid } from './payrollBankAccount.js';

export const escapePayrollHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function payrollVariables(text: string, name: string, clock: string) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Ho_Chi_Minh', month: 'numeric', year: 'numeric' })
    .formatToParts(new Date(clock));
  const month = Number(parts.find(p => p.type === 'month')?.value);
  const year = Number(parts.find(p => p.type === 'year')?.value);
  return text.replace(/@([A-Za-z][A-Za-z0-9_-]*|\([^@\s]+\))@/g, (_, token: string) => {
    const values: Record<string, string> = { name, tMonth: String(month).padStart(2, '0'),
      '(tMonth-1)': String(month === 1 ? 12 : month - 1).padStart(2, '0'),
      tYear: String(year), '(tYear-1)': String(year - 1) };
    if (!Object.hasOwn(values, token)) throw new Error(`Biến không được hỗ trợ: @${token}@ / 不支持的变量`);
    return values[token];
  });
}
const td = 'padding:9px;border:1px solid #e2e8f0;text-align:left;overflow-wrap:anywhere';
const moneyFields = new Set(['gross', 'tax', 'net', 'overtime_pay', 'insurance', 'advance']);
const payrollNumberFormats = {
  vi: new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }),
  zh: new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }),
};
export function formatPayrollNumber(value: unknown, lang: 'vi' | 'zh' = 'vi') {
  return typeof value === 'number' ? payrollNumberFormats[lang].format(value) : String(value ?? '');
}
function display(field: string, value: unknown) {
  if (field === 'bank_account' && !isPayrollBankAccountValid(value)) return 'Cần bổ sung gấp';
  if (value == null || value === '') return '—';
  if (typeof value !== 'number' || field === 'bank_account') return String(value);
  return formatPayrollNumber(value) + (moneyFields.has(field) ? ' đ' : '');
}
function table(block: PayrollBlock, composer: PayrollComposer, person: PayrollRecipient) {
  const fields = composer.fields[block].filter(f => Object.hasOwn(PAYROLL_FIELDS, f));
  if (!fields.length) return '';
  const label = (f: string) => PAYROLL_FIELDS[f as PayrollField][0];
  let rows: string;
  if (block === 'attendance') {
    rows = '<thead><tr>' + fields.map(f => `<th style="${td};background:#eff6ff">${label(f)}</th>`).join('') + '</tr></thead><tbody>' +
      person.attendance.map(row => '<tr>' + fields.map(f => `<td style="${td}"><span class="payroll-mobile-label" style="display:none;font-weight:bold">${label(f)}: </span>${escapePayrollHtml(display(f, row[f]))}</td>`).join('') + '</tr>').join('') + '</tbody>';
  } else {
    rows = fields.map(f => {
      const value = f === 'name' ? person.name : f === 'email' ? person.email : person.values[f];
      const urgent = f === 'bank_account' && !isPayrollBankAccountValid(value);
      return `<tr${f === 'net' ? ' style="background:#eff6ff;font-weight:bold"' : ''}><th style="${td}">${label(f)}</th><td style="${td}${urgent ? ';color:#b42318;font-weight:bold;background:#fef2f2' : ''}">${escapePayrollHtml(display(f, value))}</td></tr>`;
    }).join('');
  }
  return `<section style="margin:20px 0"><h2 style="font-size:18px;color:#1e3a8a">${PAYROLL_BLOCK_LABELS[block][0]}</h2><div style="overflow-x:auto"><table class="payroll-table ${block === 'attendance' ? 'payroll-attendance' : ''}" style="border-collapse:collapse;width:100%;font-size:14px">${rows}</table></div></section>`;
}
function textRuns(ops: PayrollDeltaOp[], person: PayrollRecipient, clock: string) {
  const joined = ops.map(op => typeof op.insert === 'string' ? op.insert : '').join('');
  // Resolve tokens before styling, including tokens split across Quill formatting runs.
  const substitutions = [...joined.matchAll(/@(?:[A-Za-z][A-Za-z0-9_-]*|\([^@\s]+\))@/g)].map(m => ({ start: m.index!, end: m.index! + m[0].length,
    value: payrollVariables(m[0], person.name, clock) }));
  let offset = 0;
  return ops.map(op => {
    const raw = typeof op.insert === 'string' ? op.insert : '';
    let text = '';
    for (let i = 0; i < raw.length; i++) {
      const position = offset + i;
      const sub = substitutions.find(s => position >= s.start && position < s.end);
      if (!sub) text += raw[i]; else if (position === sub.start) text += sub.value;
    }
    offset += raw.length;
    let html = escapePayrollHtml(text).replace(/\n/g, '<br>');
    const a = op.attributes ?? {};
    if (a.bold) html = `<strong>${html}</strong>`;
    if (a.italic) html = `<em>${html}</em>`;
    if (a.underline) html = `<u>${html}</u>`;
    if (typeof a.link === 'string' && /^https?:\/\//i.test(a.link)) html = `<a href="${escapePayrollHtml(a.link)}">${html}</a>`;
    return html;
  }).join('');
}
export function renderPayrollEmail(composer: PayrollComposer, person: PayrollRecipient, clock: string, signatureHtml = '', signatureText = '') {
  const subject = payrollVariables(composer.subject, person.name, clock).replace(/[\r\n]/g, ' ');
  let body = ''; let group: PayrollDeltaOp[] = [];
  const flush = () => { body += textRuns(group, person, clock); group = []; };
  for (const op of composer.ops) {
    if (typeof op.insert === 'string') group.push(op);
    else { flush(); body += table(op.insert.payroll, composer, person); }
  }
  flush();
  const html = `<!doctype html><html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>@media(max-width:600px){.payroll-content{padding:12px!important}.payroll-table{font-size:12px!important}.payroll-table td,.payroll-table th{padding:6px!important}.payroll-attendance thead{display:none}.payroll-attendance tbody,.payroll-attendance tr,.payroll-attendance td{display:block}.payroll-attendance tr{margin-bottom:12px}.payroll-attendance .payroll-mobile-label{display:inline!important}}</style></head><body style="margin:0;background:#f1f5f9;color:#0f172a;font-family:Arial,sans-serif"><main class="payroll-content" style="padding:24px;background:white;line-height:1.6">${body}<footer style="margin-top:24px">${signatureHtml}</footer></main></body></html>`;
  const text = body.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(td|th|tr|h2|section)>/gi, '\n')
    .replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'") + '\n' + signatureText;
  return { subject, html, text };
}
