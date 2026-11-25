import { z } from "zod";

export const createInvoiceIssueJobSchema = z.object({
  warehouse_id: z.string().trim().min(1),
  invoice_document_ids: z.array(z.string().trim().min(1)).min(1).max(30),
  idempotency_key: z.string().trim().min(8).max(128),
});

export const invoiceIssueJobParamsSchema = z.object({
  jobId: z.string().trim().min(1),
});

export const invoiceIssueItemParamsSchema = z.object({
  jobId: z.string().trim().min(1),
  itemId: z.string().trim().min(1),
});

export const invoiceIssueJobScopeSchema = z.object({
  warehouse_id: z.string().trim().min(1),
});

export const listInvoiceIssueRetryCandidatesSchema = z.object({
  warehouse_id: z.string().trim().min(1),
  business_date: z.iso.date(),
});

const retryInvoiceScope = z.object({
  warehouse_id: z.string().trim().min(1),
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/u),
});

export const retryInvoiceIssueItemsSchema = z.union([
  retryInvoiceScope
    .extend({
      business_dates: z.array(z.iso.date()).min(1).max(31),
      invoice_document_ids: z.array(z.string().trim().min(1)).min(1),
    })
    .strict(),
  retryInvoiceScope.extend({ business_date: z.iso.date() }).strict(),
]);
