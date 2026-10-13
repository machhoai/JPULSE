import assert from "node:assert/strict";
import test from "node:test";

import {
  InvoiceDocumentStatus,
  InvoicePreparationStatus,
  MeInvoiceEnvironment,
  MeInvoiceSignType,
  type InvoiceSourceOrderLine,
  type MeInvoiceStoreConfig,
} from "@bduck/shared-types";

import type { StoredMeInvoiceAccount } from "../repositories/meInvoiceConfigRepository.js";

import { calculateInvoice } from "./invoiceCalculationService.js";
import { buildInitialInvoiceDocument } from "./invoiceDocumentDraftBuilder.js";
import {
  canSafelyAutoRebaseInvoiceDocument,
  invoiceFinancialFingerprint,
  invoiceDocumentShouldRefreshFromSource,
  invoiceSourceContentChanged,
  invoiceSourceContentHash,
  invoiceEditableContentFingerprint,
  invoiceSourceProjectionHash,
  statusAfterInvoiceEdit,
  validationStateWithoutSourceMoneyComparison,
} from "./invoiceDocumentPolicy.js";
import {
  invoiceDocumentBulkRebaseSchema,
  invoiceDocumentUpdateSchema,
} from "./invoiceDocumentSchemas.js";

const option = {
  main_currency: "VND",
  amount_decimal_digits: 0,
  amount_oc_decimal_digits: 0,
  unit_price_oc_decimal_digits: 0,
  unit_price_decimal_digits: 0,
  quantity_decimal_digits: 2,
  coefficient_decimal_digits: 0,
  exchange_rate_decimal_digits: 2,
};

const sourceLine: InvoiceSourceOrderLine = {
  line_number: 1,
  source_item_id: "sku-1",
  item_code: "SKU-1",
  item_name: "Sản phẩm",
  category_code: null,
  category_name: null,
  unit_name: "Cái",
  quantity: 1,
  unit_price: 110_000,
  discount_rate: null,
  discount_amount: null,
  vat_rate_name: "10%",
  vat_rate: 10,
  source_amount_without_vat: 100_000,
  source_vat_amount: 10_000,
  source_total_amount: 110_000,
};

const storeConfig = {
  id: "warehouse-1",
  warehouse_id: "warehouse-1",
  meinvoice_account_id: "account-1",
  inv_series: "1C26MYY",
  invoice_with_code: true,
  sign_type: MeInvoiceSignType.CALCULATING_MACHINE,
  is_invoice_calculating_machine: true,
  seller_shop_code: "SHOP-1",
  seller_shop_name: "Shop 1",
  price_includes_vat: true,
  tax_rate_source: "SKU",
  default_vat_rate_name: "10%",
  sku_mapping: {},
  category_vat_mapping: {},
  payment_method_mapping: {},
  go_live_at: new Date("2026-07-01T00:00:00+07:00"),
  invoice_date_source: "PAYMENT_TIME",
  issue_scope: "GO_LIVE_FORWARD",
  default_buyer_name: "Khách lẻ (Không lấy hóa đơn)",
  default_buyer_address: "",
  default_buyer_tax_code: null,
  option_user_defined: option,
  enabled: true,
  validated_at: new Date(),
  validation_error_code: null,
  created_by: "admin",
  updated_by: "admin",
  is_deleted: false,
  created_at: new Date(),
  updated_at: new Date(),
} as MeInvoiceStoreConfig;

const account = {
  id: "account-1",
  legal_entity_id: "legal-1",
  environment: MeInvoiceEnvironment.SANDBOX,
  enabled: true,
  is_deleted: false,
  last_test_succeeded: true,
} as StoredMeInvoiceAccount;

test("draft edits remain ready to issue without an approval state", () => {
  const sourceFingerprint = invoiceFinancialFingerprint([sourceLine]);
  const textOnly = statusAfterInvoiceEdit(sourceFingerprint, [
    {
      ...sourceLine,
      item_name: "Tên mới",
    },
  ]);
  const financial = statusAfterInvoiceEdit(sourceFingerprint, [
    {
      ...sourceLine,
      quantity: 2,
    },
  ]);

  assert.deepEqual(textOnly, {
    status: InvoiceDocumentStatus.READY_TO_ISSUE,
    financiallyEdited: false,
  });
  assert.deepEqual(financial, {
    status: InvoiceDocumentStatus.READY_TO_ISSUE,
    financiallyEdited: true,
  });
});

test("VAT configuration changes need confirmation even on an untouched draft", () => {
  const zeroVatLine = {
    ...sourceLine,
    vat_rate_name: "0%" as const,
    vat_rate: 0,
  };
  assert.equal(
    invoiceDocumentShouldRefreshFromSource(
      {
        status: InvoiceDocumentStatus.READY_TO_ISSUE,
        financially_edited: false,
        source_financial_fingerprint: invoiceFinancialFingerprint([
          zeroVatLine,
        ]),
        calculation: calculateInvoice([zeroVatLine], true, option),
        payment_method_name: "TM/CK",
        meinvoice_account_id: "account-1",
      },
      {
        source_financial_fingerprint: invoiceFinancialFingerprint([sourceLine]),
        calculation: calculateInvoice([sourceLine], true, option),
        payment_method_name: "TM/CK",
        meinvoice_account_id: "account-1",
      },
    ),
    false,
  );
});

const comparableDraft = (line = sourceLine) => ({
  status: InvoiceDocumentStatus.READY_TO_ISSUE,
  source_payload_hash: "a".repeat(64),
  source_financial_fingerprint: invoiceFinancialFingerprint([line]),
  source_content_fingerprint: invoiceEditableContentFingerprint(
    [line],
    "TM/CK",
  ),
  content_edited: false,
  financially_edited: false,
  items: [line],
  calculation: calculateInvoice([line], true, option),
  payment_method_name: "TM/CK",
  payment_time: "2026-10-12 19:57:29",
  meinvoice_account_id: "account-1",
  legal_entity_id: "legal-1",
  issue_eligible: true,
  validation_issues: [],
});

test("customer buyer submissions do not block equivalent JPOS to HKAPI enrichment", () => {
  const posLine = {
    ...sourceLine,
    unit_price: 500000,
    source_amount_without_vat: 454545,
    source_vat_amount: 45455,
    source_total_amount: 500000,
  };
  const current = {
    ...comparableDraft(posLine),
    edited_by: "public-customer",
    edited_at: new Date(),
    buyer: { full_name: "READY CARE", tax_code: "0317981545" },
  };
  const hkLine = {
    ...posLine,
    category_code: "1",
    category_name: "Hàng hóa ảo",
    discount_amount: 0,
    source_amount_without_vat: 454545.45,
    source_vat_amount: 45454.55,
  };
  const next = {
    ...comparableDraft(hkLine),
    source_payload_hash: "b".repeat(64),
    payment_time: "2026-10-12 19:57:31",
  };
  assert.notEqual(
    current.calculation?.calculation_hash,
    next.calculation?.calculation_hash,
  );
  assert.equal(invoiceSourceContentChanged(current, next), false);
  assert.equal(canSafelyAutoRebaseInvoiceDocument(current, next), true);
  assert.equal(invoiceDocumentShouldRefreshFromSource(current, next), true);
  assert.equal(
    invoiceEditableContentFingerprint(current.items, "TM/CK"),
    current.source_content_fingerprint,
  );
});

test("buyer-only staff edits can refresh but content edits, reviews and active jobs cannot", () => {
  const current = {
    ...comparableDraft(),
    edited_by: "staff",
    edited_at: new Date(),
  };
  const next = { ...comparableDraft(), source_payload_hash: "b".repeat(64) };
  assert.equal(canSafelyAutoRebaseInvoiceDocument(current, next), true);
  for (const override of [
    { content_edited: true },
    { reviewed_at: new Date() },
    { active_issue_job_id: "job" },
    { financially_edited: true },
    { status: InvoiceDocumentStatus.ISSUED },
    { status: InvoiceDocumentStatus.SUBMITTING },
  ]) {
    assert.equal(
      canSafelyAutoRebaseInvoiceDocument({ ...current, ...override }, next),
      false,
    );
  }
  assert.equal(
    canSafelyAutoRebaseInvoiceDocument(
      { ...current, edited_by: "public-customer", content_edited: true },
      next,
    ),
    false,
  );
});

test("actual invoice changes require confirmation even when invoice totals are unchanged", () => {
  const current = comparableDraft();
  for (const line of [
    { ...sourceLine, item_name: "Khác" },
    { ...sourceLine, item_code: "NEW" },
    { ...sourceLine, unit_name: "Hộp" },
    { ...sourceLine, quantity: 2, unit_price: 55000 },
    { ...sourceLine, vat_rate_name: "8%" as const, vat_rate: 8 },
    { ...sourceLine, unit_price: 111000 },
  ]) {
    const next = comparableDraft(line);
    assert.equal(invoiceSourceContentChanged(current, next), true);
    assert.equal(canSafelyAutoRebaseInvoiceDocument(current, next), false);
  }
  for (const override of [
    { payment_method_name: "TM" },
    { payment_time: "2026-10-13 00:00:00" },
    { meinvoice_account_id: "other" },
    { legal_entity_id: "other" },
  ]) {
    assert.equal(
      invoiceSourceContentChanged(current, { ...current, ...override }),
      true,
    );
  }
});

test("review hashes capture changed calculation and validation with unchanged source payload", () => {
  const current = comparableDraft();
  assert.notEqual(
    invoiceSourceContentHash(current),
    invoiceSourceContentHash(comparableDraft({ ...sourceLine, quantity: 2 })),
  );
  assert.notEqual(
    invoiceSourceContentHash(current),
    invoiceSourceContentHash({ ...current, issue_eligible: false }),
  );
  assert.notEqual(
    invoiceSourceProjectionHash({ normalized_items: [sourceLine] }),
    invoiceSourceProjectionHash({
      normalized_items: [{ ...sourceLine, quantity: 2 }],
    }),
  );
});

test("bulk confirmation requires explicit unique selected snapshots", () => {
  const id = "a".repeat(64);
  const confirmation = {
    source_order_document_id: id,
    expected_revision: 3,
    expected_source_payload_hash: "b".repeat(64),
    expected_source_content_hash: "c".repeat(64),
  };
  const base = {
    warehouse_id: "warehouse-1",
    business_date: "2026-10-12",
    selection_mode: "SELECTED",
    source_order_ids: [id],
    confirmations: [confirmation],
  };
  assert.equal(invoiceDocumentBulkRebaseSchema.safeParse(base).success, true);
  for (const override of [
    { selection_mode: "ALL_STALE" },
    { source_order_ids: ["d".repeat(64)] },
    { confirmations: [confirmation, confirmation] },
    { confirmations: [{ ...confirmation, expected_revision: 0 }] },
  ]) {
    assert.equal(
      invoiceDocumentBulkRebaseSchema.safeParse({ ...base, ...override })
        .success,
      false,
    );
  }
});

test("a financially edited draft is never overwritten by automatic refresh", () => {
  assert.equal(
    invoiceDocumentShouldRefreshFromSource(
      {
        status: InvoiceDocumentStatus.READY_TO_ISSUE,
        financially_edited: true,
        source_financial_fingerprint: "old",
      },
      { source_financial_fingerprint: "new" },
    ),
    false,
  );
});

test("legacy JoyWorld money mismatches no longer block an existing draft", () => {
  const result = validationStateWithoutSourceMoneyComparison(
    InvoiceDocumentStatus.NEEDS_CORRECTION,
    [
      {
        code: "MASTER_AMOUNT_MISMATCH",
        path: "calculation",
        message: "Tổng trước thuế không khớp dữ liệu nguồn.",
        severity: "ERROR",
      },
      {
        code: "MASTER_VAT_MISMATCH",
        path: "calculation",
        message: "Tổng tiền thuế không khớp dữ liệu nguồn.",
        severity: "ERROR",
      },
    ],
  );

  assert.deepEqual(result, {
    status: InvoiceDocumentStatus.READY_TO_ISSUE,
    issueEligible: true,
    issues: [],
  });
});

test("draft update schema rejects duplicate lines and ambiguous discounts", () => {
  const result = invoiceDocumentUpdateSchema.safeParse({
    warehouse_id: "warehouse-1",
    expected_revision: 1,
    expected_source_payload_hash: "a".repeat(64),
    buyer: {
      full_name: "Khách lẻ",
      legal_name: "",
      tax_code: "",
      address: "",
      phone_number: "",
      email: "",
    },
    payment_method_name: "TM/CK",
    items: [1, 2].map(() => ({
      ...sourceLine,
      vat_rate: undefined,
      line_number: 1,
      discount_rate: 5,
      discount_amount: 1_000,
    })),
  });
  assert.equal(result.success, false);
});

test("initial document preserves source data and starts at revision one", () => {
  const calculation = calculateInvoice([sourceLine], true, option);
  const document = buildInitialInvoiceDocument(
    {
      id: "a".repeat(64),
      warehouse_id: "warehouse-1",
      source_order_id: "order-1",
      source_payload_hash: "b".repeat(64),
      order_number: "HD-1",
      payment_time: "2026-07-20 10:00:00",
      source_action_time: new Date("2026-07-20T03:00:00Z"),
      mapped_payment_method: "TM/CK",
      normalized_items: [sourceLine],
      calculation,
      preflight: {
        status: InvoicePreparationStatus.READY_TO_ISSUE,
        issue_eligible: true,
        issues: [],
      },
      mapping_version: "mapping-v1",
      calculation_version: "calculation-v1",
    },
    storeConfig,
    account,
    "importer-1",
    new Date("2026-07-20T04:00:00Z"),
  );

  assert.ok(document);
  assert.equal(document.revision, 1);
  assert.equal(document.status, InvoiceDocumentStatus.READY_TO_ISSUE);
  assert.equal(document.financially_edited, false);
  assert.deepEqual(document.buyer, {
    full_name: "Khách lẻ (Không lấy hóa đơn)",
    legal_name: "",
    tax_code: "",
    address: "",
    phone_number: "",
    email: "",
  });
});

test("automatic rebase is limited to untouched draft states", () => {
  const untouched = {
    status: InvoiceDocumentStatus.READY_TO_ISSUE,
    financially_edited: false,
    edited_at: null,
    reviewed_at: null,
    rejected_at: null,
    active_issue_job_id: null,
  };
  assert.equal(canSafelyAutoRebaseInvoiceDocument(untouched), true);
  assert.equal(
    canSafelyAutoRebaseInvoiceDocument({
      ...untouched,
      edited_at: new Date(),
    }),
    false,
  );
  assert.equal(
    canSafelyAutoRebaseInvoiceDocument({
      ...untouched,
      status: InvoiceDocumentStatus.NEEDS_REVIEW,
    }),
    false,
  );
  assert.equal(
    canSafelyAutoRebaseInvoiceDocument({
      ...untouched,
      active_issue_job_id: "job-1",
    }),
    false,
  );
});

test("bulk rebase schema supports all stale or an explicit selection", () => {
  assert.equal(
    invoiceDocumentBulkRebaseSchema.safeParse({
      warehouse_id: "warehouse-1",
      business_date: "2026-08-18",
      selection_mode: "ALL_STALE",
    }).success,
    true,
  );
  assert.equal(
    invoiceDocumentBulkRebaseSchema.safeParse({
      warehouse_id: "warehouse-1",
      business_date: "2026-08-18",
      selection_mode: "SELECTED",
      source_order_ids: [],
    }).success,
    false,
  );
});
