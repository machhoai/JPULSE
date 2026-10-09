import { CloudTasksClient } from "@google-cloud/tasks";
import { OAuth2Client } from "google-auth-library";
import type { Request } from "express";
import { findPayrollPendingJobs, markPayrollDispatch, bumpPayrollDispatchRevision } from "../../repositories/payrollQueryRepository.js";
import { payrollError } from "./payrollSchemas.js";
import { getRequestLocalFirebaseTarget, runWithLocalFirebaseTarget, LOCAL_FIREBASE_TARGETS } from "../../config/firebaseTargetContext.js";
import { defaultLocalFirebaseTarget, isLocalFirebaseTargetConfigured } from "../../config/firebase.js";
const client = new CloudTasksClient(); const oidc = new OAuth2Client();
const active = new Set<string>();
const config = () => ({ project: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID || "",
  location: process.env.PAYROLL_TASK_LOCATION || "", queue: process.env.PAYROLL_TASK_QUEUE || "",
  base: (process.env.PAYROLL_WORKER_BASE_URL || "").replace(/\/+$/, ""), account: process.env.PAYROLL_WORKER_SERVICE_ACCOUNT || "" });
export function assertPayrollDispatcherConfigured() {
  const c = config();
  if (process.env.NODE_ENV === "production" && !(c.project && c.location && c.queue && c.base && c.account))
    payrollError("Chưa cấu hình queue gửi bảng lương: cần PAYROLL_TASK_LOCATION, PAYROLL_TASK_QUEUE, PAYROLL_WORKER_BASE_URL và PAYROLL_WORKER_SERVICE_ACCOUNT.",
      "工资发送队列尚未配置：请设置队列位置、名称、工作器地址和服务账户。", 503);
}
export async function authenticatePayrollWorker(req: Request) {
  const c = config(); const token = req.header("authorization")?.replace(/^Bearer /, "");
  if (!token || !c.base || !c.account) payrollError("Worker bảng lương thiếu xác thực OIDC.", "工资工作器缺少 OIDC 验证。", 401);
  const result = await oidc.verifyIdToken({ idToken: token, audience: c.base }).catch(() =>
    payrollError("Token OIDC của worker không xác thực được. Kiểm tra audience và tài khoản dịch vụ queue.", "无法验证工作器 OIDC 令牌，请检查 audience 和队列服务账户。", 401));
  const payload = result.getPayload();
  if (payload?.email !== c.account || payload.email_verified !== true || !["accounts.google.com", "https://accounts.google.com"].includes(payload.iss!))
    payrollError("Danh tính worker bảng lương không hợp lệ.", "工资工作器身份无效。", 403);
}
export async function dispatchPayrollJob(id: string, revision: number, delaySeconds = 0) {
  assertPayrollDispatcherConfigured();
  if (process.env.NODE_ENV !== "production") {
    const target = getRequestLocalFirebaseTarget(defaultLocalFirebaseTarget); const key = target + ":" + id;
    if (!active.has(key)) { active.add(key); setTimeout(() => {
      void runWithLocalFirebaseTarget(target, async () => {
        const { processPayrollJob } = await import("./payrollWorker.js"); await processPayrollJob(id);
      }).catch(() => console.error("PAYROLL_LOCAL_WORKER_FAILED", { job_id: id })).finally(() => active.delete(key));
    }, delaySeconds * 1000); }
    return;
  }
  const c = config(); const parent = client.queuePath(c.project, c.location, c.queue);
  try { await client.createTask({ parent, task: { name: client.taskPath(c.project, c.location, c.queue, `payroll-${id}-r${revision}`),
    scheduleTime: { seconds: Math.floor(Date.now() / 1000) + delaySeconds },
    httpRequest: { httpMethod: "POST", url: c.base + "/api/notifications/payroll/internal/jobs/" + id,
      headers: { "Content-Type": "application/json" }, body: Buffer.from("{}").toString("base64"),
      oidcToken: { serviceAccountEmail: c.account, audience: c.base } } } });
  } catch (error) { if ((error as { code?: number }).code !== 6) throw error; }
  await markPayrollDispatch(id, revision);
}
export async function recoverPayrollJobs() {
  const docs = await findPayrollPendingJobs();
  for (const doc of docs) {
    // Fresh task ID also recovers a task whose previous name remains deduplicated.
    const revision = await bumpPayrollDispatchRevision(doc.id);
    if (revision === null) continue;
    await dispatchPayrollJob(doc.id, revision);
  }
}
export function startPayrollRecovery() {
  if (process.env.NODE_ENV === "production") return;
  const tick = async () => {
    for (const target of LOCAL_FIREBASE_TARGETS.filter(isLocalFirebaseTargetConfigured))
      await runWithLocalFirebaseTarget(target, recoverPayrollJobs);
  };
  const timer = setInterval(() => void tick().catch(() => console.error("PAYROLL_RECOVERY_FAILED")), 15000);
  timer.unref();
}
