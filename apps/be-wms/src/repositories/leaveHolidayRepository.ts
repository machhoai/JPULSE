import type {
  CompanyHoliday,
  UpsertCompanyHolidayInput,
} from "@bduck/shared-types";

import { db } from "../config/firebase.js";
import { buildCompanyHolidayDates } from "../services/companyHolidayRange.js";

const COLLECTION = "company_holidays";

const withId = (
  document: FirebaseFirestore.DocumentSnapshot,
): CompanyHoliday => ({
  id: document.id,
  ...(document.data() as Omit<CompanyHoliday, "id">),
});

export const findCompanyHolidays = async (
  startDate: string,
  endDate: string,
): Promise<CompanyHoliday[]> => {
  const snapshot = await db
    .collection(COLLECTION)
    .where("holiday_date", ">=", startDate)
    .where("holiday_date", "<=", endDate)
    .get();
  return snapshot.docs
    .map(withId)
    .filter((holiday) => !holiday.is_deleted)
    .sort((left, right) => left.holiday_date.localeCompare(right.holiday_date));
};

export const findCompanyHolidayById = async (
  holidayId: string,
): Promise<CompanyHoliday | null> => {
  const snapshot = await db.collection(COLLECTION).doc(holidayId).get();
  return snapshot.exists ? withId(snapshot) : null;
};

export const upsertCompanyHoliday = async (
  input: UpsertCompanyHolidayInput,
  actorId: string,
): Promise<
  {
    previous: CompanyHoliday | null;
    holiday: CompanyHoliday;
  }[]
> =>
  db.runTransaction(async (transaction) => {
    const dates = buildCompanyHolidayDates(
      input.holiday_date,
      input.holiday_end_date,
    );
    const references = dates.map((date) => db.collection(COLLECTION).doc(date));
    // Read the entire range before writing: a duplicate rejects all days.
    const snapshots = await transaction.getAll(...references);
    const duplicate = snapshots.find(
      (snapshot) => snapshot.exists && !snapshot.data()?.is_deleted,
    );
    if (duplicate) {
      throw {
        statusCode: 409,
        messages: {
          vi: `Ngày ${duplicate.id} đã được cấu hình là ngày lễ. Chưa lưu dải ngày đã chọn.`,
          zh: `日期 ${duplicate.id} 已配置为节假日。所选日期范围尚未保存。`,
        },
      };
    }
    const now = new Date();
    return snapshots.map((snapshot, index) => {
      const reference = references[index];
      const previous = snapshot.exists ? withId(snapshot) : null;
      const holiday: CompanyHoliday = {
        id: reference.id,
        holiday_date: dates[index],
        name: input.name,
        created_by: previous?.created_by ?? actorId,
        updated_by: actorId,
        is_deleted: false,
        created_at: previous?.created_at ?? now,
        updated_at: now,
        action_time: input.action_time,
        sync_time: now,
      };
      transaction.set(reference, holiday);
      return { previous, holiday };
    });
  });

export const softDeleteCompanyHoliday = async (
  holidayId: string,
  actorId: string,
  actionTime: Date,
): Promise<{ previous: CompanyHoliday; holiday: CompanyHoliday }> =>
  db.runTransaction(async (transaction) => {
    const reference = db.collection(COLLECTION).doc(holidayId);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw {
        statusCode: 404,
        messages: {
          vi: "Không tìm thấy ngày lễ.",
          zh: "未找到节假日。",
        },
      };
    }
    const previous = withId(snapshot);
    if (previous.is_deleted) return { previous, holiday: previous };
    const now = new Date();
    const holiday: CompanyHoliday = {
      ...previous,
      is_deleted: true,
      updated_by: actorId,
      updated_at: now,
      action_time: actionTime,
      sync_time: now,
    };
    transaction.set(reference, holiday);
    return { previous, holiday };
  });
