import { z } from "zod";
import { PAYROLL_FIELDS } from "@bduck/shared-types";
export const payrollId = z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
const safeText = z.string().max(20000).refine(v => !/[\u0000]|\$(?:where|ne|nin|regex)\b/.test(v));
const actionTime = z.iso.datetime().transform(v => new Date(v)).optional();
const field = z.enum(Object.keys(PAYROLL_FIELDS) as [string, ...string[]]);
const fieldKey = z.string().refine(f => Object.hasOwn(PAYROLL_FIELDS, f));
function fieldRecord<T extends z.ZodType>(value: T) {
  // Check the original JSON before Zod removes prototype-related keys.
  return z.preprocess(raw => raw && typeof raw === "object" &&
    Object.keys(raw).some(key => !Object.hasOwn(PAYROLL_FIELDS, key)) ? undefined : raw, z.record(fieldKey, value));
}
const block = z.enum(["employee-info", "attendance", "payslip"]);
const op = z.object({ insert: z.union([safeText, z.object({ payroll: block }).strict()]),
  attributes: z.record(z.string(), z.union([z.string().max(2000), z.number(), z.boolean()])).optional() }).strict();
export const composerSchema = z.object({ subject: z.string().min(1).max(500).refine(v => !/[\r\n]/.test(v)),
  ops: z.array(op).refine(ops => { const blocks = ops.flatMap(o => typeof o.insert === "string" ? [] : [o.insert.payroll]); return new Set(blocks).size === blocks.length; }, "Mỗi bảng chỉ được chèn một lần / 每个表格只能插入一次"), fields: z.object({ "employee-info": z.array(field), attendance: z.array(field), payslip: z.array(field) }),
  signature_id: payrollId.nullable(), mappings: z.record(z.string().regex(/^[a-z_-]+$/), z.object({
    sheet: z.string().max(200), start_row: z.number().int().positive(),
    columns: fieldRecord(z.string().regex(/^[A-Z]{1,3}$/)) })) });
export const sourceSchema = z.object({ file: z.string().max(300), sheet: z.string().max(200),
  row: z.number().int().positive(), column: z.string().max(20).optional() });
const value = z.union([z.string().max(10000), z.number().finite(), z.null()]);
const issueSchema = z.object({ code: z.string().max(80), severity: z.enum(["ERROR", "WARNING"]),
  field: z.string().optional(), source: sourceSchema, messages: z.object({ vi: safeText, zh: safeText }) });
export const recipientSchema = z.object({ id: payrollId, name: z.string().min(1).max(300),
  action_time: actionTime,
  resolved_sources: z.record(z.string(), sourceSchema).optional(),
  match_candidates: z.object({
    salary: z.array(z.object({ name: z.string(), values: fieldRecord(value), source: sourceSchema, issues: z.array(issueSchema) })),
    attendance: z.array(z.object({ name: z.string(), rows: z.array(fieldRecord(value)), source: sourceSchema, issues: z.array(issueSchema) })),
  }).optional(),
  draft_revision: z.number().int().positive().optional(),
  email: z.string().max(320), original_email: z.string().max(320), selected: z.boolean(),
  source: sourceSchema, values: fieldRecord(value), attendance: z.array(fieldRecord(value)),
  issues: z.array(z.object({ code: z.string().max(80), severity: z.enum(["ERROR", "WARNING"]),
    field: z.string().optional(), source: sourceSchema,
    messages: z.object({ vi: safeText, zh: safeText }) })) }).strict();
export const templateSchema = z.object({ name: z.string().trim().min(1).max(160), facility_id: payrollId,
  action_time: actionTime,
  composer: composerSchema, revision: z.number().int().nonnegative() });
export const signatureSchema = z.object({ name: z.string().trim().min(1).max(160),
  action_time: actionTime,
  html: z.string().max(100000), revision: z.number().int().nonnegative() });
export const draftSchema = z.object({ template_id: payrollId, name: z.string().min(1).max(160),
  action_time: actionTime,
  recipient_ids: z.array(payrollId).optional(),
  composer: composerSchema, clock: z.iso.datetime(), revision: z.number().int().nonnegative() });
export const jobSchema = z.object({ draft_id: payrollId, recipient_ids: z.array(payrollId).min(1),
  action_time: actionTime,
  draft_revision: z.number().int().positive(), signature_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  session_id: payrollId, request_id: payrollId, confirmation: z.string().max(300).optional() });
export const emailSchema = z.string().email().max(320);
export function payrollError(vi: string, zh: string, statusCode = 400, data?: unknown): never {
  throw { statusCode, messages: { vi, zh }, data };
}
