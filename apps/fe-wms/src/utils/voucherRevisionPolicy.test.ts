import assert from "node:assert/strict";
import test from "node:test";

import { canReviseRejectedVoucher } from "./voucherRevisionPolicy";

const voucher = { id: "voucher", status: "REJECTED", creator_id: "creator", warehouse_id: "source", source_warehouse_id: "source" };

test("revision requires rejected status, creator ownership and write access to the correct facility", () => {
  for (const type of ["IMPORT", "EXPORT", "TRANSFER"] as const) {
    const permission = type === "TRANSFER" ? "transfers.write" : "vouchers.write";
    const access = (action: string, warehouse?: string) => action === permission && warehouse === "source";
    assert.equal(canReviseRejectedVoucher(type, voucher, "creator", access), true);
    assert.equal(canReviseRejectedVoucher(type, voucher, "other", access), false);
    assert.equal(canReviseRejectedVoucher(type, voucher, undefined, access), false);
    assert.equal(canReviseRejectedVoucher(type, voucher, "creator", () => false), false);
    for (const status of ["PENDING_APPROVAL", "APPROVED", "COMPLETED", "CANCELLED"]) {
      assert.equal(canReviseRejectedVoucher(type, { ...voucher, status }, "creator", access), false);
    }
  }
});

test("destination-only transfer permissions cannot edit a rejected source order", () => {
  assert.equal(canReviseRejectedVoucher("TRANSFER", voucher, "creator", (_, warehouse) => warehouse === "destination"), false);
});

test("linked external queue exports also require queue management permission", () => {
  const linked = { ...voucher, reference_type: "EXTERNAL_QUEUE_BATCH" };
  assert.equal(canReviseRejectedVoucher("EXPORT", linked, "creator", action => action === "vouchers.write"), false);
  assert.equal(canReviseRejectedVoucher("EXPORT", linked, "creator", () => true), true);
});
