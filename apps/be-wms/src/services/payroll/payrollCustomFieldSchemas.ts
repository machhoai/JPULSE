import { PAYROLL_FIELDS, isPayrollCustomLabelValid, payrollCustomFieldSource, payrollBlockFields, type PayrollComposer } from "@bduck/shared-types";
import { z } from "zod";

export const payrollDataField = z.string().refine(key => Object.hasOwn(PAYROLL_FIELDS, key) || !!payrollCustomFieldSource(key));
export const payrollCustomFieldsSchema = z.array(z.object({
  id: z.string().refine(id => !!payrollCustomFieldSource(id)),
  label: z.string().trim().min(1).max(160),
  source: z.enum(["roster", "salary", "attendance"]),
}).strict()).optional();

export function validatePayrollCustomFields(composer: PayrollComposer, ctx: z.RefinementCtx) {
  const definitions = composer.custom_fields ?? [];
  const ids = new Set<string>(), labels = new Set<string>();
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  definitions.forEach((field, index) => {
    const label = field.source + ":" + field.label.normalize("NFC").trim().toLocaleLowerCase("vi");
    if (ids.has(field.id) || labels.has(label) || !isPayrollCustomLabelValid(composer, field.source, field.label, field.id) || payrollCustomFieldSource(field.id) !== field.source)
      issue(["custom_fields", index], "Trường bị trùng tên/mã hoặc không đúng nguồn dữ liệu / 字段名称、编号重复或来源不符");
    ids.add(field.id); labels.add(label);
  });
  for (const block of ["employee-info", "attendance", "payslip"] as const) {
    const allowed = payrollBlockFields(composer, block);
    for (const [property, fields] of [["fields", composer.fields[block]], ["field_order", composer.field_order?.[block] ?? []]] as const)
      if (new Set(fields).size !== fields.length || fields.some(key => !allowed.includes(key)))
        issue([property, block], "Trường hiển thị trùng, chưa khai báo hoặc không thuộc bảng này / 显示字段重复、未定义或不属于此表");
  }
  for (const [source, mapping] of Object.entries(composer.mappings))
    for (const key of Object.keys(mapping.columns))
      if (payrollCustomFieldSource(key) && !definitions.some(field => field.id === key && field.source === source))
        issue(["mappings", source, "columns", key], "Trường tùy chỉnh chưa khai báo hoặc sai nguồn / 自定义字段未定义或来源不符");
}
