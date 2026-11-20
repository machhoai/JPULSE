import { createHash } from "node:crypto";
import { InvoicePreparationStatus } from "@bduck/shared-types";

import type {
  InvoiceSkuMapping,
  InvoiceSourceOrderLine,
  InvoiceVatRateName,
  MeInvoiceStoreConfig,
} from "@bduck/shared-types";

import type { SourceOrderWrite } from "../repositories/invoiceOrderRepository.js";
import type {
  StoredMeInvoiceAccount,
} from "../repositories/meInvoiceConfigRepository.js";
import type {
  PosInvoiceOrderRecord,
} from "../repositories/posInvoiceOrderRepository.js";

import {
  calculateInvoice,
  INVOICE_CALCULATION_VERSION,
} from "./invoiceCalculationService.js";
import { invoiceLineShouldAppearInIssuedInvoice } from "./invoiceLineVisibilityPolicy.js";
import { normalizeVatRateName } from "./invoiceOrderAdapter.js";
import { canonicalJson, parseJoyworldDate } from "./invoiceOrderSyncUtils.js";
import { resolvePosOrderPaymentMethod } from "./invoicePaymentMethod.js";
import { preflightInvoiceSourceOrder } from "./invoicePreflightService.js";

export const JPOS_INVOICE_MAPPING_VERSION = "jpos-meinvoice-v2";
const PAID_STATUSES = new Set([
  "LOCAL_PAID",
  "SYNCING",
  "SYNC_FAILED",
  "SYNC_SUCCESS",
]);

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const number = (value: unknown): number | null => {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveVatRate = (
  item: Record<string, unknown>,
  mapping: InvoiceSkuMapping | undefined,
  config: MeInvoiceStoreConfig | null,
): InvoiceVatRateName | null => {
  return normalizeVatRateName(item.vatRateName)
    ?? normalizeVatRateName(item.taxRate)
    ?? mapping?.vat_rate_name
    ?? config?.default_vat_rate_name
    ?? null;
};

const normalizeItems = (
  order: PosInvoiceOrderRecord,
  config: MeInvoiceStoreConfig | null,
): InvoiceSourceOrderLine[] =>
  (Array.isArray(order.items) ? order.items : []).map((item, index) => {
    const goodsId = text(item.goodsId);
    const mapping = goodsId ? config?.sku_mapping[goodsId] : undefined;
    const quantity = number(item.quantity);
    const grossUnitPrice = number(item.price);
    const netUnitPrice = number(item.unitPriceBeforeTax);
    const vatRateName = resolveVatRate(item, mapping, config);
    const sourceTotal =
      grossUnitPrice !== null && quantity !== null
        ? grossUnitPrice * quantity
        : null;
    const sourceBeforeTax =
      netUnitPrice !== null && quantity !== null
        ? netUnitPrice * quantity
        : null;
    const sourceVat = number(item.taxAmount)
      ?? (sourceTotal !== null && sourceBeforeTax !== null
        ? sourceTotal - sourceBeforeTax
        : null);

    return {
      line_number: index + 1,
      source_item_id: goodsId,
      item_code: mapping?.item_code ?? goodsId,
      item_name: mapping?.item_name ?? text(item.goodsName),
      category_code: null,
      category_name: null,
      unit_name: mapping?.unit_name ?? config?.default_unit_name ?? null,
      quantity,
      unit_price: grossUnitPrice,
      discount_rate: null,
      discount_amount: null,
      vat_rate_name: vatRateName,
      vat_rate:
        vatRateName && /^\d+%$/.test(vatRateName)
          ? Number(vatRateName.slice(0, -1))
          : 0,
      source_amount_without_vat: sourceBeforeTax,
      source_vat_amount: sourceVat,
      source_total_amount: sourceTotal,
    };
  });

const safeRawItem = (item: Record<string, unknown>) => ({
  goodsId: text(item.goodsId),
  goodsName: text(item.goodsName),
  price: number(item.price),
  quantity: number(item.quantity),
  unitPriceBeforeTax: number(item.unitPriceBeforeTax),
  taxRate: number(item.taxRate),
  ...(text(item.vatRateName) ? { vatRateName: text(item.vatRateName) } : {}),
  taxAmount: number(item.taxAmount),
});

const freeVoucherDiscounts = (order: PosInvoiceOrderRecord) =>
  (Array.isArray(order.vouchers) ? order.vouchers : []).flatMap((voucher) => {
    const goodsId = text(voucher?.product?.goodsId);
    const amount = number(voucher?.discountAmount);
    return voucher?.rewardType !== "DISCOUNT_PERCENT" && goodsId &&
      amount !== null && Number.isSafeInteger(amount) && amount > 0
      ? [{ goodsId, amount }]
      : [];
  });

const safeRawOrder = (order: PosInvoiceOrderRecord) => ({
  localOrderId: order.localOrderId,
  hkOrderNumber: order.hkOrderNumber ?? null,
  warehouseId: order.warehouseId,
  shopId: number(order.shopId),
  status: order.status,
  paymentMethod: text(order.paymentMethod),
  paymentMethodId: text(order.paymentMethodId),
  paymentMethodName: text(order.paymentMethodName),
  totalAmount: number(order.totalAmount),
  discountAmount: number(order.discountAmount) ?? number(order.voucherDiscount),
  freeVoucherDiscounts: freeVoucherDiscounts(order),
  items: (Array.isArray(order.items) ? order.items : []).map(safeRawItem),
  customerName: text(order.customerName),
  customerPhone: text(order.customerPhone),
  createdAt: order.createdAt,
  paidAt: text(order.paidAt),
  updatedAt: text(order.updatedAt),
});

export const posOrderIsPaid = (order: PosInvoiceOrderRecord): boolean =>
  order.source !== "JOYWORLD_IMPORT" &&
  order.syncStatus !== "CANCELLED" &&
  (order.paymentStatus == null || order.paymentStatus === "PAID") &&
  PAID_STATUSES.has(order.status) && Boolean(text(order.paidAt));

// Allocate whole VND by cumulative gross amount so every rounding remainder
// is assigned deterministically and the discounts sum to the settled amount.
function allocateDiscount(
  lines: InvoiceSourceOrderLine[],
  gross: number,
  discount: number,
  freeVouchers: ReturnType<typeof freeVoucherDiscounts>,
) {
  if (!discount || !Number.isSafeInteger(gross) || !Number.isSafeInteger(discount) ||
      discount < 0 || gross < discount ||
      lines.some((line) => !Number.isSafeInteger(line.source_total_amount) ||
        (line.source_total_amount ?? 0) < 0)) return;
  const remainingBySku = new Map<string, number>();
  for (const { goodsId, amount } of freeVouchers) {
    remainingBySku.set(goodsId, (remainingBySku.get(goodsId) ?? 0) + amount);
  }
  const targeted = lines.map((line) => {
    const id = line.source_item_id ?? "";
    const pending = remainingBySku.get(id) ?? 0;
    const amount = Math.min(pending, line.source_total_amount ?? 0);
    remainingBySku.set(id, pending - amount);
    return amount;
  });
  const targetedTotal = targeted.reduce((sum, value) => sum + value, 0);
  const usableTargets = targetedTotal <= discount && [...remainingBySku.values()].every((amount) => amount === 0);
  const remainingGross = usableTargets ? gross - targetedTotal : gross;
  const remainingDiscount = usableTargets ? discount - targetedTotal : discount;
  let cumulative = 0n;
  let allocated = 0n;
  lines.forEach((line, index) => {
    const specific = usableTargets ? targeted[index] : 0;
    cumulative += BigInt((line.source_total_amount ?? 0) - specific);
    const target = remainingGross
      ? cumulative * BigInt(remainingDiscount) / BigInt(remainingGross)
      : 0n;
    const share = target - allocated;
    if (specific || share > 0n) line.discount_amount = specific + Number(share);
    allocated = target;
  });
}

export const buildPosInvoiceSourceOrder = (
  order: PosInvoiceOrderRecord,
  businessDate: string,
  config: MeInvoiceStoreConfig | null,
  account: StoredMeInvoiceAccount | null,
  externalSourceAccountKey?: string | null,
): SourceOrderWrite => {
  const normalizedItems = normalizeItems(order, config);
  const totalAmount = number(order.totalAmount);
  const gross = normalizedItems.reduce((total, line) => total + (line.source_total_amount ?? 0), 0);
  const discount = number(order.discountAmount) ?? number(order.voucherDiscount)
    ?? (totalAmount === null ? 0 : gross - totalAmount);
  allocateDiscount(normalizedItems, gross, discount, freeVoucherDiscounts(order));
  const invoiceItems = normalizedItems.filter(
    invoiceLineShouldAppearInIssuedInvoice,
  );
  const calculation = calculateInvoice(invoiceItems, true, config?.option_user_defined ?? {
    amount_oc_decimal_digits: 0,
    unit_price_oc_decimal_digits: 0,
  });
  const paymentTime = text(order.paidAt);
  const taxMoney = calculation?.total_vat_amount ?? normalizedItems.reduce(
    (total, item) => total + (item.source_vat_amount ?? 0),
    0,
  );
  const paymentMethod = resolvePosOrderPaymentMethod(order);
  const mappedPaymentMethod = paymentMethod
    ? config?.payment_method_mapping[paymentMethod]
      ?? config?.default_payment_method_name
      ?? paymentMethod
    : config?.default_payment_method_name ?? null;
  const preflight = preflightInvoiceSourceOrder({
    lines: normalizedItems,
    calculation,
    payment_time: parseJoyworldDate(paymentTime),
    mapped_payment_method: mappedPaymentMethod,
    store_config_exists: Boolean(config),
    store_config_enabled: config?.enabled === true,
    price_includes_vat: true,
    inv_series: config?.inv_series ?? null,
    go_live_at: config?.go_live_at ?? null,
    account_exists: Boolean(account),
    account_enabled: account?.enabled === true,
    account_last_test_succeeded: account?.last_test_succeeded === true,
  });
  if (totalAmount === null || gross - discount !== totalAmount ||
      discount < 0 || discount > gross ||
      (calculation && calculation.total_amount !== totalAmount)) {
    preflight.issues.push({
      code: "JPOS_TOTAL_MISMATCH",
      path: "real_money",
      severity: "ERROR",
      message: "Tổng tiền trên hóa đơn không khớp số tiền đã thanh toán trên JPOS.",
    });
    preflight.issue_eligible = false;
    preflight.status = InvoicePreparationStatus.NEEDS_CORRECTION;
  }
  const rawOrder = safeRawOrder(order);
  const { hkOrderNumber: _hk, updatedAt: _updatedAt, status: _status, ...invoiceSnapshot } = rawOrder;

  return {
    source_order_id: order.localOrderId,
    source_payload_hash: createHash("sha256")
      .update(canonicalJson({ mapping: JPOS_INVOICE_MAPPING_VERSION, order: invoiceSnapshot }))
      .digest("hex"),
    raw_payload: { pos_order: rawOrder },
    projection: {
      warehouse_id: order.warehouseId,
      source_system: "JPOS",
      source_order_id: order.localOrderId,
      external_source_account_key:
        externalSourceAccountKey && text(order.hkOrderNumber)
          ? externalSourceAccountKey
          : null,
      external_order_number:
        externalSourceAccountKey && text(order.hkOrderNumber)
          ? text(order.hkOrderNumber)
          : null,
      local_order_id: order.localOrderId,
      hk_order_number: text(order.hkOrderNumber),
      pos_order_status: order.status,
      business_date: businessDate,
      source_create_time: text(order.createdAt),
      payment_time: paymentTime,
      source_action_time: parseJoyworldDate(paymentTime ?? order.createdAt),
      source_status: 3,
      order_number: order.localOrderId,
      customer_name: text(order.customerName),
      payment_method: paymentMethod,
      mapped_payment_method: mappedPaymentMethod,
      original_money: gross,
      system_money: gross,
      discount_money: discount,
      real_money: totalAmount,
      cancel_money: 0,
      tax_money: taxMoney,
      amount_before_tax:
        totalAmount === null ? null : totalAmount - taxMoney,
      item_count: normalizedItems.length,
      normalized_items: normalizedItems,
      calculation,
      preflight,
      mapping_version: JPOS_INVOICE_MAPPING_VERSION,
      calculation_version: INVOICE_CALCULATION_VERSION,
      customer_invoice_request_status: "AVAILABLE",
      customer_invoice_request_submitted_at: null,
    },
  };
};
