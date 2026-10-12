import type { PayrollItemStatus, PayrollSnapshot } from './payrollEmail.js';

export type PayrollDeliveryStatus = 'PENDING' | 'DEFERRED' | 'DELIVERED' | 'SOFT_BOUNCE' | 'HARD_BOUNCE' | 'BLOCKED' | 'INVALID' | 'ERROR';
export type PayrollHistoryStatus = 'PENDING' | 'SUCCESS' | 'ERROR';
export interface PayrollHistoryFilters { from?: string; to?: string; status?: 'ALL' | PayrollHistoryStatus }
export interface PayrollHistoryEntry {
  resend_source_id?: string | null;
  id: string; facility_id: string; job_id: string; created_at: string;
  submission_status: PayrollItemStatus; delivery_status: PayrollDeliveryStatus;
  delivery_updated_at: string | null; attempt: number;
  error: { vi: string; zh: string } | null;
  delivery_reason: string | null; snapshot: PayrollSnapshot;
}
export function payrollHistoryResendPolicy(record: { submission_status?: PayrollItemStatus; delivery_status?: PayrollDeliveryStatus }) {
  const status = payrollHistoryStatus(record);
  return { allowed: status !== 'PENDING', requireDifferentEmail: ['HARD_BOUNCE', 'INVALID', 'BLOCKED'].includes(record.delivery_status || ''), delivered: status === 'SUCCESS' };
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
