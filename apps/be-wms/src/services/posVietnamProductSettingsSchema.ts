import { z } from "zod";

export const posCatalogGoodsIdSchema = z.string().trim().min(1).max(256)
  .refine((value) => value !== "." && value !== ".." && !value.includes("/"));

export const posVietnamProductSettingsSchema = z.object({
  expected_version: z.number().int().nonnegative(),
  selling_price_vnd: z.number().int().min(0).max(999_999_999_999).nullable(),
  vat_rate: z.enum(["0%", "5%", "8%", "10%", "KCT", "KKKNT"]).nullable(),
  effective_date: z.iso.date().nullable(),
  import_from_hk: z.boolean(),
  send_sale_to_hk: z.boolean(),
}).strict().refine(({ selling_price_vnd, vat_rate, effective_date }) =>
  selling_price_vnd === null
    ? vat_rate === null && effective_date === null
    : vat_rate !== null && effective_date !== null, {
  path: ["selling_price_vnd"],
  message: "A Vietnam price, VAT category and effective date must be set together.",
});
