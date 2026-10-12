import type { ISOTimestamped, SoftDeletable } from './utility.js';

export type PayrollBlock = 'employee-info' | 'attendance' | 'payslip';
export type PayrollValue = string | number | null;
export interface PayrollDeltaOp {
  insert: string | { payroll: PayrollBlock };
  attributes?: Record<string, string | number | boolean>;
}
export interface PayrollSource {
  file: string; sheet: string; row: number; column?: string;
}
export interface PayrollIssue {
  code: string; severity: 'ERROR' | 'WARNING'; field?: string;
  source: PayrollSource; messages: { vi: string; zh: string };
}
export interface PayrollRecipient {
  match_candidates?: {
    salary: { name: string; values: Record<string, PayrollValue>; source: PayrollSource; issues: PayrollIssue[] }[];
    attendance: { name: string; rows: Record<string, PayrollValue>[]; source: PayrollSource; issues: PayrollIssue[] }[];
  };
  resolved_sources?: Record<string, PayrollSource>;
  id: string; name: string; email: string; original_email: string;
  selected: boolean; source: PayrollSource;
  values: Record<string, PayrollValue>;
  attendance: Record<string, PayrollValue>[];
  issues: PayrollIssue[];
}
export interface PayrollSourceMapping {
  sheet: string; start_row: number; columns: Record<string, string>;
}
export interface PayrollComposer {
  subject: string; ops: PayrollDeltaOp[];
  fields: Record<PayrollBlock, string[]>; signature_id: string | null;
  mappings: Record<string, PayrollSourceMapping>;
}
export interface PayrollEmailTemplate extends SoftDeletable, ISOTimestamped {
  id: string; name: string; facility_id: string; revision: number;
  composer: PayrollComposer; created_by: string;
}
export interface EmailSignature extends SoftDeletable, ISOTimestamped {
  id: string; name: string; html: string; text: string; revision: number; created_by: string;
}
export interface PayrollDraftContent {
  recipient_ids?: string[];
  composer: PayrollComposer; template_id: string; name: string; clock: string;
}
export interface PayrollDraftMetadata extends SoftDeletable, ISOTimestamped {
  id: string; name: string; facility_id: string; created_by: string;
  template_id: string; revision: number; payload_path: string;
}
export type PayrollItemStatus = 'QUEUED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'UNKNOWN';
export interface PayrollJobMetadata extends SoftDeletable, ISOTimestamped {
  wake_at?: Date | null; confirmed_receipt_ids?: string[];
  preparation_path?: string; prepared_count?: number;
  id: string; facility_id: string; created_by: string; draft_id: string;
  session_id: string; status: 'PREPARING' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'PARTIAL';
  total: number; sent: number; failed: number; unknown: number; revision: number;
  enqueue_pending: boolean; lease_until: Date | null; lease_token: string | null;
}
export interface PayrollSnapshot {
  name: string; email: string; subject: string; html: string; text: string;
  clock: string; recipient_id: string;
}
export interface PayrollJobItem {
  receipt_id?: string;
  next_retry_at?: Date;
  id: string; status: PayrollItemStatus; payload_path: string;
  chunk: number; attempt: number; error: { vi: string; zh: string } | null;
  message_id: string | null; updated_at: Date;
}
export interface PayrollSentMetadata extends SoftDeletable, ISOTimestamped {
  id: string; facility_id: string; job_id: string; created_by: string;
  payload_path: string; message_id: string | null;
}
