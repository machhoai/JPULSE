import ExcelJS from "exceljs";
import { createPayrollComposer } from "@bduck/shared-types";
export const clock = "2026-10-09T03:00:00.000Z";
export function person(index = 0, overrides = {}) {
  return { id: "person-" + index, name: "Nhân viên QA " + index,
    email: "person-" + index + "@example.invalid", original_email: "person-" + index + "@example.invalid",
    selected: true, source: { file: "qa.xlsx", sheet: "Bảng kê lương", row: index + 10 },
    values: { job_title: "Vận hành", bank_account: "001234567890", bank: "Techcombank", gross: 1500000, tax: 100000, net: 1400000,
      days: 3, shifts7: 2, shifts8: 1, holiday: 0 },
    attendance: [{ date: "01/09/2026", shift: "Ca 1", hours: 7, missing_minutes: 0 }],
    issues: [], ...overrides };
}
export function composer() { return createPayrollComposer(); }
export async function workbookFixture({ count = 3, missingEmail = -1, reordered = false, formula = "cached", duplicateName = false, mismatchedProfile = false, bankAccount } = {}) {
  const wb = new ExcelJS.Workbook();
  const roster = wb.addWorksheet("Bảng kê lương");
  roster.getCell("B1").value = "CÔNG TY QA";
  roster.getRow(9).values = ["STT","HỌ TÊN","Email","Chức vụ","TỔNG THANH TOÁN","THUẾ TNCN","THỰC NHẬN","STK","NGÂN HÀNG","GHI CHÚ"];
  const salary = wb.addWorksheet("Bảng lương Parttime AMTP");
  salary.getRow(1).values = ["BẢNG LƯƠNG QA", null, null, null, null, null, null, null, null, null, "CA 7H", 175000];
  salary.getRow(2).values = ["STT","Họ Tên","Số ngày làm","Số ca 7h","Số ca 8h","Số ca ngày Lễ","Tổng lương","Thuế TNCN","Thực nhận","Ghi chú"];
  const attendance = wb.addWorksheet("Bảng công");
  attendance.addRow(["TỔNG HỢP CHI TIẾT CHẤM CÔNG"]);
  for (let i = 0; i < count; i++) {
    const p = person(i);
    if (i === 0 && bankAccount !== undefined) p.values.bank_account = bankAccount;
    if (duplicateName && i === 1) p.name = person(0).name;
    roster.getRow(i + 10).values = [i + 1, p.name, i === missingEmail ? null : p.email, p.values.job_title, p.values.gross, p.values.tax, p.values.net, p.values.bank_account, p.values.bank, null];
    salary.getRow(i + 3).values = [i + 1, p.name, 3, 2, 1, 0, 1450000, 50000, 1400000, null];
    const title = attendance.addRow(["BẢNG CHẤM CÔNG — " + p.name]); attendance.mergeCells(title.number,1,title.number,15);
    attendance.addRow(["STT","Ngày","Thứ","Ca","Loại ngày","Giờ vào","Giờ ra","Giờ chuẩn ca","Giờ làm trong ca","Phút thiếu","Phút ngoài ca","Trạng thái ca","Trạng thái vào","Trạng thái ra","Nguồn","TRANG XÁC NHẬN"]);
    attendance.addRow([21,"21/09/2026","T2","Ca 1","Ngày thường","08:00","15:00",7,7,0,0,"Đủ giờ","Đúng giờ","Đúng giờ","GPS","KHÔNG GỬI"]);
    attendance.addRow([22,"22/09/2026","T3","Ca 2","Ngày thường","15:00","22:00",7,7,0,0,"Đủ giờ","Đúng giờ","Đúng giờ","GPS"]);
    attendance.addRow(["TỔNG",null,null,null,null,null,null,14,14]);
  }
  roster.getRow(count + 10).values = ["TỔNG",null,null,null,999999999];
  if (mismatchedProfile) { salary.getCell("B3").value = "Tên lương khác cần đối chiếu";
    salary.getCell("K2").value = "Chức vụ"; salary.getCell("K3").value = "KHÔNG DÙNG CHỨC VỤ TỪ BẢNG LƯƠNG"; }
  salary.getRow(count + 3).values = ["TỔNG",null,null,null,null,null,999999999];
  wb.addWorksheet("Phiếu lương").getCell("A1").value = "DỮ LIỆU NHÂN VIÊN MẪU KHÔNG GỬI";
  wb.addWorksheet("Tổng kết").getCell("A1").value = "DỮ LIỆU TỔNG KẾT KHÔNG GỬI";
  if (formula !== "none") roster.getCell("E10").value = formula === "cached" ? { formula: "1+1499999", result: 1500000 } : { formula: "1+1499999" };
  if (reordered) for (let r = 9; r <= count + 10; r++) {
    const old = [...roster.getRow(r).values]; [old[1], old[2]] = [old[2], old[1]]; roster.getRow(r).values = old;
  }
  const bytes = await wb.xlsx.writeBuffer();
  return { workbook: wb, file: new File([bytes], "qa-payroll.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }) };
}
