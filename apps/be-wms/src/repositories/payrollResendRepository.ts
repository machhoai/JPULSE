import { payrollHistoryResendPolicy, payrollHistoryAttempt, type PayrollJobMetadata } from "@bduck/shared-types";
import { db } from "../config/firebase.js";
import { payrollRef, writePayrollAudit } from "./payrollRepository.js";
import { payrollHistoryId, touchPayrollHistory } from "./payrollHistoryRepository.js";
import { payrollError } from "../services/payroll/payrollSchemas.js";

export async function createPayrollResendRecord(job: PayrollJobMetadata, options: { different: boolean; confirmed: boolean }) {
  return db.runTransaction(async tx => {
    const jobRef = payrollRef("jobs", job.id), sourceRef = payrollRef("history", job.resend_source_id!);
    const [existing, source] = await Promise.all([tx.get(jobRef), tx.get(sourceRef)]);
    if (existing.exists) {
      if (existing.get("created_by") !== job.created_by || existing.get("resend_source_id") !== job.resend_source_id || existing.get("resend_destination_hash") !== job.resend_destination_hash)
        payrollError("Mã yêu cầu gửi lại đã được dùng cho email khác.", "重发请求编号已用于其他邮件。", 409);
      return existing.data() as PayrollJobMetadata;
    }
    if (!source.exists || source.get("is_deleted") || source.get("facility_id") !== job.facility_id)
      payrollError("Email gốc không còn khả dụng tại cửa hàng này.", "此门店的原邮件已不可用。", 409);
    const policy = payrollHistoryResendPolicy(source.data()!);
    if (!policy.allowed) payrollError("Email này đang chờ kết quả giao thư. Chưa thể gửi lại để tránh gửi trùng.", "此邮件尚在等待投递结果，为避免重复发送暂不能重发。", 409);
    if (policy.requireDifferentEmail && !options.different)
      payrollError("Địa chỉ cũ bị từ chối hoặc không hợp lệ. Hãy nhập email khác trước khi gửi lại.", "旧地址被拒绝或无效，请输入其他邮箱后重发。", 400);
    if (!options.confirmed) payrollError("Hãy xác nhận tên nhân viên và địa chỉ nhận trước khi gửi lại.", "重发前请确认员工姓名及收件邮箱。", 409);
    const originalItem = await tx.get(payrollRef("jobs", source.get("job_id")).collection("items").doc(source.get("recipient_id")));
    const sourceAttempt = payrollHistoryAttempt({ id: sourceRef.id, job_id: source.get("job_id"), recipient_id: source.get("recipient_id"), attempt: source.get("attempt") });
    if (sourceAttempt === null) payrollError("Không xác định được lần thử của email lịch sử này. Hãy liên hệ quản trị viên để đối chiếu dữ liệu trước khi gửi lại.", "无法确定此历史邮件的尝试次数，请联系管理员核对数据后重发。", 409);
    if (originalItem.exists && (["QUEUED", "PROCESSING"].includes(originalItem.get("status")) || originalItem.get("attempt") !== sourceAttempt))
      payrollError("Đợt gốc đang gửi tiếp hoặc đã có lần thử mới hơn. Hãy mở lịch sử lần gửi mới nhất để đối chiếu.", "原任务仍在发送或已有更新的尝试，请查看最新发送记录。", 409);
    const activeId = source.get("resend_job_id") as string | undefined;
    if (activeId) {
      const active = await tx.get(payrollRef("jobs", activeId));
      if (active.exists) {
        if (["PREPARING", "QUEUED", "PROCESSING"].includes(active.get("status")))
          payrollError("Một lần gửi lại email này đang xử lý ở nền. Hãy chờ kết quả, không tạo thêm lần gửi.", "此邮件的重发任务正在后台处理，请等待结果。", 409);
        const items = await tx.get(active.ref.collection("items").limit(1));
        if (!items.empty) {
          const item = items.docs[0];
          const history = await tx.get(payrollRef("history", payrollHistoryId(activeId, item.id, item.get("attempt"))));
          if (!history.exists || !payrollHistoryResendPolicy(history.data()!).allowed)
            payrollError("Lần gửi lại gần nhất đang chờ kết quả giao thư. Hãy chờ trước khi gửi tiếp.", "最近的重发仍在等待投递结果，请等待后再发送。", 409);
        }
      }
    }
    tx.create(jobRef, job);
    const patch = { resend_job_id: job.id, updated_at: new Date(), sync_time: new Date() };
    tx.update(sourceRef, patch); touchPayrollHistory(tx, job.facility_id);
    writePayrollAudit(tx, "payroll_email_jobs", job.id, job.created_by, job.facility_id, null, { ...job });
    writePayrollAudit(tx, "payroll_email_sent_records", sourceRef.id, job.created_by, job.facility_id, source.data()!, { ...source.data(), ...patch });
    return job;
  });
}
