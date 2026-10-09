import type { PayrollRecipient, PayrollSource, PayrollSourceMapping, PayrollValue, PayrollIssue } from "@bduck/shared-types";
import { PAYROLL_FIELDS, formatPayrollNumber, isPayrollBankAccountValid } from "@bduck/shared-types";
import type ExcelJS from "exceljs";
export interface PayrollWorkbook { file: File; workbook: ExcelJS.Workbook }
export type PayrollImportKind = "roster" | "salary" | "attendance";
export const normalizePayrollName = (name: string) => name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
const aliases: Record<string, string[]> = {
  name: ["họ tên", "họ và tên"], email: ["email"], job_title: ["chức vụ"], bank_account: ["stk"],
  bank: ["ngân hàng"], gross: ["tổng thanh toán", "tổng lương"], tax: ["thuế tncn"], net: ["thực nhận"],
  days: ["số ngày làm"], shifts7: ["số ca 7h"], shifts8: ["số ca 8h"], holiday: ["số ca ngày lễ"],
};
const numericFields = new Set(["gross", "tax", "net", "days", "shifts7", "shifts8", "holiday", "standard_days", "overtime_hours", "overtime_pay", "insurance", "advance", "standard_hours", "hours", "missing_minutes", "extra_minutes"]);
function readField(field: string, cell: ExcelJS.Cell): PayrollValue {
  const value = field === "bank_account" ? bankAccount(cell) : cellValue(cell);
  if (!numericFields.has(field) || value == null || value === "") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  throw new Error("Cột " + PAYROLL_FIELDS[field as keyof typeof PAYROLL_FIELDS][0] + " cần dữ liệu số trong Excel. Kiểm tra cột map hoặc chuyển giá trị sang Number. / 请检查映射列并将单元格值设为数字。");
}
export async function readPayrollWorkbook(file: File): Promise<PayrollWorkbook> {
  if (!/\.xlsx$/i.test(file.name) || file.size > 10 * 1024 * 1024)
    throw new Error("Chỉ nhận file .xlsx tối đa 10 MB. / 仅接受不超过 10 MB 的 .xlsx 文件。");
  const data = await file.arrayBuffer();
  if (new Uint8Array(data)[0] !== 0x50 || new Uint8Array(data)[1] !== 0x4b)
    throw new Error("File không có cấu trúc Excel hợp lệ. / 文件不是有效的 Excel。");
  const { default: Excel } = await import("exceljs");
  const workbook = new Excel.Workbook(); await workbook.xlsx.load(data);
  return { file, workbook };
}
function cellValue(cell: ExcelJS.Cell): PayrollValue {
  const value = cell.value;
  if (value == null) return null;
  if (value instanceof Date) return value.toLocaleDateString("vi-VN", { timeZone: "UTC" });
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return String(value);
  if ("formula" in value || "sharedFormula" in value) {
    if (value.result == null) throw new Error("Ô " + cell.address + " chưa có kết quả công thức đã lưu. Mở file bằng Excel và lưu lại. / 单元格没有缓存公式结果，请用 Excel 打开并保存。");
    if (typeof value.result === "object" && "error" in value.result) throw new Error(cell.address + ": " + value.result.error);
    return value.result instanceof Date ? value.result.toLocaleDateString("vi-VN") : typeof value.result === "boolean" ? String(value.result) : value.result as PayrollValue;
  }
  if ("error" in value) throw new Error(cell.address + ": " + value.error);
  if ("richText" in value) return value.richText.map(t => t.text).join("");
  if ("text" in value) return value.text;
  return cell.text;
}
function bankAccount(cell: ExcelJS.Cell): PayrollValue {
  const value = cellValue(cell);
  if (typeof value !== "number") return value;
  if (!Number.isSafeInteger(value)) throw new Error("STK dạng số không thể đọc chính xác. Chuyển ô sang Text và nhập lại STK. / 银行账号数字精度不安全，请改为文本并重新输入。");
  return /^0+$/.test(cell.numFmt || "") ? String(value).padStart(cell.numFmt.length, "0") : String(value);
}
export function detectPayrollMapping(book: PayrollWorkbook, sheetName: string): PayrollSourceMapping {
  const sheet = book.workbook.getWorksheet(sheetName)!; let header = 1;
  for (let r = 1; r <= Math.min(sheet.rowCount, 25); r++) {
    let isHeader = false; sheet.getRow(r).eachCell(cell => { if (cell.text.trim().toUpperCase() === "STT") isHeader = true; });
    if (isHeader) { header = r; break; }
  }
  const columns: Record<string, string> = {};
  sheet.getRow(header).eachCell((cell, c) => {
    const name = normalizePayrollName(cell.text);
    const field = Object.keys(PAYROLL_FIELDS).find(f => [...(aliases[f] || []), PAYROLL_FIELDS[f as keyof typeof PAYROLL_FIELDS][0]]
      .some(label => normalizePayrollName(label) === name));
    if (field) columns[field] = sheet.getColumn(c).letter;
  });
  return { sheet: sheetName, start_row: header + 1, columns };
}
export function previewPayrollColumns(book: PayrollWorkbook, mapping: PayrollSourceMapping) {
  const sheet = book.workbook.getWorksheet(mapping.sheet)!;
  return Array.from({ length: Math.min(sheet.columnCount, 100) }, (_, i) => ({
    column: sheet.getColumn(i + 1).letter, sample: sheet.getRow(mapping.start_row).getCell(i + 1).text,
    header: sheet.getRow(Math.max(mapping.start_row - 1, 1)).getCell(i + 1).text,
  }));
}
export interface PayrollParsedRow { name: string; values: Record<string, PayrollValue>; source: PayrollSource; issues: PayrollIssue[] }
export function parsePayrollRows(book: PayrollWorkbook, mapping: PayrollSourceMapping, kind: PayrollImportKind) {
  const sheet = book.workbook.getWorksheet(mapping.sheet);
  if (!sheet) throw new Error("Không tìm thấy sheet / 找不到工作表: " + mapping.sheet);
  const rows: PayrollParsedRow[] = []; const blocks: { name: string; source: PayrollSource; rows: Record<string, PayrollValue>[]; issues: PayrollIssue[] }[] = [];
  let current: (typeof blocks)[number] | null = null;
  let indexColumn = 1;
  // Starting midway through data must still use the real header's index column.
  for (let headerRow = 1; headerRow < mapping.start_row; headerRow++)
    sheet.getRow(headerRow).eachCell((cell, column) => { if (cell.text.trim().toUpperCase() === "STT") indexColumn = column; });
  for (let r = kind === "attendance" ? 1 : mapping.start_row; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r); const first = row.getCell(1).text.trim();
    const title = first.match(/^BẢNG CHẤM CÔNG\s*[—–-]\s*(.+)$/i);
    if (kind === "attendance" && title) {
      current = { name: title[1].trim(), source: { file: book.file.name, sheet: sheet.name, row: r }, rows: [], issues: [] };
      blocks.push(current); continue;
    }
    if (r < mapping.start_row || !/^\d+$/.test(row.getCell(indexColumn).text.trim())) continue;
    if (kind === "attendance" && !current) continue;
    const source = { file: book.file.name, sheet: sheet.name, row: r };
    const values: Record<string, PayrollValue> = {}; const issues: PayrollIssue[] = [];
    for (const [field, column] of Object.entries(mapping.columns)) {
      try { values[field] = readField(field, row.getCell(column)); }
      catch (error) { values[field] = null; const message = error instanceof Error ? error.message : String(error);
        const location = book.file.name + " / " + sheet.name + " / " + r + " / " + column;
        issues.push({ code: "CELL_ERROR", severity: field === "bank_account" ? "WARNING" : "ERROR", field, source: { ...source, column },
          messages: { vi: location + ": " + message + (field === "bank_account" ? " Email sẽ hiển thị: Cần bổ sung gấp." : ""),
            zh: location + ": " + message + (field === "bank_account" ? " 邮件将提示：需要紧急补充银行账号。" : "") } }); }
    }
    if (kind === "attendance") { current!.rows.push(values); current!.issues.push(...issues); }
    else {
      const name = String(values.name ?? "").trim(); if (name) rows.push({ name, values, source, issues });
    }
  }
  return { rows, blocks };
}
export function mergePayrollData(roster: ReturnType<typeof parsePayrollRows>, salary: ReturnType<typeof parsePayrollRows>,
  attendance: ReturnType<typeof parsePayrollRows>): PayrollRecipient[] {
  const index = <T extends { name: string }>(rows: T[]) => {
    const result = new Map<string, T[]>();
    for (const row of rows) { const key = normalizePayrollName(row.name); const group = result.get(key) || []; group.push(row); result.set(key, group); }
    return result;
  };
  const salaryIndex = index(salary.rows); const attendanceIndex = index(attendance.blocks); const rosterIndex = index(roster.rows);
  return roster.rows.map(row => {
    const key = normalizePayrollName(row.name);
    const matched = salaryIndex.get(key) || [];
    const blocks = attendanceIndex.get(key) || [];
    const issues = [...row.issues]; const duplicate = (rosterIndex.get(key)?.length || 0) > 1;
    if (matched.length !== 1 || blocks.length !== 1 || duplicate)
      issues.push({ code: "MATCH_REQUIRED", severity: "ERROR", source: row.source,
        messages: { vi: row.name + ": tìm thấy " + matched.length + " dòng lương và " + blocks.length + " khối công" + (duplicate ? ", tên trùng trong bảng kê" : "") + ". Hãy chọn bản ghi đối chiếu hoặc bỏ chọn người này.",
          zh: row.name + "：找到 " + matched.length + " 个工资行和 " + blocks.length + " 个考勤块，请选择匹配记录或取消选择。" } });
    if (!String(row.values.email ?? "").trim()) issues.push({ code: "MISSING_EMAIL", severity: "ERROR", field: "email", source: row.source,
      messages: { vi: "Thiếu email tại dòng " + row.source.row + " trong sheet " + row.source.sheet + ", file " + row.source.file + ". Nhập email hoặc bỏ chọn người nhận này.",
        zh: row.source.file + " / " + row.source.sheet + " / " + row.source.row + "：缺少邮箱，请填写或取消选择。" } });
    if (!isPayrollBankAccountValid(row.values.bank_account) && !row.issues.some(i => i.field === "bank_account")) {
      const missing = row.values.bank_account == null || String(row.values.bank_account).trim() === "";
      issues.push({ code: missing ? "MISSING_BANK_ACCOUNT" : "INVALID_BANK_ACCOUNT", severity: "WARNING", field: "bank_account", source: row.source,
        messages: { vi: (missing ? "Thiếu STK" : "STK chưa hợp lệ") + " tại dòng " + row.source.row + " trong sheet " + row.source.sheet + ", file " + row.source.file + ". Email sẽ hiển thị: Cần bổ sung gấp.",
          zh: row.source.file + " / " + row.source.sheet + " / " + row.source.row + (missing ? "：缺少银行账号。" : "：银行账号格式无效。") + "邮件将提示：需要紧急补充银行账号。" } });
    }
    const matchedValues = matched.length === 1 ? matched[0].values : {};
    for (const field of ["gross", "net"]) if (row.values[field] == null || row.values[field] === "") {
      issues.push({ code: "MISSING_PAYMENT", severity: "ERROR", field, source: row.source, messages: {
        vi: "Chưa đọc được " + PAYROLL_FIELDS[field as keyof typeof PAYROLL_FIELDS][0] + " tại dòng " + row.source.row + ", sheet " + row.source.sheet + ". Kiểm tra cột đã map và dữ liệu Excel, hoặc bỏ chọn người này.",
        zh: row.source.sheet + " 第 " + row.source.row + " 行未能读取 " + field + "，请检查映射和 Excel 数据或取消选择。",
      } });
    }
    for (const f of ["gross","tax","net"]) if (row.values[f] != null && matchedValues[f] != null && row.values[f] !== matchedValues[f])
      issues.push({ code: "MONEY_MISMATCH", severity: "WARNING", field: f, source: row.source,
        messages: { vi: row.name + " — " + PAYROLL_FIELDS[f as keyof typeof PAYROLL_FIELDS][0] + ": bảng kê " + formatPayrollNumber(row.values[f]) + ", bảng lương " + formatPayrollNumber(matchedValues[f]) + " (dòng " + matched[0].source.row + ", sheet " + matched[0].source.sheet + "). Ưu tiên bảng kê.",
          zh: row.name + "：" + f + " 工资清单 " + formatPayrollNumber(row.values[f], "zh") + "，工资表 " + formatPayrollNumber(matchedValues[f], "zh") + "，优先使用工资清单。" } });
    const values: Record<string, PayrollValue> = { ...matchedValues, ...row.values, gross: row.values.gross ?? null, tax: row.values.tax ?? null, net: row.values.net ?? null }; delete values.name; delete values.email;
    const needsMatch = issues.some(i => i.code === "MATCH_REQUIRED");
    return { id: crypto.randomUUID(), name: row.name, email: String(row.values.email ?? "").trim(),
      ...(needsMatch ? { match_candidates: { salary: matched.length ? matched : salary.rows, attendance: blocks.length ? blocks : attendance.blocks } } : {}),
      resolved_sources: { ...(matched.length === 1 ? { salary: matched[0].source } : {}), ...(blocks.length === 1 ? { attendance: blocks[0].source } : {}) },
      original_email: String(row.values.email ?? "").trim(), selected: true, source: row.source, values,
      attendance: blocks.length === 1 ? blocks[0].rows : [], issues: [...issues, ...(matched.length === 1 ? matched[0].issues : []), ...(blocks.length === 1 ? blocks[0].issues : [])] };
  });
}
