import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import test from "node:test";

import type { AuthorizationService } from "./authorization/index.js";

test("local cancellation with an HK reference records a single refund and protects queued invoices", {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST!, /^(?:127\.0\.0\.1|localhost):\d+$/);
  process.env.NODE_ENV = "test";
  const projectId = "demo-pos-local-cancel";
  process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 = Buffer.from(JSON.stringify({
    project_id: projectId,
    client_email: `test@${projectId}.iam.gserviceaccount.com`,
    private_key: generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    }).privateKey,
  })).toString("base64");
  const [{ db }, { cancelPosOrder, getPosOrderRefundPreview }] = await Promise.all([
    import("../config/firebase.js"),
    import("./posOrderService.js"),
  ]);
  const warehouseId = randomUUID();
  const localOrderId = randomUUID();
  const hkOrderNumber = randomUUID();
  const orderRef = db.collection("pos_orders").doc(localOrderId);
  const source = db.collection("invoice_source_orders").doc(randomUUID());
  const invoice = db.collection("invoice_documents").doc(source.id);
  await Promise.all([
    orderRef.set({
      localOrderId, warehouseId, hkOrderNumber, status: "SYNC_SUCCESS",
      paymentStatus: "PAID", totalAmount: 99_000, paymentMethodId: "CASH",
      version: 2, items: [], createdAt: "2026-11-20T00:00:00Z",
    }),
    source.set({ warehouse_id: warehouseId, order_number: hkOrderNumber, source_status: 3 }),
    invoice.set({ status: "QUEUED", active_issue_job_id: "active" }),
  ]);
  const authorization = {
    assert: (permission: string, scope: string) => {
      assert.equal(scope, warehouseId);
      assert.ok(["pos.orders.read", "pos.orders.cancel_local"].includes(permission));
    },
    can: (permission: string) => permission === "pos.orders.cancel_local",
  } as unknown as AuthorizationService;
  const request = {
    warehouseId, localOrderId, authorization, actorId: "manager", actorName: "Manager",
    value: {
      reason: "Khách yêu cầu hủy", action_time: new Date().toISOString(),
      expectedVersion: 2, refundConfirmed: true,
    },
  };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("External HTTP blocked"); };
  try {
    await assert.rejects(cancelPosOrder(request), { code: "INVOICE_LOCKED" });
    await invoice.update({ status: "READY_TO_ISSUE", active_issue_job_id: null });
    const preview = await getPosOrderRefundPreview(request);
    assert.equal(preview.mode, "LOCAL_ONLY");
    assert.equal(preview.amount, 99_000);
    await assert.rejects(cancelPosOrder({
      ...request, value: { ...request.value, refundConfirmed: false },
    }), { code: "REFUND_CONFIRMATION_REQUIRED" });
    await assert.rejects(cancelPosOrder({
      ...request, value: { ...request.value, expectedVersion: 1 },
    }), { code: "ORDER_VERSION_CONFLICT" });
    const results = await Promise.all([cancelPosOrder(request), cancelPosOrder(request)]);
    assert.equal(results.filter((result) => !result.idempotent).length, 1);
    assert.equal((await orderRef.get()).get("refundedAmount"), 99_000);
    assert.equal((await orderRef.get()).get("version"), 3);
    assert.equal((await source.get()).get("source_status"), 4);
    assert.equal((await invoice.get()).get("status"), "CANCELLED");
    const operation = await db.collection("pos_order_cancellations").doc(localOrderId).get();
    assert.equal(operation.get("status"), "SUCCEEDED");
    assert.equal(operation.get("biz_code"), null);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
