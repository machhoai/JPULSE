import { z } from "zod";

const text = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => !/\$(where|ne|gt|lt)\b/i.test(value));

export function buildCompanyHolidayDates(start: string, end = start): string[] {
  z.string().date().parse(start);
  z.string().date().parse(end);
  const first = Date.parse(`${start}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);
  const count = (last - first) / 86_400_000 + 1;
  if (count < 1 || count > 366) throw new Error("INVALID_HOLIDAY_RANGE");
  return Array.from({ length: count }, (_, index) =>
    new Date(first + index * 86_400_000).toISOString().slice(0, 10),
  );
}

export const companyHolidaySchema = z
  .object({
    holiday_date: z.string().date(),
    holiday_end_date: z.string().date().optional(),
    name: z.object({ vi: text, zh: text }).strict(),
    action_time: z.coerce.date(),
  })
  .strict()
  .refine(
    (input) => {
      try {
        buildCompanyHolidayDates(input.holiday_date, input.holiday_end_date);
        return true;
      } catch {
        return false;
      }
    },
    {
      message: "Chọn một dải ngày liên tiếp, tối đa 366 ngày.",
      path: ["holiday_end_date"],
    },
  );
