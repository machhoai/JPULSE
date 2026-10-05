import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCompanyHolidayDates,
  companyHolidaySchema,
} from "./companyHolidayRange.js";

test("holiday ranges include all consecutive dates across months, years and leap days", () => {
  assert.deepEqual(buildCompanyHolidayDates("2026-09-02"), ["2026-09-02"]);
  assert.deepEqual(buildCompanyHolidayDates("2026-12-30", "2027-01-02"), [
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
  ]);
  assert.deepEqual(buildCompanyHolidayDates("2028-02-28", "2028-03-01"), [
    "2028-02-28",
    "2028-02-29",
    "2028-03-01",
  ]);
});

test("holiday API rejects inverted, invalid and oversized ranges before saving", () => {
  const input = {
    holiday_date: "2026-09-02",
    name: { vi: "Quốc khánh", zh: "国庆节" },
    action_time: new Date(),
  };
  assert.equal(companyHolidaySchema.safeParse(input).success, true);
  assert.equal(
    companyHolidaySchema.safeParse({ ...input, holiday_end_date: "2026-09-01" })
      .success,
    false,
  );
  assert.equal(
    companyHolidaySchema.safeParse({ ...input, holiday_end_date: "2026-02-30" })
      .success,
    false,
  );
  assert.equal(
    companyHolidaySchema.safeParse({ ...input, holiday_end_date: "2027-09-03" })
      .success,
    false,
  );
  assert.equal(
    buildCompanyHolidayDates("2028-01-01", "2028-12-31").length,
    366,
  );
});
