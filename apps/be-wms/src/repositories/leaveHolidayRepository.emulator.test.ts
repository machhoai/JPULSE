import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

test(
  "holiday ranges save atomically, reject overlapping ranges and restore deleted dates",
  {
    skip: !process.env.FIRESTORE_EMULATOR_HOST,
  },
  async () => {
    // Use an isolated emulator project and disposable credential, never live data.
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 = Buffer.from(
      JSON.stringify({
        project_id: "demo-holidays",
        client_email: "test@demo-holidays.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
      }),
    ).toString("base64");
    const { db } = await import("../config/firebase.js");
    const {
      upsertCompanyHoliday,
      softDeleteCompanyHoliday,
      findCompanyHolidays,
    } = await import("./leaveHolidayRepository.js");
    const input = {
      holiday_date: "2095-12-30",
      holiday_end_date: "2096-01-02",
      name: { vi: "Tết", zh: "新年" },
      action_time: new Date(),
    };
    try {
      const created = await upsertCompanyHoliday(input, "actor-a");
      assert.deepEqual(
        created.map((result) => result.holiday.holiday_date),
        ["2095-12-30", "2095-12-31", "2096-01-01", "2096-01-02"],
      );
      await assert.rejects(
        upsertCompanyHoliday(
          { ...input, holiday_date: "2095-12-29" },
          "actor-b",
        ),
        (error: { statusCode?: number }) => error.statusCode === 409,
      );
      assert.equal(
        (await db.collection("company_holidays").doc("2095-12-29").get())
          .exists,
        false,
      );
      await softDeleteCompanyHoliday("2095-12-31", "actor-a", new Date());
      assert.equal(
        (await findCompanyHolidays("2095-12-30", "2096-01-02")).length,
        3,
      );
      const restored = await upsertCompanyHoliday(
        { ...input, holiday_date: "2095-12-31", holiday_end_date: undefined },
        "actor-b",
      );
      assert.equal(restored[0].holiday.is_deleted, false);
      assert.equal(restored[0].holiday.created_by, "actor-a");
      assert.equal(restored[0].holiday.updated_by, "actor-b");
      const concurrent = await Promise.allSettled([
        upsertCompanyHoliday(
          {
            ...input,
            holiday_date: "2096-01-03",
            holiday_end_date: "2096-01-04",
          },
          "actor-a",
        ),
        upsertCompanyHoliday(
          {
            ...input,
            holiday_date: "2096-01-04",
            holiday_end_date: "2096-01-05",
          },
          "actor-b",
        ),
      ]);
      assert.equal(
        concurrent.filter((result) => result.status === "fulfilled").length,
        1,
      );
      assert.equal(
        (await findCompanyHolidays("2096-01-03", "2096-01-05")).length,
        2,
      );
    } finally {
      const snapshot = await db.collection("company_holidays").get();
      await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
    }
  },
);
