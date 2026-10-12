export function payrollHistoryDay(value: string) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const get = (type: string) => parts.find(p => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function payrollMonthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return { from: "", to: "" };
  const [year, value] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, value, 0)).getUTCDate();
  return { from: month + "-01", to: month + "-" + String(last).padStart(2, "0") };
}
export function payrollDeliveryReason(reason: string | null, lang: "vi" | "zh") {
  if (!reason) return "";
  if (/out of storage|mailbox.*full|OverQuotaTemp|\b4\.2\.2\b/i.test(reason)) return lang === "vi" ? "Hộp thư người nhận đã đầy. Người nhận cần giải phóng dung lượng để nhận email." : "收件人邮箱空间已满，需要释放空间以接收邮件。";
  return reason;
}
