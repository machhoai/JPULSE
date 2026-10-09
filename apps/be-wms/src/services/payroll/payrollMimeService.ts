import nodemailer from "nodemailer";
import type { PayrollSnapshot } from "@bduck/shared-types";
import { payrollError } from "./payrollSchemas.js";
const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows" });
export async function createPayrollMime(snapshot: PayrollSnapshot, options?: { date?: Date; messageId?: string | null }) {
  const sender = process.env.BREVO_SENDER_EMAIL;
  if (!sender) payrollError("Chưa cấu hình địa chỉ gửi BREVO_SENDER_EMAIL để dựng email tải xuống.", "尚未配置发件人 BREVO_SENDER_EMAIL。", 503);
  const result = await transport.sendMail({ from: { name: process.env.BREVO_SENDER_NAME || "J-PULSE", address: sender },
    to: snapshot.email, subject: snapshot.subject, html: snapshot.html, text: snapshot.text,
    date: options?.date, messageId: options?.messageId || undefined });
  return result.message as Buffer;
}
