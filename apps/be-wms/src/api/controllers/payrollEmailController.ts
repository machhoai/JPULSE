import { fetchPayrollDrafts, fetchPayrollHistory, fetchPayrollHistorySnapshot } from "../../services/payroll/payrollQueryService.js";
import type { Request, Response } from "express";
import { z } from "zod";
import { ZipArchive } from "archiver";
import { createPayrollMime } from "../../services/payroll/payrollMimeService.js";
import { payrollActor } from "../../services/payroll/payrollAccess.js";
import { payrollId, emailSchema, payrollError } from "../../services/payroll/payrollSchemas.js";
import { listPayrollCatalog, savePayrollTemplate, savePayrollSignature, removePayrollCatalog, savePayrollDraft,
  readPayrollDraft, savePayrollRecipient, listPayrollRecipients } from "../../services/payroll/payrollManagementService.js";
import { buildPayrollSnapshot } from "../../services/payroll/payrollSnapshotService.js";
import { createPayrollJob, getPayrollJobDetails, retryPayrollItems } from "../../services/payroll/payrollJobService.js";
import { authenticatePayrollWorker, recoverPayrollJobs } from "../../services/payroll/payrollTaskDispatcher.js";
import { processPayrollJob } from "../../services/payroll/payrollWorker.js";
import { sendBrevoEmail } from "../../services/brevoEmailService.js";
import type { PayrollSnapshot } from "@bduck/shared-types";
import { sendSuccess, sendError } from "../../utils/responseHelper.js";
function handle(fn: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store");
    try { await fn(req, res); } catch (error) {
      const e = error as { statusCode?: number; messages?: { vi: string; zh: string }; data?: unknown };
      if (res.headersSent) { res.destroy(); return; }
      if (error instanceof z.ZodError) {
        const paths = error.issues.map(i => i.path.join(".")).join(", ");
        sendError(res, { vi: "Dữ liệu chưa hợp lệ tại: " + paths + ". Hãy kiểm tra các trường này.",
          zh: "以下字段数据无效：" + paths + "，请检查。" }, 400);
      } else if (e.messages) sendError(res, e.messages, e.statusCode || 400, e.data);
      else {
        console.error("PAYROLL_API_FAILED", { route: req.route?.path, code: (error as { code?: string }).code });
        sendError(res, { vi: "Không thể xử lý thao tác bảng lương. Dữ liệu đang được giữ; hãy thử lại. Nếu tiếp tục lỗi, liên hệ quản trị viên với đường dẫn " + req.route?.path,
          zh: "无法处理工资操作，数据已保留；请重试，若仍失败请联系管理员并提供路径 " + req.route?.path }, 500);
      }
    }
  };
}
const id = (req: Request) => payrollId.parse(req.params.id);
export const processPayrollJobHandler = handle(async (req, res) => {
  await authenticatePayrollWorker(req); await processPayrollJob(id(req)); sendSuccess(res, { processed: true });
});
export const recoverPayrollJobsHandler = handle(async (req, res) => {
  await authenticatePayrollWorker(req); await recoverPayrollJobs(); sendSuccess(res, { recovered: true });
});
export const fetchPayrollCatalogHandler = handle(async (req, res) => sendSuccess(res, await listPayrollCatalog(payrollActor(req).access)));
export const updatePayrollTemplateHandler = handle(async (req, res) => {
  const { actor, access } = payrollActor(req); sendSuccess(res, await savePayrollTemplate(id(req), req.body, actor, access));
});
export const updatePayrollSignatureHandler = handle(async (req, res) => {
  const { actor, access } = payrollActor(req); sendSuccess(res, await savePayrollSignature(id(req), req.body, actor, access));
});
export const fetchPayrollDraftsHandler = handle(async (req, res) => {
  const { actor, access } = payrollActor(req); const facility = payrollId.parse(req.query.facility_id);
  sendSuccess(res, await fetchPayrollDrafts(facility, actor, access));
});
export const updatePayrollDraftHandler = handle(async (req, res) => {
  const { actor, access } = payrollActor(req); sendSuccess(res, await savePayrollDraft(id(req), req.body, actor, access));
});
export const fetchPayrollDraftHandler = handle(async (req, res) => {
  const { actor, access } = payrollActor(req); sendSuccess(res, await readPayrollDraft(id(req), actor, access));
});
export const updatePayrollRecipientHandler = handle(async (req, res) => {
  const { actor, access } = payrollActor(req);
  sendSuccess(res, await savePayrollRecipient(id(req), payrollId.parse(req.params.person), req.body, actor, access));
});
export const fetchPayrollRecipientsHandler = handle(async (req, res) => {
  const { actor, access } = payrollActor(req); sendSuccess(res, await listPayrollRecipients(id(req), actor, access,
    req.query.after ? payrollId.parse(req.query.after) : undefined));
});
export const previewPayrollEmailHandler = handle(async (req, res) => {
  const { actor, access } = payrollActor(req); const person = payrollId.parse(req.body.person_id);
  sendSuccess(res, await buildPayrollSnapshot(id(req), person, actor, access, "notifications.payroll.compose"));
});
export const sendPayrollTestHandler = handle(async (req, res) => {
  const { actor, access } = payrollActor(req);
  const snapshot = await buildPayrollSnapshot(id(req), payrollId.parse(req.body.person_id), actor, access, "notifications.payroll.send");
  const result = await sendBrevoEmail({ to: [emailSchema.parse(req.body.email)], subject: snapshot.subject,
    htmlContent: snapshot.html, textContent: snapshot.text, signature: false });
  sendSuccess(res, result, { vi: "Đã gửi email mẫu tới địa chỉ đã nhập.", zh: "样例邮件已发送到指定地址。" });
});
export const exportPayrollEmailHandler = handle(async (req, res) => {
  const { actor, access } = payrollActor(req);
  await readPayrollDraft(id(req), actor, access, "notifications.payroll.download");
  const people = z.array(payrollId).min(1).parse(req.body.recipient_ids);
  const sender = process.env.BREVO_SENDER_EMAIL;
  if (!sender) payrollError("Chưa cấu hình địa chỉ gửi BREVO_SENDER_EMAIL.", "尚未配置发件人 BREVO_SENDER_EMAIL。", 503);
  const zip = new ZipArchive({ zlib: { level: 6 } });
  res.attachment("payroll-emails.zip"); zip.on("error", () => res.destroy()); zip.pipe(res);
  for (const person of [...new Set(people)]) {
    const s = await buildPayrollSnapshot(id(req), person, actor, access, "notifications.payroll.download");
    const mime = await createPayrollMime(s);
    const filename = s.name.normalize("NFC").replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 100) + "-" + person + ".eml";
    zip.append(mime, { name: filename });
  }
  await zip.finalize();
});
export const createPayrollJobHandler = handle(async (req, res) => {
  const { actor, access } = payrollActor(req); sendSuccess(res, await createPayrollJob(req.body, actor, access), {
    vi: "Đã tiếp nhận đợt gửi; hệ thống tiếp tục gửi ở nền.", zh: "已接受发送任务，系统将在后台继续发送。" }, 202);
});
export const fetchPayrollJobHandler = handle(async (req, res) => {
  const { actor, access } = payrollActor(req); sendSuccess(res, await getPayrollJobDetails(id(req), actor, access));
});
export const retryPayrollItemsHandler = handle(async (req, res) => {
  const { actor, access } = payrollActor(req);
  sendSuccess(res, await retryPayrollItems(id(req), z.array(payrollId).min(1).parse(req.body.recipient_ids), actor, access));
});
export const fetchPayrollHistoryHandler = handle(async (req, res) => {
  const { access } = payrollActor(req); const facility = payrollId.parse(req.query.facility_id);
  sendSuccess(res, await fetchPayrollHistory(facility, req.query.after ? payrollId.parse(req.query.after) : undefined, access));
});
export const exportPayrollHistoryHandler = handle(async (req, res) => {
  const { access } = payrollActor(req);
  const { record, snapshot } = await fetchPayrollHistorySnapshot(id(req), access);
  const sender = process.env.BREVO_SENDER_EMAIL;
  if (!sender) payrollError("Chưa cấu hình BREVO_SENDER_EMAIL để dựng email tải xuống.", "尚未配置 BREVO_SENDER_EMAIL。", 503);
  const mime = await createPayrollMime(snapshot, { messageId: record.message_id, date: record.created_at });
  const archive = new ZipArchive({ zlib: { level: 6 } });
  res.attachment("payroll-email-history.zip"); archive.on("error", () => res.destroy()); archive.pipe(res);
  archive.append(mime, { name: id(req) + ".eml" }); await archive.finalize();
});
function removeCatalogHandler(kind: "templates" | "signatures") {
  return handle(async (req, res) => {
    const { actor, access } = payrollActor(req);
    await removePayrollCatalog(kind, id(req), actor, access); sendSuccess(res, { removed: true });
  });
}
export const removePayrollTemplateHandler = removeCatalogHandler("templates");
export const removePayrollSignatureHandler = removeCatalogHandler("signatures");
