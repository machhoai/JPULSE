import { z } from "zod";

export const posCashDrawerSettingsSchema = z
  .object({
    auto_open_enabled: z.boolean(),
    protocol: z.enum(["ESCPOS", "TSPL"]),
    pin: z.union([z.literal(2), z.literal(5)]),
    expected_version: z.number().int().nonnegative(),
    action_time: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine((value) => value.protocol !== "TSPL" || value.pin === 2, {
    path: ["pin"],
    message: "TSPL requires pin 2",
  });

export class PosCashDrawerConflictError extends Error {
  readonly statusCode = 409;
  readonly messages = {
    vi: "Cấu hình két đã thay đổi. Hãy kiểm tra phiên bản mới trước khi lưu lại.",
    zh: "钱箱配置已更改，请检查最新版本后再保存。",
  };
}

export function assertCashDrawerVersion(
  actual: number,
  expected: number,
): void {
  if (actual !== expected) throw new PosCashDrawerConflictError();
}
