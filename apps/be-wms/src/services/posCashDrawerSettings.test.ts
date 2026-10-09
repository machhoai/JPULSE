import assert from "node:assert/strict";
import { test } from "node:test";

import type { PosDevice } from "@bduck/shared-types";
import { PERMISSION_REGISTRY } from "@bduck/shared-types";

import type { AuthorizationService } from "./authorization/index.js";
import { assertCashDrawerDeviceAccess } from "./posCashDrawerAccessPolicy.js";
import {
  posCashDrawerSettingsSchema,
  assertCashDrawerVersion,
} from "./posCashDrawerSchemas.js";

const value = {
  auto_open_enabled: true,
  protocol: "ESCPOS" as const,
  pin: 5 as const,
  expected_version: 0,
  action_time: "2026-10-08T08:00:00.000Z",
};

test("cash drawer permission is grantable in the POS registry", () => {
  const permission = PERMISSION_REGISTRY.find(
    (p) => p.key === "pos.cash_drawer.open",
  );
  assert.equal(permission?.group, "pos");
  assert.ok(permission?.label.vi && permission.label.zh);
});

test("cash drawer validates pin, protocol, version and local audit timestamp", () => {
  assert.ok(posCashDrawerSettingsSchema.safeParse(value).success);
  assert.ok(
    posCashDrawerSettingsSchema.safeParse({
      ...value,
      protocol: "TSPL",
      pin: 2,
    }).success,
  );
  for (const invalid of [
    { pin: 3 },
    { protocol: "TSPL" },
    { protocol: "ZPL" },
    { expected_version: -1 },
    { action_time: "bad" },
    { device_id: "inject" },
  ]) {
    assert.equal(
      posCashDrawerSettingsSchema.safeParse({ ...value, ...invalid }).success,
      false,
    );
  }
  assert.doesNotThrow(() => assertCashDrawerVersion(2, 2));
  assert.throws(() => assertCashDrawerVersion(2, 1));
});

test("saving checks settings.manage in the target device's warehouse", () => {
  const device = ({ id: "d1", warehouse_id: "store-b", is_deleted: false }) as PosDevice;
  const scopes: string[] = [];
  const authorization = {
    assert(permission: string, warehouseId: string) {
      assert.equal(permission, "pos.settings.manage");
      scopes.push(warehouseId);
      throw new Error("FORBIDDEN");
    },
  } as unknown as AuthorizationService;
  assert.throws(() => assertCashDrawerDeviceAccess(device, authorization, "pos.settings.manage"), /FORBIDDEN/);
  assert.deepEqual(scopes, ["store-b"]);
  assert.throws(() => assertCashDrawerDeviceAccess(null, authorization, "pos.settings.manage"));
});
