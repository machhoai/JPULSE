import { softRemovePayrollCatalog, writePayrollRecipient } from "../../repositories/payrollManagementRepository.js";
import { findPayrollCatalogRecords, findPayrollFacilityRecord, findPayrollRecipientRecord, findPayrollRecipientPage } from "../../repositories/payrollQueryRepository.js";
import type { EmailSignature, PayrollEmailTemplate, PayrollDraftMetadata, PayrollDraftContent, PayrollRecipient } from "@bduck/shared-types";
import type { AuthorizationService } from "../authorization/index.js";
import { getPayrollRecord, savePayrollRecord } from "../../repositories/payrollRepository.js";
import { storePayrollPayload, readPayrollPayload } from "./payrollCrypto.js";
import { assertPayroll, assertPayrollGlobal } from "./payrollAccess.js";
import { sanitizePayrollSignature, payrollPlainText } from "./payrollHtml.js";
import { payrollError, templateSchema, signatureSchema, draftSchema, recipientSchema } from "./payrollSchemas.js";
import { createHash } from "node:crypto";
const useActions = ["notifications.payroll.compose", "notifications.payroll.download", "notifications.payroll.send", "notifications.payroll.history.read", "notifications.payroll.templates.manage"];
export async function listPayrollCatalog(access: AuthorizationService) {
  assertPayrollGlobal(access, [...useActions, "notifications.email_signatures.manage"]);
  const records = await findPayrollCatalogRecords();
  return { ...records,
    default_signature: { html: sanitizePayrollSignature(process.env.BREVO_EMAIL_SIGNATURE_HTML || ""),
      text: process.env.BREVO_EMAIL_SIGNATURE_TEXT || "" } };
}
export async function savePayrollTemplate(id: string, body: unknown, actor: string, access: AuthorizationService) {
  const input = templateSchema.parse(body);
  assertPayroll(access, "notifications.payroll.templates.manage", input.facility_id);
  const old = await getPayrollRecord<PayrollEmailTemplate>("templates", id);
  if (old) assertPayroll(access, "notifications.payroll.templates.manage", old.facility_id);
  const store = await findPayrollFacilityRecord(input.facility_id);
  if (!store || store.is_deleted === true || store.type !== "STORE") payrollError("Cửa hàng của mẫu không tồn tại hoặc không phải cửa hàng.", "模板门店不存在或不是门店类型。");
  return savePayrollRecord("templates", id, input, input.revision, actor, input.facility_id);
}
export async function savePayrollSignature(id: string, body: unknown, actor: string, access: AuthorizationService) {
  assertPayrollGlobal(access, ["notifications.email_signatures.manage"]);
  const input = signatureSchema.parse(body); const html = sanitizePayrollSignature(input.html);
  if (input.html.trim() && !html.trim()) payrollError("Chữ ký không có nội dung HTML hợp lệ sau khi lọc. Dùng đoạn văn, bảng, liên kết hoặc ảnh HTTPS; không dùng script.", "过滤后签名没有有效 HTML 内容，请使用段落、表格、链接或 HTTPS 图片，不要使用脚本。");
  return savePayrollRecord("signatures", id, { ...input, html, text: payrollPlainText(html) }, input.revision, actor, null);
}
export async function removePayrollCatalog(kind: "templates" | "signatures", id: string, actor: string, access: AuthorizationService) {
  const old = await getPayrollRecord<PayrollEmailTemplate | EmailSignature>(kind, id);
  if (!old) payrollError("Mẫu/chữ ký không còn tồn tại.", "模板或签名不存在。", 404);
  if (kind === "templates") assertPayroll(access, "notifications.payroll.templates.manage", (old as PayrollEmailTemplate).facility_id);
  else assertPayrollGlobal(access, ["notifications.email_signatures.manage"]);
  await softRemovePayrollCatalog(kind, id, actor, old);
}
export async function requirePayrollDraft(id: string, actor: string, access: AuthorizationService, action = "notifications.payroll.compose") {
  const draft = await getPayrollRecord<PayrollDraftMetadata>("drafts", id);
  if (!draft) payrollError("Bản nháp bảng lương không tồn tại.", "工资草稿不存在。", 404);
  assertPayroll(access, action, draft.facility_id);
  if (draft.created_by !== actor) payrollError("Bản nháp này thuộc người soạn khác.", "此草稿属于其他用户。", 403);
  return draft;
}
export async function savePayrollDraft(id: string, body: unknown, actor: string, access: AuthorizationService) {
  const input = draftSchema.parse(body);
  const template = await getPayrollRecord<PayrollEmailTemplate>("templates", input.template_id);
  if (!template) payrollError("Mẫu đã bị xóa. Hãy chọn mẫu khác trước khi lưu.", "模板已被删除，请选择其他模板。", 404);
  assertPayroll(access, "notifications.payroll.compose", template.facility_id);
  const old = await getPayrollRecord<PayrollDraftMetadata>("drafts", id);
  if (old) { await requirePayrollDraft(id, actor, access);
    if (old.facility_id !== template.facility_id) payrollError("Đổi cửa hàng phải tạo bản nháp mới.", "更改门店需要创建新草稿。"); }
  const context = `draft:${id}:${template.facility_id}:${actor}`;
  const path = await storePayrollPayload(context, { composer: input.composer, template_id: input.template_id, name: input.name, clock: input.clock, recipient_ids: input.recipient_ids ?? [] });
  return savePayrollRecord("drafts", id, { name: input.name, facility_id: template.facility_id, template_id: input.template_id,
    payload_path: path, action_time: input.action_time ?? new Date() }, input.revision, actor, template.facility_id);
}
export async function readPayrollDraft(id: string, actor: string, access: AuthorizationService, action?: string) {
  const meta = await requirePayrollDraft(id, actor, access, action);
  const content = await readPayrollPayload<PayrollDraftContent>(meta.payload_path, `draft:${id}:${meta.facility_id}:${actor}`);
  return { meta, content };
}
export async function savePayrollRecipient(draftId: string, id: string, body: unknown, actor: string, access: AuthorizationService) {
  const draft = await requirePayrollDraft(draftId, actor, access);
  const { action_time, ...person } = recipientSchema.parse(body);
  if (person.draft_revision !== draft.revision) payrollError("Bản nháp đã đổi trong lúc lưu người nhận. Hãy lưu lại toàn bộ bản nháp.", "保存收件人时草稿已更改，请重新保存整个草稿。", 409);
  if (person.id !== id) payrollError("Mã người nhận không khớp bản ghi.", "收件人编号不匹配。");
  const path = await storePayrollPayload(`recipient:${draftId}:${id}:${draft.facility_id}`, person);
  const payloadHash = createHash("sha256").update(JSON.stringify(person)).digest("hex");
  await writePayrollRecipient(draft, id, path, payloadHash, actor, action_time);
  return { id };
}
export async function readPayrollRecipient(draft: PayrollDraftMetadata, id: string) {
  const doc = await findPayrollRecipientRecord(draft.id, id);
  if (!doc || doc.draft_revision !== draft.revision) payrollError("Dữ liệu người nhận chưa lưu xong ở phiên bản bản nháp này. Hãy lưu lại toàn bộ bản nháp trước.", "此草稿版本的收件人数据尚未保存完成，请先重新保存整个草稿。", 409);
  return readPayrollPayload<PayrollRecipient>(doc.payload_path, `recipient:${draft.id}:${id}:${draft.facility_id}`);
}
export async function listPayrollRecipients(draftId: string, actor: string, access: AuthorizationService, after?: string) {
  const draft = await requirePayrollDraft(draftId, actor, access);
  const page = await findPayrollRecipientPage(draftId, draft.revision, after);
  return { people: await Promise.all(page.entries.map(doc => readPayrollPayload<PayrollRecipient>(doc.payload_path, "recipient:" + draftId + ":" + doc.id + ":" + draft.facility_id))), cursor: page.cursor };
}
