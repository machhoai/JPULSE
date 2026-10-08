import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import test from "node:test";

import { POS_CASH_DRAWER_SETTINGS_COLLECTION } from "@bduck/shared-types";

test("cash drawer transactions isolate devices, reject stale writes, audit and handle transfer", {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST!, /^(127\.0\.0\.1|localhost):\d+$/);
  // An ephemeral emulator-only identity: never load production credentials.
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 = Buffer.from(JSON.stringify({
    project_id: "bduck-cash-drawer-test", client_email: "test@bduck-cash-drawer-test.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
  })).toString("base64");
  const { db } = await import("../config/firebase.js");
  const { posCashDrawerSettingsRepository: repo } = await import("./posCashDrawerSettingsRepository.js");
  const deviceId = randomUUID();
  const otherId = randomUUID();
  await Promise.all([deviceId, otherId].map((id) => db.collection("pos_devices").doc(id).set({
    warehouse_id: "w1", status: "ACTIVE", is_deleted: false,
  })));
  const value = { auto_open_enabled: true, protocol: "TSPL" as const, pin: 2 as const, expected_version: 0, action_time: "2026-10-08T09:00:00.000Z" };
  const save = (id: string, expected: number, warehouseId = "w1") => repo.save({ deviceId: id, warehouseId, actorId: "u1", value: { ...value, expected_version: expected } });
  const first = await save(deviceId, 0);
  assert.equal(first.version, 1);
  const second = await repo.save({ deviceId: otherId, warehouseId: "w1", actorId: "u1", value: { ...value, auto_open_enabled: false, protocol: "ESCPOS" } });
  assert.equal(second.auto_open_enabled, false);
  assert.equal((await save(deviceId, 1)).version, 2);
  assert.equal((await repo.findByDevice(otherId, "w1"))?.version, 1);
  await assert.rejects(save(deviceId, 1));
  const audit = await db.collection("audit_logs").where("entity_id", "==", deviceId).get();
  assert.equal(audit.size, 2);
  const update = audit.docs.map((d) => d.data()).find((a) => a.old_value !== null)!;
  assert.equal(update.old_value.version, 1);
  assert.equal(update.new_value.version, 2);
  assert.equal(update.user_id, "u1");
  assert.equal(update.action_time.toDate().toISOString(), value.action_time);
  assert.ok(update.sync_time.toDate() instanceof Date);
  await db.collection("pos_devices").doc(deviceId).update({ status: "REVOKED" });
  await assert.rejects(save(deviceId, 2));
  await db.collection("pos_devices").doc(deviceId).update({ status: "ACTIVE", warehouse_id: "w2" });
  await assert.rejects(save(deviceId, 2));
  assert.equal(await repo.findByDevice(deviceId, "w2"), null);
  assert.equal((await save(deviceId, 0, "w2")).warehouse_id, "w2");
  assert.equal((await db.collection(POS_CASH_DRAWER_SETTINGS_COLLECTION).doc(deviceId).get()).data()?.version, 3);
});
