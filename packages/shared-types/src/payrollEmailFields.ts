import type { PayrollBlock, PayrollComposer } from './payrollEmail.js';

export const PAYROLL_FIELDS = {
  name: ['Họ tên', '姓名'], email: ['Email', '电子邮箱'], job_title: ['Chức vụ', '职位'],
  bank_account: ['STK ngân hàng', '银行账号'], bank: ['Ngân hàng', '银行'],
  gross: ['Tổng thanh toán', '应付总额'], tax: ['Thuế TNCN', '个人所得税'], net: ['Thực nhận', '实发工资'],
  days: ['Số ngày làm', '工作天数'], shifts7: ['Số ca 7h', '7小时班次数'],
  shifts8: ['Số ca 8h', '8小时班次数'], holiday: ['Số ca ngày lễ', '节假日班次数'],
  standard_days: ['Ngày công quy chuẩn', '标准工作天数'], overtime_hours: ['Giờ tăng ca', '加班小时'],
  overtime_pay: ['Lương tăng ca', '加班工资'], insurance: ['BHXH', '社会保险'], advance: ['Tạm ứng', '预支工资'],
  notes: ['Ghi chú', '备注'], date: ['Ngày', '日期'], weekday: ['Thứ', '星期'], shift: ['Ca', '班次'],
  day_type: ['Loại ngày', '日期类型'], check_in: ['Giờ vào', '上班时间'], check_out: ['Giờ ra', '下班时间'],
  standard_hours: ['Giờ chuẩn ca', '标准工时'], hours: ['Giờ làm trong ca', '班内工时'],
  missing_minutes: ['Phút thiếu', '缺勤分钟'], extra_minutes: ['Phút ngoài ca', '班外分钟'],
  shift_status: ['Trạng thái ca', '班次状态'], in_status: ['Trạng thái vào', '上班状态'],
  out_status: ['Trạng thái ra', '下班状态'], source: ['Nguồn', '来源'],
} as const;
export type PayrollField = keyof typeof PAYROLL_FIELDS;
export const PAYROLL_BLOCK_LABELS: Record<PayrollBlock, [string, string]> = {
  'employee-info': ['Thông tin nhân viên', '员工信息'], attendance: ['Bảng công', '考勤表'], payslip: ['Phiếu lương', '工资单'],
};
export const DEFAULT_PAYROLL_FIELDS: Record<PayrollBlock, string[]> = {
  'employee-info': ['name', 'job_title', 'email', 'bank_account', 'bank'],
  attendance: ['date', 'weekday', 'shift', 'day_type', 'check_in', 'check_out', 'hours', 'shift_status'],
  payslip: ['days', 'shifts7', 'shifts8', 'holiday', 'gross', 'tax', 'net'],
};
export function createPayrollComposer(): PayrollComposer {
  return { subject: 'Bảng công & lương @(tMonth-1)@/@tYear@ - @name@',
    ops: [{ insert: 'Chào @name@,\n' }, { insert: { payroll: 'employee-info' } },
      { insert: '\n' }, { insert: { payroll: 'attendance' } }, { insert: '\n' },
      { insert: { payroll: 'payslip' } }, { insert: '\n' }],
    fields: structuredClone(DEFAULT_PAYROLL_FIELDS), signature_id: null, mappings: {} };
}
