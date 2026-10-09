import { formatPayrollNumber } from "@bduck/shared-types";
import type { PayrollRecipient } from "@bduck/shared-types";
export function payrollEligibleIds(people: PayrollRecipient[]) {
  const counts = new Map<string, number>();
  for (const person of people) if (person.selected) {
    const email = person.email.trim().toLowerCase(); counts.set(email, (counts.get(email) || 0) + 1);
  }
  return new Set(people.filter(person => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email) &&
    (person.selected ? counts.get(person.email.trim().toLowerCase()) === 1 : !counts.has(person.email.trim().toLowerCase())) &&
    !person.issues.some(i => i.severity === "ERROR" && i.code !== "MISSING_EMAIL" && i.code !== "DUPLICATE_EMAIL")).map(p => p.id));
}

type MatchSalary = NonNullable<PayrollRecipient["match_candidates"]>["salary"][number];
type MatchAttendance = NonNullable<PayrollRecipient["match_candidates"]>["attendance"][number];
export function resolvePayrollMatch(person: PayrollRecipient, salary: MatchSalary, attendance: MatchAttendance): PayrollRecipient {
  const values = { ...person.values };
  for (const field of ["days","shifts7","shifts8","holiday","standard_days","overtime_hours","overtime_pay","insurance","advance"])
    values[field] = salary.values[field] ?? null;
  values.notes = person.values.notes ?? salary.values.notes ?? null;
  const issues = [...person.issues.filter(i => i.code !== "MATCH_REQUIRED" && i.code !== "MONEY_MISMATCH"),
    ...salary.issues, ...attendance.issues];
  for (const field of ["gross","tax","net"]) if (values[field] != null && salary.values[field] != null && values[field] !== salary.values[field])
    issues.push({ code: "MONEY_MISMATCH", severity: "WARNING", field, source: person.source, messages: {
      vi: person.name + " — " + field + ": bảng kê " + formatPayrollNumber(values[field]) + ", bảng lương " + formatPayrollNumber(salary.values[field]) +
        " (dòng " + salary.source.row + ", sheet " + salary.source.sheet + "). Ưu tiên bảng kê.",
      zh: person.name + "：" + field + " 工资清单 " + formatPayrollNumber(values[field], "zh") + "，工资表 " + formatPayrollNumber(salary.values[field], "zh") + "，优先使用工资清单。",
    } });
  return { ...person, values, attendance: attendance.rows, resolved_sources: { salary: salary.source, attendance: attendance.source }, issues };
}
