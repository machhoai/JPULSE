import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { storage } from "../../config/firebase.js";
import { payrollError } from "./payrollSchemas.js";
function key(version: string) {
  const raw = process.env[`PAYROLL_ENCRYPTION_KEY_${version}`];
  const result = Buffer.from(raw ?? "", "base64");
  if (result.length !== 32) payrollError(`Chưa cấu hình khóa mã hóa bảng lương phiên bản ${version} (32 byte base64).`,
    `工资加密密钥版本 ${version} 未配置（32 字节 base64）。`, 503);
  return result;
}
export async function storePayrollPayload(context: string, value: unknown) {
  const version = process.env.PAYROLL_ENCRYPTION_VERSION || "V1";
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(version), iv);
  cipher.setAAD(Buffer.from(context));
  const bytes = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const envelope = { version, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: bytes.toString("base64") };
  const path = `payroll-private/${randomUUID()}.json`;
  try { await storage.bucket().file(path).save(JSON.stringify(envelope), { resumable: false,
    contentType: "application/octet-stream", metadata: { cacheControl: "private,no-store" } }); }
  catch (error) { const code = (error as { code?: number }).code;
    payrollError(`Không thể ghi dữ liệu bảng lương đã mã hóa vào Storage (mã ${code ?? "kết nối"}). Kiểm tra FIREBASE_STORAGE_BUCKET và quyền ghi của tài khoản dịch vụ.`, `无法将加密工资数据写入 Storage（代码 ${code ?? "连接"}），请检查存储桶和服务账户写入权限。`, 503); }
  return path;
}
export async function readPayrollPayload<T>(path: string, context: string): Promise<T> {
  if (!/^payroll-private\/[a-f0-9-]+\.json$/.test(path)) throw new Error("INVALID_PAYROLL_PAYLOAD_PATH");
  let bytes: Buffer;
  try { [bytes] = await storage.bucket().file(path).download(); }
  catch (error) { const code = (error as { code?: number }).code;
    payrollError(`Không thể đọc dữ liệu bảng lương đã lưu (Storage mã ${code ?? "kết nối"}). Liên hệ quản trị viên kiểm tra tệp mã hóa và quyền đọc Storage.`, `无法读取已保存工资数据（Storage 代码 ${code ?? "连接"}），请管理员检查加密文件和读取权限。`, 503); }
  const e = JSON.parse(bytes.toString("utf8")) as { version: string; iv: string; tag: string; data: string };
  const encryptionKey = key(e.version);
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(e.iv, "base64"));
    decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(Buffer.from(e.tag, "base64"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(e.data, "base64")), decipher.final()]).toString("utf8")) as T;
  } catch { payrollError(`Không xác thực được dữ liệu bảng lương đã mã hóa (khóa ${e.version}). Giữ nguyên bản nháp và liên hệ quản trị viên kiểm tra phiên bản khóa hoặc tính toàn vẹn dữ liệu.`, `无法验证加密工资数据（密钥 ${e.version}），请保留草稿并联系管理员检查密钥版本或数据完整性。`, 409); }
}
