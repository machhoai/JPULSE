import type { PayrollJobMetadata, PayrollJobItem, PayrollSnapshot } from "@bduck/shared-types";
import { getPayrollRecord } from "../../repositories/payrollRepository.js";
import { readPayrollPayload } from "./payrollCrypto.js";
import { sendBrevoEmail } from "../brevoEmailService.js";
import { dispatchPayrollJob } from "./payrollTaskDispatcher.js";
import { preparePayrollJob } from "./payrollJobService.js";
import { claimPayrollItems as claim, completePayrollItem as finish, beginPayrollItem, finalizePayrollJob, payrollTime as asTime } from "../../repositories/payrollWorkerRepository.js";
function failure(error: unknown) {
  const e = error as { code?: string; responseCode?: number };
  const definite = !!e.responseCode || ["EAUTH","EENVELOPE","ECONNECTION","EDNS"].includes(e.code || "");
  return { status: definite ? "FAILED" as const : "UNKNOWN" as const,
    retryable: !!e.responseCode && e.responseCode >= 400 && e.responseCode < 500,
    messages: { vi: definite ? `SMTP chưa chấp nhận thư (mã ${e.responseCode ?? e.code ?? "không rõ"}). Kiểm tra địa chỉ/cấu hình hoặc thử lại người này.` :
      "Chưa xác định SMTP đã nhận thư hay chưa. Cần đối chiếu trước khi gửi lại.",
      zh: definite ? `SMTP 未接受邮件（代码 ${e.responseCode ?? e.code ?? "未知"}），请检查地址/配置或重试。` :
      "无法确认 SMTP 是否已接受邮件，请核对后再重新发送。" } };
}
export async function processPayrollJob(id: string) {
  const original = await getPayrollRecord<PayrollJobMetadata>("jobs", id);
  if (original?.status === "PREPARING") { await preparePayrollJob(original); return; }
  const claimed = await claim(id); if (!claimed) return;
  let cursor = 0; const startedAt = Date.now();
  const run = async () => {
    while (cursor < claimed.items.length && Date.now() - startedAt < 60000) {
      const item = claimed.items[cursor++];
      const snapshot = await readPayrollPayload<PayrollSnapshot>(item.payload_path, `snapshot:${id}:${item.id}:${claimed.job.facility_id}`);
      const allowed = await beginPayrollItem(claimed, item, snapshot);
      if (!allowed) continue;
      let result: { status: "SENT" | "FAILED" | "UNKNOWN" | "QUEUED"; message: string | null; error: PayrollJobItem["error"] };
      try { const sent = await sendBrevoEmail({ to: [snapshot.email], subject: snapshot.subject, htmlContent: snapshot.html,
        textContent: snapshot.text, signature: false, messageId: `<payroll-${id}-${item.id}-${item.attempt}@jpulse>` });
        result = { status: "SENT", message: sent.messageId, error: null };
      } catch (error) { const f = failure(error); result = { status: f.retryable && item.attempt < 3 ? "QUEUED" : f.status, message: null, error: f.messages }; }
      // A persistence error never re-enters SMTP. Retry the result transaction only.
      let saved = false;
      for (let attempt = 0; attempt < 3 && !saved; attempt++) {
        try { await finish(claimed.job, item, claimed.token, snapshot, result.status, result.message, result.error); saved = true; }
        catch { if (attempt === 2) throw new Error("PAYROLL_RESULT_PERSISTENCE_FAILED"); }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, claimed.items.length) }, run));
  const next = await finalizePayrollJob(id, claimed.token);
  if (next?.enqueue_pending) await dispatchPayrollJob(id, next.revision, Math.max(0, Math.ceil((asTime(next.wake_at) - Date.now()) / 1000)));
}
