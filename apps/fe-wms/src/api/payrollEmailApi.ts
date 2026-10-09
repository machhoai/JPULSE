const base = (process.env.NEXT_PUBLIC_API_URL || "http://api.wms.localhost") + "/api/notifications/payroll";
export const EMAIL_SIGNATURES_CHANGED_EVENT = "email-signatures-changed";
export class PayrollApiError extends Error {
  constructor(message: string, readonly data?: { confirmation?: string; duplicates?: { name: string; email: string }[] }) { super(message); }
}
export async function payrollApi<T>(path: string, method = "GET", value?: unknown, lang: "vi" | "zh" = "vi"): Promise<T> {
  const response = await fetch(base + path, { method, credentials: "include", cache: "no-store",
    headers: { "Content-Type": "application/json" }, body: value === undefined ? undefined : JSON.stringify(
      typeof value === "object" && value !== null && !Array.isArray(value) ? { ...value, action_time: new Date().toISOString() } : value) });
  const result = await response.json();
  if (!response.ok || !result.success) throw new PayrollApiError(result.messages?.[lang] || response.statusText, result.data);
  return result.data as T;
}
export async function downloadPayrollZip(draft: string, people: string[], lang: "vi" | "zh", history = false) {
  const response = await fetch(base + (history ? "/history/" : "/drafts/") + draft + "/export", { method: "POST", credentials: "include",
    cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient_ids: people }) });
  if (!response.ok) { const error = await response.json(); throw new PayrollApiError(error.messages?.[lang] || response.statusText); }
  const blob = await response.blob(); const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "payroll-emails.zip"; a.click(); URL.revokeObjectURL(url);
}
