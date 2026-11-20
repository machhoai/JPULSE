import assert from "node:assert/strict";
import test from "node:test";

import {
  posCatalogGoodsIdSchema,
  posVietnamProductSettingsSchema,
} from "./posVietnamProductSettingsSchema.js";

const draft = {
  expected_version: 0,
  selling_price_vnd: null,
  vat_rate: null,
  effective_date: null,
  import_from_hk: true,
  send_sale_to_hk: false,
};

test("allows independent HK settings before a price has been configured", () => {
  assert.deepEqual(posVietnamProductSettingsSchema.parse(draft), draft);
});

test("accepts whole VND amounts with a separate Vietnam VAT category and date", () => {
  const complete = { ...draft, selling_price_vnd: 0, vat_rate: "KCT", effective_date: "2028-02-29" };
  assert.deepEqual(posVietnamProductSettingsSchema.parse(complete), complete);
  for (const update of [
    { selling_price_vnd: 100.5 },
    { selling_price_vnd: -1 },
    { vat_rate: "16%" },
    { vat_rate: null },
    { effective_date: "2027-02-29" },
    { effective_date: null },
    { expected_version: -1 },
    { hk_price: 300 },
  ]) {
    assert.equal(posVietnamProductSettingsSchema.safeParse({ ...complete, ...update }).success, false);
  }
  assert.equal(posVietnamProductSettingsSchema.safeParse({ ...draft, vat_rate: "8%" }).success, false);
});

test("rejects SKU values that are not a single Firestore document ID", () => {
  for (const id of ["", ".", "..", "one/two"]) {
    assert.equal(posCatalogGoodsIdSchema.safeParse(id).success, false);
  }
  assert.equal(posCatalogGoodsIdSchema.parse("VE-01"), "VE-01");
});
