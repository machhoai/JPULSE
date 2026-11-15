import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import test from "node:test";
import { MeInvoiceSignType } from "@bduck/shared-types";

import type { AuthorizationService } from "./authorization/index.js";
import { meInvoiceStoreConfigInputSchema } from "./meInvoiceConfigSchemas.js";

test(
  "a verified store config can be enabled after removing or reordering payment mappings",
  { skip: !process.env.FIRESTORE_EMULATOR_HOST },
  async () => {
    assert.match(process.env.FIRESTORE_EMULATOR_HOST!, /^(127\.0\.0\.1|localhost):\d+$/);
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.NODE_ENV = "test";
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 = Buffer.from(
      JSON.stringify({
        project_id: "demo-meinvoice-store-config",
        client_email: "test@demo-meinvoice-store-config.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
      }),
    ).toString("base64");

    const [{ db }, { saveMeInvoiceStoreConfig, markMeInvoiceStoreConfigValidated }] =
      await Promise.all([
        import("../config/firebase.js"),
        import("./meInvoiceStoreConfigService.js"),
      ]);
    const warehouseId = randomUUID();
    const accountId = randomUUID();
    await db.collection("warehouses").doc(warehouseId).set({ is_deleted: false });
    await db.collection("meinvoice_accounts").doc(accountId).set({ enabled: true });

    const authorization = {
      assert: (permission: string, scope: string) => {
        assert.equal(permission, "invoices.config");
        assert.equal(scope, warehouseId);
      },
    } as unknown as AuthorizationService;
    const draft = meInvoiceStoreConfigInputSchema.parse({
      meinvoice_account_id: accountId,
      inv_series: "1C26MYY",
      invoice_with_code: true,
      sign_type: MeInvoiceSignType.CALCULATING_MACHINE,
      seller_shop_code: "SHOP-1",
      seller_shop_name: "Shop 1",
      tax_rate_source: "SOURCE",
      go_live_at: "2026-01-01T00:00:00Z",
      payment_method_mapping: {
        cash: "Tiền mặt",
        transfer: "Chuyển khoản",
        card: "Thẻ",
      },
    });
    const save = (input: typeof draft) =>
      saveMeInvoiceStoreConfig(warehouseId, input, "test-user", authorization);

    await save(draft);
    const saved = await save({
      ...draft,
      payment_method_mapping: { cash: "Tiền mặt", transfer: "Chuyển khoản" },
    });
    assert.deepEqual(saved.payment_method_mapping, {
      cash: "Tiền mặt",
      transfer: "Chuyển khoản",
    });

    const activation = {
      ...draft,
      enabled: true,
      payment_method_mapping: Object.fromEntries(
        Object.entries(saved.payment_method_mapping).reverse(),
      ),
    };
    const requiresValidation = { statusCode: 400, code: "STORE_CONFIG_VALIDATION_REQUIRED" };
    await assert.rejects(save(activation), requiresValidation);
    await markMeInvoiceStoreConfigValidated(warehouseId, null);
    await assert.rejects(
      save({ ...activation, inv_series: "1C26MZZ" }),
      requiresValidation,
    );
    const enabled = await save(activation);
    assert.equal(enabled.enabled, true);
    assert.ok(enabled.validated_at);
  },
);
