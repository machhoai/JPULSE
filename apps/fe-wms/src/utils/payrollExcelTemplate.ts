import { PAYROLL_FIELDS } from "@bduck/shared-types";
/** Synthetic, downloadable workbook in the same block structure as the payroll source. */
export async function downloadPayrollTemplate() {
  const { default: Excel } = await import("exceljs");
  const workbook = new Excel.Workbook();
  const roster = workbook.addWorksheet("Bảng kê lương");
  roster.addRow(["BẢNG KÊ LƯƠNG — THÁNG/NĂM"]);
  roster.addRow(["STT", "HỌ TÊN", "Email", "Chức vụ", "TỔNG THANH TOÁN", "THUẾ TNCN", "THỰC NHẬN", "STK", "NGÂN HÀNG", "GHI CHÚ"]);
  roster.addRow([1, "Nhân viên mẫu", "", "Vận hành", 0, 0, 0, "", "Techcombank", "Điền dữ liệu thật trước khi gửi"]);
  roster.getColumn(8).numFmt = "@";
  const salary = workbook.addWorksheet("Bảng lương Parttime AMTP");
  salary.addRow(["BẢNG LƯƠNG — THÁNG/NĂM"]);
  salary.addRow(["STT", "Họ Tên", "Số ngày làm", "Số ca 7h", "Số ca 8h", "Số ca ngày Lễ", "Tổng lương", "Thuế TNCN", "Thực nhận", "Ghi chú", "Ngày công quy chuẩn", "Giờ tăng ca", "Lương tăng ca", "BHXH", "Tạm ứng"]);
  salary.addRow([1, "Nhân viên mẫu", 1, 1, 0, 0, 0, 0, 0, "", null, null, null, null, null]);
  const attendance = workbook.addWorksheet("Bảng công");
  const headers = ["date","weekday","shift","day_type","check_in","check_out","standard_hours","hours","missing_minutes","extra_minutes","shift_status","in_status","out_status","source"];
  attendance.addRow(["TỔNG HỢP CHI TIẾT CHẤM CÔNG — THÁNG/NĂM"]);
  attendance.addRow(["BẢNG CHẤM CÔNG — Nhân viên mẫu"]); attendance.mergeCells("A2:O2");
  attendance.addRow(["STT", ...headers.map(f => PAYROLL_FIELDS[f as keyof typeof PAYROLL_FIELDS][0])]);
  attendance.addRow([1, "01/09/2026", "T3", "Ca 1", "Ngày thường", "08:00", "15:00", 7, 7, 0, 0, "Đủ giờ", "Đúng giờ", "Đúng giờ", "GPS"]);
  attendance.addRow(["TỔNG"]);
  const payslip = workbook.addWorksheet("Phiếu lương");
  payslip.addRow(["PHIẾU LƯƠNG — MẪU HIỂN THỊ"]);
  for (const f of ["days","shifts7","shifts8","holiday","gross","tax","net"])
    payslip.addRow([PAYROLL_FIELDS[f as keyof typeof PAYROLL_FIELDS][0], null]);
  for (const sheet of workbook.worksheets) {
    sheet.columns.forEach(column => { column.width = 24; }); sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: sheet === attendance ? 3 : 2 }];
    sheet.eachRow(row => { row.alignment = { vertical: "middle", wrapText: true }; });
  }
  const bytes = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "payroll-email-v1.xlsx"; anchor.click(); URL.revokeObjectURL(url);
}
