import { renderPayrollEmail, type EmailSignature, type PayrollSnapshot } from "@bduck/shared-types";
import type { AuthorizationService } from "../authorization/index.js";
import { getPayrollRecord } from "../../repositories/payrollRepository.js";
import { readPayrollDraft, readPayrollRecipient } from "./payrollManagementService.js";
import { sanitizePayrollSignature } from "./payrollHtml.js";
import { emailSchema, payrollError } from "./payrollSchemas.js";
export async function buildPayrollSnapshot(draftId: string, personId: string, actor: string,
  access: AuthorizationService, action: string): Promise<PayrollSnapshot> {
  const { meta, content } = await readPayrollDraft(draftId, actor, access, action);
  const person = await readPayrollRecipient(meta, personId);
  if (!emailSchema.safeParse(person.email).success) payrollError(`${person.name}: email thiếu hoặc không hợp lệ tại dòng ${person.source.row}, sheet ${person.source.sheet}, file ${person.source.file}. Hãy sửa email hoặc bỏ chọn người này.`, `${person.name}：${person.source.file} / ${person.source.sheet} / ${person.source.row} 的邮箱缺失或无效，请修改或取消选择。`);
  const unresolved = person.issues.filter(i => i.severity === "ERROR" && i.code !== "MISSING_EMAIL" && i.code !== "DUPLICATE_EMAIL");
  if (unresolved.length) payrollError(unresolved.map(i => i.messages.vi).join("\n"), unresolved.map(i => i.messages.zh).join("\n"));
  let signatureHtml = sanitizePayrollSignature(process.env.BREVO_EMAIL_SIGNATURE_HTML || "");
  let signatureText = process.env.BREVO_EMAIL_SIGNATURE_TEXT || "";
  if (content.composer.signature_id) {
    const signature = await getPayrollRecord<EmailSignature>("signatures", content.composer.signature_id);
    if (!signature) payrollError("Chữ ký của mẫu đã bị xóa. Hãy chọn chữ ký mặc định hoặc chữ ký khác và lưu lại.",
      "模板签名已删除，请选择默认签名或其他签名并保存。", 409);
    signatureHtml = signature.html; signatureText = signature.text;
  }
  const rendered = renderPayrollEmail(content.composer, person, content.clock, signatureHtml, signatureText);
  return { ...rendered, name: person.name, email: person.email, clock: content.clock, recipient_id: person.id };
}
