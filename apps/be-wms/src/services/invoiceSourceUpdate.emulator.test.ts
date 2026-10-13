import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  InvoiceDocumentStatus,
  InvoicePreparationStatus,
  type InvoiceSourceOrderLine,
  type MeInvoiceStoreConfig,
} from "@bduck/shared-types";

import type { StoredMeInvoiceAccount } from "../repositories/meInvoiceConfigRepository.js";

import type { AuthorizationService } from "./authorization/index.js";
import { calculateInvoice } from "./invoiceCalculationService.js";
import { buildInitialInvoiceDocument } from "./invoiceDocumentDraftBuilder.js";
import { invoiceSourceProjectionHash } from "./invoiceDocumentPolicy.js";
import { invoiceDocumentBulkRebaseSchema } from "./invoiceDocumentSchemas.js";

test(
  "source update preserves buyers, reviews material changes in bulk and rejects stale confirmations",
  {
    skip: !process.env.FIRESTORE_EMULATOR_HOST,
  },
  async () => {
    assert.match(
      process.env.FIRESTORE_EMULATOR_HOST!,
      /^(127\.0\.0\.1|localhost):\d+$/,
    );
    // This integration test can only use a local emulator with dummy credentials.
    process.env.NODE_ENV = "test";
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 = Buffer.from(
      JSON.stringify({
        project_id: "demo-invoice-source-update",
        client_email: "test@demo-invoice-source-update.iam.gserviceaccount.com",
        private_key: generateKeyPairSync("rsa", {
          modulusLength: 2048,
          privateKeyEncoding: { type: "pkcs8", format: "pem" },
          publicKeyEncoding: { type: "spki", format: "pem" },
        }).privateKey,
      }),
    ).toString("base64");
    const [{ db }, service, { invoiceDocumentRepository }] = await Promise.all([
      import("../config/firebase.js"),
      import("./invoiceDocumentService.js"),
      import("../repositories/invoiceDocumentRepository.js"),
    ]);
    const warehouseId = `source-update-${Date.now()}`;
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
    const config = {
      id: warehouseId,
      warehouse_id: warehouseId,
      meinvoice_account_id: warehouseId,
      default_buyer_name: "Khách lẻ",
      default_buyer_address: "",
      default_payment_method_name: "TM/CK",
      price_includes_vat: true,
      enabled: true,
      is_deleted: false,
      option_user_defined: option,
      go_live_at: new Date("2026-01-01T00:00:00Z"),
      created_at: new Date(),
      updated_at: new Date(),
    } as unknown as MeInvoiceStoreConfig;
    const account = {
      id: warehouseId,
      legal_entity_id: warehouseId,
      enabled: true,
      is_deleted: false,
    } as StoredMeInvoiceAccount;
    const buyer = {
      full_name: "READY CARE",
      legal_name: "READY CARE",
      tax_code: "0317981545",
      address: "TP Hồ Chí Minh",
      phone_number: "",
      email: "buyer@example.com",
    };
    const authorization = {
      assert: (_action: string, scope: string) =>
        assert.equal(scope, warehouseId),
    } as unknown as AuthorizationService;
    await db.collection("meinvoice_store_configs").doc(warehouseId).set(config);
    await db.collection("meinvoice_accounts").doc(warehouseId).set(account);
    const line: InvoiceSourceOrderLine = {
      line_number: 1,
      source_item_id: "sku",
      item_code: "sku",
      item_name: "Thẻ thành viên Bạc",
      category_code: null,
      category_name: null,
      unit_name: "Cái",
      quantity: 1,
      unit_price: 500000,
      discount_rate: null,
      discount_amount: null,
      vat_rate_name: "10%",
      vat_rate: 10,
      source_amount_without_vat: 454545,
      source_vat_amount: 45455,
      source_total_amount: 500000,
    };
    const id = createHash("sha256")
      .update(`${warehouseId}:first`)
      .digest("hex");
    const source = (items = [line], hash = "b".repeat(64)) => ({
      id,
      warehouse_id: warehouseId,
      source_order_id: "ORD-1",
      order_number: "HK-1",
      source_system: "JPOS",
      business_date: "2026-10-12",
      invoice_document_id: id,
      source_payload_hash: hash,
      payment_time: "2026-10-12 19:57:29",
      normalized_items: items,
      mapped_payment_method: "TM/CK",
      source_action_time: new Date("2026-10-12T12:57:29Z"),
      calculation: calculateInvoice(items, true, option),
      mapping_version: "v1",
      calculation_version: "v1",
      preflight: {
        status: InvoicePreparationStatus.READY_TO_ISSUE,
        issue_eligible: true,
        issues: [],
      },
      is_deleted: false,
    });
    const original = source();
    const document = {
      ...buildInitialInvoiceDocument(original, config, account, "system"),
      buyer,
      edited_by: "public-customer",
      edited_at: new Date(),
      revision: 3,
      ref_id: "old-preview",
      prepared_payload_hash: "old-preview-hash",
    };
    await db.collection("invoice_documents").doc(id).set(document);
    const enriched = source(
      [
        {
          ...line,
          category_code: "1",
          category_name: "Hàng hóa ảo",
          discount_amount: 0,
          source_amount_without_vat: 454545.45,
          source_vat_amount: 45454.55,
        },
      ],
      "c".repeat(64),
    );
    await db.collection("invoice_source_orders").doc(id).set(enriched);
    const result = await service.prepareInvoiceDocumentFromSourceOrder(
      id,
      warehouseId,
      enriched.source_payload_hash,
      "system",
      authorization,
      undefined,
      { safeAutoRebase: true },
    );
    assert.deepEqual(result.buyer, buyer);
    assert.equal(result.revision, 4);
    assert.equal(result.ref_id, null);
    assert.equal(result.prepared_payload_hash, null);
    assert.equal(
      (await db.collection("invoice_source_orders").doc(id).get()).data()
        ?.invoice_document_stale,
      false,
    );
    assert.deepEqual(
      await service.listInvoiceDraftSourceChanges(
        warehouseId,
        "2026-10-12",
        authorization,
      ),
      [],
    );

    const material = source(
      [{ ...line, unit_price: 600000, source_total_amount: 600000 }],
      "d".repeat(64),
    );
    await db.collection("invoice_source_orders").doc(id).set(material);
    await assert.rejects(
      service.prepareInvoiceDocumentFromSourceOrder(
        id,
        warehouseId,
        material.source_payload_hash,
        "system",
        authorization,
        undefined,
        { safeAutoRebase: true },
      ),
      (error: unknown) =>
        (error as { data: { code: string } }).data.code ===
        "INVOICE_AUTO_REBASE_REQUIRES_REVIEW",
    );
    assert.equal(
      (await db.collection("invoice_documents").doc(id).get()).data()?.revision,
      4,
    );
    const reviews = await service.listInvoiceDraftSourceChanges(
      warehouseId,
      "2026-10-12",
      authorization,
    );
    assert.equal(reviews.length, 1);
    assert.equal(reviews[0].before.total_amount, 500000);
    assert.equal(reviews[0].after.total_amount, 600000);
    const input = invoiceDocumentBulkRebaseSchema.parse({
      warehouse_id: warehouseId,
      business_date: "2026-10-12",
      selection_mode: "SELECTED",
      source_order_ids: [id],
      confirmations: reviews,
    });
    // A buyer submission during review must not be overwritten.
    await db
      .collection("invoice_documents")
      .doc(id)
      .update({ revision: 5, buyer: { ...buyer, full_name: "New buyer" } });
    const conflict = await service.bulkRebaseInvoiceDocuments(
      input,
      "system",
      authorization,
    );
    assert.equal(conflict.rebased_count, 0);
    assert.equal(conflict.items[0].code, "INVOICE_REVISION_CONFLICT");
    const secondId = createHash("sha256")
      .update(`${warehouseId}:second`)
      .digest("hex");
    const secondSource = {
      ...material,
      id: secondId,
      source_order_id: "ORD-2",
      invoice_document_id: secondId,
    };
    const secondOriginal = {
      ...original,
      id: secondId,
      source_order_id: "ORD-2",
      invoice_document_id: secondId,
    };
    await db
      .collection("invoice_source_orders")
      .doc(secondId)
      .set(secondSource);
    await db
      .collection("invoice_documents")
      .doc(secondId)
      .set({
        ...buildInitialInvoiceDocument(
          secondOriginal,
          config,
          account,
          "system",
        ),
        buyer,
        edited_by: "public-customer",
        edited_at: new Date(),
      });
    const freshReviews = await service.listInvoiceDraftSourceChanges(
      warehouseId,
      "2026-10-12",
      authorization,
    );
    const freshInput = invoiceDocumentBulkRebaseSchema.parse({
      ...input,
      source_order_ids: freshReviews.map(
        (item) => item.source_order_document_id,
      ),
      confirmations: freshReviews,
    });
    const confirmed = await service.bulkRebaseInvoiceDocuments(
      freshInput,
      "system",
      authorization,
    );
    assert.equal(confirmed.rebased_count, 2);
    assert.deepEqual(
      (await db.collection("invoice_documents").doc(secondId).get()).data()
        ?.buyer,
      buyer,
    );
    const confirmedDocument = (
      await db.collection("invoice_documents").doc(id).get()
    ).data()!;
    assert.equal(
      (confirmedDocument.buyer as typeof buyer).full_name,
      "New buyer",
    );
    assert.equal(confirmedDocument.revision, 6);

    // Same payload hash, changed financial projection: reject a previously viewed snapshot.
    const changedAgain = source(
      [{ ...line, unit_price: 700000 }],
      material.source_payload_hash,
    );
    await db.collection("invoice_source_orders").doc(id).set(changedAgain);
    const staleReviews = await service.listInvoiceDraftSourceChanges(
      warehouseId,
      "2026-10-12",
      authorization,
    );
    const later = source(
      [{ ...line, unit_price: 800000 }],
      material.source_payload_hash,
    );
    await db.collection("invoice_source_orders").doc(id).set(later);
    const stale = await service.bulkRebaseInvoiceDocuments(
      invoiceDocumentBulkRebaseSchema.parse({
        ...input,
        confirmations: staleReviews,
      }),
      "system",
      authorization,
    );
    assert.equal(stale.rebased_count, 0);
    assert.equal(stale.items[0].code, "INVOICE_SOURCE_STALE");
    await assert.rejects(
      invoiceDocumentRepository.rebaseDraft(
        id,
        warehouseId,
        6,
        InvoiceDocumentStatus.READY_TO_ISSUE,
        later.source_payload_hash,
        { revision: 7 },
        invoiceSourceProjectionHash(changedAgain),
      ),
      (error: unknown) =>
        (error as { data: { code: string } }).data.code ===
        "INVOICE_SOURCE_STALE",
    );
    // No active/issued invoice can be changed by bulk source confirmation.
    await db
      .collection("invoice_documents")
      .doc(id)
      .update({ active_issue_job_id: "job-in-progress" });
    await assert.rejects(
      invoiceDocumentRepository.rebaseDraft(
        id,
        warehouseId,
        6,
        InvoiceDocumentStatus.READY_TO_ISSUE,
        later.source_payload_hash,
        { revision: 7 },
        invoiceSourceProjectionHash(later),
      ),
      (error: unknown) =>
        (error as { data: { code: string } }).data.code ===
        "INVOICE_STATUS_CONFLICT",
    );
    await db
      .collection("invoice_documents")
      .doc(id)
      .update({ status: InvoiceDocumentStatus.ISSUED });
    assert.deepEqual(
      await service.listInvoiceDraftSourceChanges(
        warehouseId,
        "2026-10-12",
        authorization,
      ),
      [],
    );
    const issued = await service.bulkRebaseInvoiceDocuments(
      invoiceDocumentBulkRebaseSchema.parse({
        ...input,
        confirmations: staleReviews,
      }),
      "system",
      authorization,
    );
    assert.equal(issued.rebased_count, 0);
    assert.equal(
      (await db.collection("invoice_documents").doc(id).get()).data()?.revision,
      6,
    );
  },
);
