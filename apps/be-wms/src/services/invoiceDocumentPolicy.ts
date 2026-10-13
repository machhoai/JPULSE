import { createHash } from "node:crypto";

import {
  InvoiceDocumentStatus,
  type InvoicePreflightIssue,
  type InvoiceSourceOrderLine,
  type InvoiceVatRateName,
} from "@bduck/shared-types";

import { canonicalJson } from "./invoiceOrderSyncUtils.js";

const VAT_RATE_VALUES: Record<InvoiceVatRateName, number> = {
  "0%": 0,
  "5%": 5,
  "8%": 8,
  "10%": 10,
  KCT: 0,
  KKKNT: 0,
};

const SOURCE_MONEY_COMPARISON_ISSUE_CODES = new Set([
  "LINE_AMOUNT_MISMATCH",
  "LINE_VAT_MISMATCH",
  "LINE_TOTAL_MISMATCH",
  "MASTER_AMOUNT_MISMATCH",
  "MASTER_VAT_MISMATCH",
  "MASTER_TOTAL_MISMATCH",
]);

const PREFLIGHT_DOCUMENT_STATUSES = new Set<InvoiceDocumentStatus>([
  InvoiceDocumentStatus.NEEDS_TAX_CONFIGURATION,
  InvoiceDocumentStatus.NEEDS_CORRECTION,
  InvoiceDocumentStatus.READY_TO_ISSUE,
]);

export const vatRateValue = (name: InvoiceVatRateName): number =>
  VAT_RATE_VALUES[name];

export const validationStateWithoutSourceMoneyComparison = (
  status: InvoiceDocumentStatus,
  issues: InvoicePreflightIssue[],
): {
  status: InvoiceDocumentStatus;
  issueEligible: boolean;
  issues: InvoicePreflightIssue[];
} | null => {
  if (!PREFLIGHT_DOCUMENT_STATUSES.has(status)) return null;
  const remainingIssues = issues.filter(
    (item) => !SOURCE_MONEY_COMPARISON_ISSUE_CODES.has(item.code),
  );
  if (remainingIssues.length === issues.length) return null;

  const hasError = remainingIssues.some((item) => item.severity === "ERROR");
  const needsTaxConfiguration = remainingIssues.some((item) =>
    ["PRICE_VAT_MODE_UNCONFIRMED", "VAT_RATE_MISSING"].includes(item.code),
  );
  return {
    status: needsTaxConfiguration
      ? InvoiceDocumentStatus.NEEDS_TAX_CONFIGURATION
      : hasError
        ? InvoiceDocumentStatus.NEEDS_CORRECTION
        : InvoiceDocumentStatus.READY_TO_ISSUE,
    issueEligible: !hasError,
    issues: remainingIssues,
  };
};

const financialFields = (line: InvoiceSourceOrderLine) => ({
  line_number: line.line_number,
  quantity: line.quantity,
  unit_price: line.unit_price,
  discount_rate: line.discount_rate,
  discount_amount: line.discount_amount,
  vat_rate_name: line.vat_rate_name,
});

export const invoiceFinancialFingerprint = (
  items: InvoiceSourceOrderLine[],
): string =>
  createHash("sha256")
    .update(canonicalJson(items.map(financialFields)))
    .digest("hex");

export const statusAfterInvoiceEdit = (
  sourceFinancialFingerprint: string,
  nextItems: InvoiceSourceOrderLine[],
): {
  status: InvoiceDocumentStatus;
  financiallyEdited: boolean;
} => {
  const financiallyEdited =
    invoiceFinancialFingerprint(nextItems) !== sourceFinancialFingerprint;
  return {
    status: InvoiceDocumentStatus.READY_TO_ISSUE,
    financiallyEdited,
  };
};

export const canEditInvoiceDocument = (
  status: InvoiceDocumentStatus,
): boolean =>
  [
    InvoiceDocumentStatus.NEEDS_TAX_CONFIGURATION,
    InvoiceDocumentStatus.NEEDS_CORRECTION,
    InvoiceDocumentStatus.NEEDS_REVIEW,
    InvoiceDocumentStatus.NEEDS_SECOND_REVIEW,
    InvoiceDocumentStatus.READY_TO_ISSUE,
    InvoiceDocumentStatus.REJECTED,
  ].includes(status);

const SAFE_AUTO_REBASE_STATUSES = new Set<InvoiceDocumentStatus>([
  InvoiceDocumentStatus.NEEDS_TAX_CONFIGURATION,
  InvoiceDocumentStatus.NEEDS_CORRECTION,
  InvoiceDocumentStatus.READY_TO_ISSUE,
]);

export const canSafelyAutoRebaseInvoiceDocument = (
  document: Record<string, unknown>,
  next?: Record<string, unknown>,
): boolean =>
  SAFE_AUTO_REBASE_STATUSES.has(document.status as InvoiceDocumentStatus) &&
  document.financially_edited !== true &&
  document.content_edited !== true &&
  (!document.edited_at ||
    document.edited_by === "public-customer" ||
    document.content_edited === false) &&
  !document.reviewed_at &&
  !document.rejected_at &&
  !document.active_issue_job_id &&
  (!next || !invoiceSourceContentChanged(document, next));

// Compare what the invoice will show, ignoring source precision and category
// metadata. JPOS and HKAPI can encode the same rounded invoice differently.
export const invoiceSourceContent = (document: Record<string, unknown>) => {
  const calculation = document.calculation as Record<string, unknown> | null;
  const lines = Array.isArray(calculation?.lines) ? calculation.lines : [];
  return {
    items: lines.map((line: Record<string, unknown>) => ({
      source_item_id: line.source_item_id ?? null,
      item_code: line.item_code ?? null,
      item_name: line.item_name,
      unit_name: line.unit_name,
      quantity: line.quantity,
      unit_price: line.unit_price,
      discount: line.calculated_discount_amount ?? 0,
      vat_rate_name: line.vat_rate_name,
      amount_without_vat: line.amount_without_vat,
      vat_amount: line.vat_amount,
      total_amount: line.total_amount,
    })),
    total_amount_without_vat: calculation?.total_amount_without_vat ?? null,
    total_vat_amount: calculation?.total_vat_amount ?? null,
    total_amount: calculation?.total_amount ?? null,
    payment_method_name: document.payment_method_name ?? "",
    payment_date:
      typeof document.payment_time === "string"
        ? document.payment_time.slice(0, 10)
        : null,
    meinvoice_account_id: document.meinvoice_account_id ?? null,
    legal_entity_id: document.legal_entity_id ?? null,
  };
};

export const invoiceSourceContentHash = (document: Record<string, unknown>) =>
  createHash("sha256")
    .update(
      canonicalJson({
        ...invoiceSourceContent(document),
        issue_eligible: document.issue_eligible,
        validation_issues: document.validation_issues,
      }),
    )
    .digest("hex");

export const invoiceSourceContentChanged = (
  current: Record<string, unknown>,
  next: Record<string, unknown>,
) =>
  Boolean(current.calculation) &&
  canonicalJson(invoiceSourceContent(current)) !==
    canonicalJson(invoiceSourceContent(next));

export const invoiceEditableContentFingerprint = (
  items: InvoiceSourceOrderLine[],
  paymentMethod: string,
) =>
  createHash("sha256")
    .update(canonicalJson({ items, paymentMethod }))
    .digest("hex");

export const invoiceSourceProjectionHash = (source: Record<string, unknown>) =>
  createHash("sha256")
    .update(
      canonicalJson({
        normalized_items: source.normalized_items,
        calculation: source.calculation,
        preflight: source.preflight,
        mapped_payment_method: source.mapped_payment_method,
        payment_time: source.payment_time,
        mapping_version: source.mapping_version,
        calculation_version: source.calculation_version,
      }),
    )
    .digest("hex");

const calculationHash = (value: unknown): string | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const hash = (value as Record<string, unknown>).calculation_hash;
  return typeof hash === "string" && hash ? hash : null;
};

export const invoiceDocumentShouldRefreshFromSource = (
  current: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean => {
  if (!canSafelyAutoRebaseInvoiceDocument(current, next)) {
    return false;
  }
  return invoiceDocumentNeedsSourceUpdate(current, next);
};

export const invoiceDocumentNeedsSourceUpdate = (
  current: Record<string, unknown>,
  next: Record<string, unknown>,
) =>
  current.source_payload_hash !== next.source_payload_hash ||
  current.source_financial_fingerprint !== next.source_financial_fingerprint ||
  calculationHash(current.calculation) !== calculationHash(next.calculation) ||
  current.payment_method_name !== next.payment_method_name ||
  current.meinvoice_account_id !== next.meinvoice_account_id ||
  invoiceSourceContentChanged(current, next);
