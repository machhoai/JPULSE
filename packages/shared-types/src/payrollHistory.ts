import type { PayrollItemStatus, PayrollSnapshot } from './payrollEmail.js';

export type PayrollDeliveryStatus = 'PENDING' | 'DEFERRED' | 'DELIVERED' | 'SOFT_BOUNCE' | 'HARD_BOUNCE' | 'BLOCKED' | 'INVALID' | 'ERROR';
export type PayrollHistoryStatus = 'PENDING' | 'SUCCESS' | 'ERROR';
export interface PayrollHistoryFilters { from?: string; to?: string; status?: 'ALL' | PayrollHistoryStatus }
export interface PayrollHistoryEntry {
  tracking?: Partial<Record<PayrollTrackingField, string>>;
  resend_source_id?: string | null;
  id: string; facility_id: string; job_id: string; created_at: string;
  submission_status: PayrollItemStatus; delivery_status: PayrollDeliveryStatus;
  delivery_updated_at: string | null; attempt: number;
  error: { vi: string; zh: string } | null;
  delivery_reason: string | null; snapshot: PayrollSnapshot;
}
export type PayrollTrackingField = 'sent_at' | 'delivered_at' | 'first_opened_at' | 'last_opened_at' | 'first_proxy_opened_at' | 'last_proxy_opened_at';
export const payrollTrackingEvents: Record<string, readonly PayrollTrackingField[]> = {
  request: ['sent_at'], sent: ['sent_at'], delivered: ['delivered_at'],
  opened: ['first_opened_at', 'last_opened_at'], unique_opened: ['first_opened_at', 'last_opened_at'], uniqueOpened: ['first_opened_at', 'last_opened_at'],
  proxy_open: ['first_proxy_opened_at', 'last_proxy_opened_at'], proxyOpen: ['first_proxy_opened_at', 'last_proxy_opened_at'],
  unique_proxy_open: ['first_proxy_opened_at', 'last_proxy_opened_at'], uniqueProxyOpen: ['first_proxy_opened_at', 'last_proxy_opened_at'],
};
export function payrollTrackingPatch(event: string, stamp: number, current: Partial<Record<PayrollTrackingField, number>>) {
  const patch: Partial<Record<PayrollTrackingField, number>> = {};
  for (const field of Object.hasOwn(payrollTrackingEvents, event) ? payrollTrackingEvents[event] : []) {
    const old = current[field];
    if (!old || (field.startsWith('last_') ? stamp > old : stamp < old)) patch[field] = stamp;
  }
  return patch;
}
export function payrollHistoryResendPolicy(record: { submission_status?: PayrollItemStatus; delivery_status?: PayrollDeliveryStatus }) {
  const status = payrollHistoryStatus(record);
  return { allowed: status !== 'PENDING', requireDifferentEmail: ['HARD_BOUNCE', 'INVALID', 'BLOCKED'].includes(record.delivery_status || ''), delivered: status === 'SUCCESS' };
}
export function payrollHistoryAttempt(record: { id: string; job_id: string; recipient_id: string; attempt?: number | null }): number | null {
  if (Number.isSafeInteger(record.attempt) && (record.attempt ?? 0) > 0) return record.attempt!;
  const prefix = record.job_id + '_' + record.recipient_id + '_';
  const suffix = record.id.startsWith(prefix) ? record.id.slice(prefix.length) : '';
  const value = /^[1-9]\d*$/.test(suffix) ? Number(suffix) : 0;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
export function payrollHistoryStatus(record: { submission_status?: PayrollItemStatus; delivery_status?: PayrollDeliveryStatus }): PayrollHistoryStatus {
  if (record.delivery_status === 'DELIVERED') return 'SUCCESS';
  if (['SOFT_BOUNCE', 'HARD_BOUNCE', 'BLOCKED', 'INVALID', 'ERROR'].includes(record.delivery_status || '') || record.submission_status === 'FAILED') return 'ERROR';
  return 'PENDING';
}
export function payrollHistoryDateBounds(filters: PayrollHistoryFilters) {
  return { from: filters.from ? new Date(filters.from + 'T00:00:00+07:00') : null,
    until: filters.to ? new Date(new Date(filters.to + 'T00:00:00+07:00').getTime() + 86400000) : null };
}
