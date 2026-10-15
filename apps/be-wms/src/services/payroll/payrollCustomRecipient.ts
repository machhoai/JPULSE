import { payrollCustomFieldSource, type PayrollComposer, type PayrollRecipient, type PayrollValue } from "@bduck/shared-types";

import { payrollError } from "./payrollSchemas.js";

export function assertPayrollCustomRecipient(composer: PayrollComposer, person: PayrollRecipient) {
  const definitions = new Map((composer.custom_fields ?? []).map(field => [field.id, field]));
  const check = (values: Record<string, PayrollValue>, sources: string[]) => {
    for (const key of Object.keys(values)) {
      const source = payrollCustomFieldSource(key); if (!source) continue;
      if (!definitions.has(key) || !sources.includes(source))
        payrollError(`${person.name}: trường dữ liệu tùy chỉnh ${key} chưa có trong mẫu hoặc sai nguồn. Hãy đọc lại Excel và lưu bản nháp.`,
          `${person.name}：自定义字段 ${key} 未在模板中定义或来源不符，请重新读取 Excel 并保存草稿。`);
    }
  };
  check(person.values, ["roster", "salary"]);
  person.attendance.forEach(row => check(row, ["attendance"]));
  person.match_candidates?.salary.forEach(row => check(row.values, ["salary"]));
  person.match_candidates?.attendance.forEach(block => block.rows.forEach(row => check(row, ["attendance"])));
}
