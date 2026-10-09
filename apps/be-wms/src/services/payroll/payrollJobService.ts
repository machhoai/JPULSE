import { findPayrollReceipt, existsPayrollJobItem, createPayrollJobRecord, createPayrollPreparedItem, advancePayrollPreparation, resetPayrollFailedItems } from "../../repositories/payrollJobRepository.js";
import { findPayrollJobItems } from "../../repositories/payrollQueryRepository.js";
import { createHash, createHmac, randomUUID } from "node:crypto";
import type { PayrollJobMetadata, PayrollJobItem, PayrollSnapshot, PayrollRecipient } from "@bduck/shared-types";
import { renderPayrollEmail, type EmailSignature } from "@bduck/shared-types";
import type { AuthorizationService } from "../authorization/index.js";
import { getPayrollRecord } from "../../repositories/payrollRepository.js";
import { readPayrollDraft, readPayrollRecipient } from "./payrollManagementService.js";
import { storePayrollPayload, readPayrollPayload } from "./payrollCrypto.js";
import { assertPayroll } from "./payrollAccess.js";
import { jobSchema, emailSchema, payrollError } from "./payrollSchemas.js";
import { sanitizePayrollSignature } from "./payrollHtml.js";
import { dispatchPayrollJob, assertPayrollDispatcherConfigured } from "./payrollTaskDispatcher.js";
export async function createPayrollJob(body: unknown, actor: string, access: AuthorizationService) {
  const input = jobSchema.parse(body); assertPayrollDispatcherConfigured();
  const { meta, content } = await readPayrollDraft(input.draft_id, actor, access, "notifications.payroll.send");
  if (input.draft_revision !== meta.revision) payrollError("Bản nháp đã thay đổi sau preview. Hãy lưu và xem lại trước khi gửi.", "预览后草稿已更改，请保存并重新查看后再发送。", 409);
  const id = createHash("sha256").update(actor + ":" + input.request_id).digest("hex");
  const existing = await getPayrollRecord<PayrollJobMetadata>("jobs", id);
  if (existing) { assertPayroll(access, "notifications.payroll.send", existing.facility_id);
    if (existing.created_by !== actor) payrollError("Đợt gửi thuộc tài khoản khác.", "发送任务属于其他账户。", 403);
    if (existing.enqueue_pending) await dispatchPayrollJob(id, existing.revision);
    return existing; }
  const ids = [...new Set(input.recipient_ids)];
  if (!ids.every(id => content.recipient_ids?.includes(id))) payrollError("Danh sách người nhận không khớp phiên bản bản nháp đã lưu. Hãy lưu lại và đối chiếu danh sách trước khi gửi.", "收件人列表与已保存草稿版本不匹配，请重新保存并核对后发送。", 409);
  let signature = { html: sanitizePayrollSignature(process.env.BREVO_EMAIL_SIGNATURE_HTML || ""), text: process.env.BREVO_EMAIL_SIGNATURE_TEXT || "" };
  if (content.composer.signature_id) {
    const found = await getPayrollRecord<EmailSignature>("signatures", content.composer.signature_id);
    if (!found) payrollError("Chữ ký đã bị xóa. Hãy chọn lại chữ ký trước khi gửi.", "签名已删除，请重新选择。");
    signature = found;
  }
  const fingerprint = createHash("sha256").update(JSON.stringify({ html: signature.html, text: signature.text })).digest("hex");
  if (fingerprint !== input.signature_fingerprint) payrollError("Chữ ký đã thay đổi sau khi mở mẫu. Hãy chọn lại mẫu để kiểm tra chữ ký trước khi gửi.", "打开模板后签名已改变，请重新选择模板检查签名后再发送。", 409);
  const people: PayrollRecipient[] = [];
  for (let offset = 0; offset < ids.length; offset += 25)
    people.push(...await Promise.all(ids.slice(offset, offset + 25).map(person => readPayrollRecipient(meta, person))));
  const emails = new Set<string>();
  const duplicates: { name: string; email: string; receipt: string; status: string }[] = [];
  for (const person of people) {
    if (!emailSchema.safeParse(person.email).success) payrollError(`${person.name}: email thiếu hoặc không hợp lệ tại dòng ${person.source.row}, sheet ${person.source.sheet}. Hãy sửa email hoặc bỏ chọn người này.`, `${person.name}：${person.source.sheet} 第 ${person.source.row} 行邮箱缺失或无效，请修改或取消选择。`);
    if (!person.selected || person.issues.some(i => i.severity === "ERROR" && !["MISSING_EMAIL", "DUPLICATE_EMAIL"].includes(i.code)))
      payrollError(`${person.name}: dữ liệu chưa được đối chiếu. Hãy bỏ chọn hoặc xử lý lỗi trước.`, `${person.name}：数据尚未核对，请取消选择或处理错误。`);
    const normalized = person.email.trim().toLowerCase();
    if (emails.has(normalized)) payrollError(`Email ${person.email} đang được chọn cho nhiều người. Hãy sửa email hoặc bỏ chọn dòng trùng.`, `邮箱 ${person.email} 对应多名员工，请修改或取消重复行。`);
    emails.add(normalized);
    const receipt = await findPayrollReceipt(actor, input.session_id, person.email);
    if (receipt.get("status") === "PROCESSING") payrollError(`${person.name} - ${person.email} đang được gửi ở một đợt khác trong phiên này. Hãy chờ kết quả trước khi gửi tiếp.`, `${person.name} - ${person.email} 正在本会话的其他任务中发送，请等待结果。`, 409);
    if (receipt.exists && ["SENT", "UNKNOWN"].includes(receipt.get("status") || "SENT")) duplicates.push({ name: person.name, email: person.email, receipt: String(receipt.get("record_id")), status: receipt.get("status") || "SENT" });
  }
  const keyName = "PAYROLL_ENCRYPTION_KEY_" + (process.env.PAYROLL_ENCRYPTION_VERSION || "V1");
  const rawSecret = process.env[keyName];
  if (!rawSecret) payrollError("Chưa cấu hình " + keyName + ".", "尚未配置 " + keyName + "。", 503);
  const secret = createHmac("sha256", Buffer.from(rawSecret, "base64")).update("payroll-confirmations").digest();
  const confirmation = createHmac("sha256", secret).update(JSON.stringify({ actor, session: input.session_id, draft: meta.id,
    revision: meta.revision, ids, duplicates })).digest("hex");
  if (duplicates.length && input.confirmation !== confirmation)
    payrollError(duplicates.map(p => p.name + " - " + p.email + (p.status === "UNKNOWN" ? " (chưa rõ SMTP đã nhận thư hay chưa)" : " (đã gửi trước đó)")).join(", ") + ". Có gửi lại không?",
      duplicates.map(p => p.name + " - " + p.email).join(", ") + " 已发送，是否重新发送？", 409, { duplicates, confirmation });
  const now = new Date();
  const snapshots: PayrollSnapshot[] = people.map(person => ({
    ...renderPayrollEmail(content.composer, person, content.clock, signature.html, signature.text),
    email: person.email, name: person.name, clock: content.clock, recipient_id: person.id,
  }));
  const preparationPath = await storePayrollPayload(`preparation:${id}:${meta.facility_id}`, snapshots);
  const job: PayrollJobMetadata = { id, facility_id: meta.facility_id, created_by: actor, draft_id: meta.id,
    preparation_path: preparationPath, prepared_count: 0,
    confirmed_receipt_ids: duplicates.map(p => p.receipt),
    session_id: input.session_id, status: "PREPARING", total: people.length, sent: 0, failed: 0, unknown: 0,
    revision: 1, enqueue_pending: true, lease_until: null, lease_token: null,
    created_at: now, updated_at: now, action_time: input.action_time ?? now, sync_time: now, is_deleted: false };
  const created = await createPayrollJobRecord(job);
    if (!created) payrollError("Yêu cầu gửi này đã được tiếp nhận ở tab khác.", "其他标签页已接受此发送请求。", 409);
  await dispatchPayrollJob(id, 1);
  return job;
}
export async function preparePayrollJob(job: PayrollJobMetadata) {
  const snapshots = await readPayrollPayload<PayrollSnapshot[]>(job.preparation_path!, `preparation:${job.id}:${job.facility_id}`);
  const start = job.prepared_count ?? 0; const end = Math.min(start + 25, snapshots.length);
  for (let index = start; index < end; index++) {
    const snapshot = snapshots[index];
    if (await existsPayrollJobItem(job.id, snapshot.recipient_id)) continue;
    const path = await storePayrollPayload(`snapshot:${job.id}:${snapshot.recipient_id}:${job.facility_id}`, snapshot);
    await createPayrollPreparedItem(job.id, snapshot.recipient_id, path, snapshot.email, job.created_by, job.session_id, index);
      }
  await advancePayrollPreparation(job.id, start, end, snapshots.length);
    const next = await getPayrollRecord<PayrollJobMetadata>("jobs", job.id);
  await dispatchPayrollJob(job.id, next!.revision);
}
export async function requirePayrollJob(id: string, actor: string, access: AuthorizationService, action: string) {
  const job = await getPayrollRecord<PayrollJobMetadata>("jobs", id);
  if (!job) payrollError("Không tìm thấy đợt gửi bảng lương.", "找不到工资发送任务。", 404);
  assertPayroll(access, action, job.facility_id);
  if (action !== "notifications.payroll.history.read" && job.created_by !== actor)
    payrollError("Đợt gửi đang thuộc người soạn khác.", "发送任务属于其他用户。", 403);
  return job;
}
export async function getPayrollJobDetails(id: string, actor: string, access: AuthorizationService) {
  const job = await requirePayrollJob(id, actor, access, "notifications.payroll.send");
  const items = await findPayrollJobItems(id);
  const people = await Promise.all(items.map(async item => {
    const snapshot = await readPayrollPayload<PayrollSnapshot>(item.payload_path, `snapshot:${id}:${item.id}:${job.facility_id}`);
    return { id: item.id, status: item.status, error: item.error, name: snapshot.name, email: snapshot.email };
  }));
  return { job, people };
}
export async function retryPayrollItems(id: string, ids: string[], actor: string, access: AuthorizationService) {
  ids = [...new Set(ids)];
  const job = await requirePayrollJob(id, actor, access, "notifications.payroll.send");
  await resetPayrollFailedItems(id, ids, actor, job.facility_id);
    const next = await getPayrollRecord<PayrollJobMetadata>("jobs", id);
  await dispatchPayrollJob(id, next!.revision);
  return next;
}
