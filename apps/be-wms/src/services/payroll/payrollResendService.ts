import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { payrollHistoryResendPolicy, type PayrollJobMetadata, type PayrollSnapshot } from "@bduck/shared-types";
import type { AuthorizationService } from "../authorization/index.js";
import { findPayrollSentRecord } from "../../repositories/payrollQueryRepository.js";
import { getPayrollRecord } from "../../repositories/payrollRepository.js";
import { createPayrollResendRecord } from "../../repositories/payrollResendRepository.js";
import { assertPayroll } from "./payrollAccess.js";
import { emailSchema, payrollId, payrollError } from "./payrollSchemas.js";
import { readPayrollPayload, storePayrollPayload } from "./payrollCrypto.js";
import { assertPayrollDispatcherConfigured, dispatchPayrollJob } from "./payrollTaskDispatcher.js";

const schema = z.object({ email: emailSchema, request_id: payrollId, confirmed: z.boolean(), action_time: z.coerce.date().optional() });
export async function resendPayrollHistory(sourceId: string, body: unknown, actor: string, access: AuthorizationService) {
  const input = schema.parse(body);
  const source = await findPayrollSentRecord(sourceId);
  if (!source) payrollError("Email lịch sử không tồn tại.", "历史邮件不存在。", 404);
  assertPayroll(access, "notifications.payroll.history.read", source.facility_id);
  assertPayroll(access, "notifications.payroll.send", source.facility_id);
  assertPayrollDispatcherConfigured();
  const id = createHash("sha256").update("history-resend:" + actor + ":" + input.request_id).digest("hex");
  const destinationHash = createHash("sha256").update(input.email.trim().toLowerCase()).digest("hex");
  const existing = await getPayrollRecord<PayrollJobMetadata>("jobs", id);
  if (existing) {
    if (existing.created_by !== actor || existing.resend_source_id !== sourceId || existing.resend_destination_hash !== destinationHash)
      payrollError("Mã yêu cầu gửi lại đã được dùng cho email khác.", "重发请求编号已用于其他邮件。", 409);
    if (existing.enqueue_pending) await dispatchPayrollJob(id, existing.revision);
    return existing;
  }
  const policy = payrollHistoryResendPolicy(source);
  if (!policy.allowed) payrollError("Email đang chờ kết quả giao thư, chưa thể gửi lại.", "邮件尚在等待投递结果，暂不能重发。", 409);
  const snapshot = await readPayrollPayload<PayrollSnapshot>(source.payload_path, `snapshot:${source.job_id}:${source.recipient_id}:${source.facility_id}`);
  const email = input.email.trim().toLowerCase();
  const different = email !== snapshot.email.trim().toLowerCase();
  if (policy.requireDifferentEmail && !different)
    payrollError("Địa chỉ cũ bị từ chối hoặc không hợp lệ. Hãy nhập email khác trước khi gửi lại.", "旧地址被拒绝或无效，请输入其他邮箱后重发。", 400);
  if (!input.confirmed) payrollError("Hãy xác nhận tên nhân viên và địa chỉ nhận trước khi gửi lại.", "重发前请确认员工姓名及收件邮箱。", 409);
  const now = new Date();
  const preparation = await storePayrollPayload(`preparation:${id}:${source.facility_id}`, [{ ...snapshot, email }]);
  const job: PayrollJobMetadata = { id, resend_source_id: sourceId, resend_destination_hash: destinationHash, facility_id: source.facility_id, created_by: actor,
    draft_id: sourceId, session_id: randomUUID(), preparation_path: preparation, prepared_count: 0,
    status: "PREPARING", total: 1, sent: 0, failed: 0, unknown: 0, revision: 1, enqueue_pending: true,
    lease_until: null, lease_token: null, is_deleted: false, created_at: now, updated_at: now,
    action_time: input.action_time || now, sync_time: now };
  const created = await createPayrollResendRecord(job, { different, confirmed: input.confirmed });
  if (created.enqueue_pending) await dispatchPayrollJob(created.id, created.revision);
  return created;
}
