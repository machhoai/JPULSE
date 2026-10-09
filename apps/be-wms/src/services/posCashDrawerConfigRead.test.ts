import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

import { readCashDrawerConfigSafely } from "./posCashDrawerConfigRead.js";

function sessionHarness(failDrawer: boolean) {
  const reads = { count: 0 };
  const payment = { version: 5, deviceId: "d1", warehouseId: "w1", enabled: true, bankBin: "970000", accountNumber: "TEST000", accountName: "QA" };
  const drawer = { id: "d1", device_id: "d1", warehouse_id: "w1", version: 2, auto_open_enabled: true, protocol: "TSPL", pin: 2, is_deleted: false };
  const repos = {
    "../repositories/posDeviceRepository.js": { posDeviceRepository: { findById: async () => ({ id: "d1", warehouse_id: "w1", status: "ACTIVE", is_deleted: false, credential_hash: createHash("sha256").update("test-credential").digest("hex") }) } },
    "../repositories/posCashDrawerSettingsRepository.js": { posCashDrawerSettingsRepository: { findByDevice: async () => { reads.count += 1; if (failDrawer) throw new Error("drawer read unavailable"); return drawer; } } },
    "../repositories/posReceiptSettingsRepository.js": { posReceiptSettingsRepository: { findByWarehouse: async () => ({ version: 3 }) } },
    "../repositories/posTicketSettingsRepository.js": { posTicketSettingsRepository: { findByWarehouse: async () => ({ version: 4 }) } },
    "../repositories/posPaymentSettingsRepository.js": { posPaymentSettingsRepository: { findByDevice: async () => payment } },
    "../repositories/posCustomerDisplayRepository.js": { posCustomerDisplayRepository: { findSettings: async () => null } },
    "./posCashDrawerConfigRead.js": { readCashDrawerConfigSafely },
    "./posCustomerDisplayService.js": { getPosCustomerDisplaySettingsView: async () => null },
    "./posDeviceService.js": { PosDeviceError: Error },
    "./posSettingsLogoStorageService.js": { toDevicePosSettings: (_kind: string, value: unknown) => value },
    crypto: { createHash, timingSafeEqual: (a: Buffer, b: Buffer) => a.equals(b) },
  };
  const js = ts.transpileModule(readFileSync(new URL("./posDeviceSessionService.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: Record<string, (input: unknown) => Promise<Record<string, unknown>>> = {};
  new Function("require", "exports", js)((name: keyof typeof repos) => { assert.ok(repos[name], `Unexpected dependency ${name}`); return repos[name]; }, exports);
  return { sync: exports.syncPosDeviceConfig!, payment, reads };
}

test("drawer database failure never rejects or changes the existing QR/payment config response", async () => {
  const { sync, payment } = sessionHarness(true);
  const result = await sync({ deviceId: "d1", credential: "test-credential", knownVersions: { receipt_settings: 3, ticket_settings: 4, payment_settings: 1, customer_display_settings: null, cash_drawer_settings: 7 } });
  assert.deepEqual(result.payment_settings, payment);
  assert.equal((result.changed as Record<string, boolean>).payment_settings, true);
  assert.equal((result.versions as Record<string, number>).payment_settings, 5);
  assert.equal((result.versions as Record<string, number>).cash_drawer_settings, 7);
  assert.equal((result.changed as Record<string, boolean>).cash_drawer_settings, false);
});

test("old clients without a drawer version retain unchanged payment settings", async () => {
  const { sync, reads } = sessionHarness(false);
  const result = await sync({ deviceId: "d1", credential: "test-credential", knownVersions: { receipt_settings: 3, ticket_settings: 4, payment_settings: 5, customer_display_settings: null } });
  assert.equal(result.payment_settings, null);
  assert.equal((result.changed as Record<string, boolean>).payment_settings, false);
  assert.equal((result.changed as Record<string, boolean>).cash_drawer_settings, false);
  assert.equal(reads.count, 0);
});

test("only clients opting into the drawer field perform the optional drawer read", async () => {
  const { sync, reads } = sessionHarness(false);
  const result = await sync({ deviceId: "d1", credential: "test-credential", knownVersions: { receipt_settings: 3, ticket_settings: 4, payment_settings: 5, customer_display_settings: null, cash_drawer_settings: null } });
  assert.equal(reads.count, 1);
  assert.equal((result.changed as Record<string, boolean>).cash_drawer_settings, true);
  assert.equal((result.changed as Record<string, boolean>).payment_settings, false);
  assert.equal(result.payment_settings, null);
});
