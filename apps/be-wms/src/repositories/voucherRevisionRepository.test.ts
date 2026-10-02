import assert from "node:assert/strict";
import test from "node:test";

import type { ApprovalRecord } from "@bduck/shared-types";

import { commitRejectedRevision, type RejectedRevisionWrite } from "./voucherRevisionRepository.js";

function fixture(status = "REJECTED", creator = "creator", attempt = 1) {
  const writes: Array<{ path: string; values: Record<string, unknown> }> = [];
  const stored = { status, creator_id: creator, warehouse_id: "warehouse", is_deleted: false };
  function ref(path: string) {
    return { path, id: path.split("/").at(-1), doc: (id = "audit") => ref(`${path}/${id}`),
      collection: (name: string) => ref(`${path}/${name}`), where: () => ref(path) };
  }
  const database = {
    collection: ref,
    runTransaction: async (callback: (transaction: unknown) => Promise<void>) => {
      const staged: typeof writes = [];
      const transaction = {
        get: async (target: { path: string }) => {
          if (target.path === "export_vouchers/voucher") return { exists: true, data: () => stored };
          if (target.path.endsWith("/items")) return { docs: [
            { ref: ref("export_vouchers/voucher/items/old"), data: () => ({ is_deleted: false }) },
          ] };
          return { docs: [
            { ref: ref("pending_approvals/approved"), data: () => ({ status: "APPROVED", approval_attempt: attempt }) },
            { ref: ref("pending_approvals/rejected"), data: () => ({ status: "REJECTED", approval_attempt: attempt }) },
          ] };
        },
        update: (target: { path: string }, values: Record<string, unknown>) => staged.push({ path: target.path, values }),
        set: (target: { path: string }, values: Record<string, unknown>) => {
          assert.ok(Object.values(values).every(value => value !== undefined), "Firestore rejects undefined fields");
          staged.push({ path: target.path, values });
        },
      };
      await callback(transaction);
      writes.push(...staged);
    },
  };
  return { database: database as unknown as Parameters<typeof commitRejectedRevision>[1], writes };
}

function revision(): RejectedRevisionWrite {
  const time = new Date();
  return {
    collection: "export_vouchers", id: "voucher", creatorId: "creator",
    oldValues: { warehouse_id: "warehouse" },
    values: { status: "PENDING_APPROVAL", action_time: time, sync_time: time },
    items: [{ id: "new", product_id: "product", quantity: 3 }],
    approvals: [{ id: "attempt-2", approval_attempt: 2, status: "PENDING", creator_name: undefined } as ApprovalRecord],
    audit: { user_id: "creator", action_time: time, sync_time: time },
  };
}

test("resubmission atomically replaces items, creates a new approval attempt and writes audit", async () => {
  const { database, writes } = fixture();
  await commitRejectedRevision(revision(), database);
  assert.equal(writes.find(w => w.path === "export_vouchers/voucher")?.values.status, "PENDING_APPROVAL");
  assert.equal(writes.find(w => w.path.endsWith("items/old"))?.values.is_deleted, true);
  assert.equal(writes.find(w => w.path.endsWith("items/new"))?.values.quantity, 3);
  assert.equal(writes.find(w => w.path === "pending_approvals/attempt-2")?.values.status, "PENDING");
  assert.equal(writes.filter(w => w.path.includes("approved") || w.path.includes("rejected")).length, 0);
  assert.equal(writes.find(w => w.path.startsWith("audit_logs/"))?.values.user_id, "creator");
});

test("double submission, changed creator and stale approval attempts commit nothing", async () => {
  for (const args of [["PENDING_APPROVAL", "creator", 1], ["REJECTED", "other", 1], ["REJECTED", "creator", 2]] as const) {
    const { database, writes } = fixture(args[0], args[1], args[2]);
    await assert.rejects(commitRejectedRevision(revision(), database));
    assert.equal(writes.length, 0);
  }
});
