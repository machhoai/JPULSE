import nodemailer from "nodemailer";

import { applyBrevoEmailSignature } from "./brevoEmailSignature.js";

export interface BrevoEmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
  contentDisposition?: "attachment" | "inline";
  cid?: string;
}

interface SendBrevoEmailInput {
  /** false: payroll snapshot already includes its selected signature. */
  signature?: false | { html: string; text: string };
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  htmlContent: string;
  textContent: string;
  attachments?: BrevoEmailAttachment[];
  messageId?: string;
}

interface BrevoEmailResult {
  messageId: string | null;
}

function getBrevoConfig() {
  const apiKey = process.env.BREVO_API_KEY; // This is used as the SMTP password
  const smtpLogin = process.env.BREVO_SMTP_LOGIN;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "J-PULSE";

  if (!apiKey || !smtpLogin || !senderEmail) {
    throw {
      statusCode: 500,
      messages: {
        vi: "Chưa cấu hình đầy đủ thông tin SMTP Brevo.",
        zh: "Brevo SMTP 配置不完整。",
      },
    };
  }

  return { apiKey, smtpLogin, senderEmail, senderName };
}

export async function sendBrevoEmail(
  input: SendBrevoEmailInput,
): Promise<BrevoEmailResult> {
  const { apiKey, smtpLogin, senderEmail, senderName } = getBrevoConfig();

  const transporter = nodemailer.createTransport({
    ...(input.signature === false ? { connectionTimeout: 30000, greetingTimeout: 30000, socketTimeout: 60000 } : {}),
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: smtpLogin,
      pass: apiKey,
    },
  });

  const signatureHtml = input.signature === false ? "" : input.signature?.html ?? process.env.BREVO_EMAIL_SIGNATURE_HTML ?? "";
  const signatureText = input.signature === false ? "" : input.signature?.text ?? process.env.BREVO_EMAIL_SIGNATURE_TEXT ?? "";

  const finalContent = applyBrevoEmailSignature(
    input.htmlContent,
    input.textContent,
    signatureHtml,
    signatureText,
  );

  try {
    const info = await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: input.to.join(", "),
      cc: input.cc ? input.cc.join(", ") : undefined,
      bcc: input.bcc ? input.bcc.join(", ") : undefined,
      subject: input.subject,
      text: finalContent.textContent,
      html: finalContent.htmlContent,
      attachments: input.attachments,
      messageId: input.messageId,
    });

    return { messageId: info.messageId };
  } catch (error: unknown) {
    if (input.signature === false) console.error("PAYROLL_SMTP_FAILED", { code: (error as { code?: string }).code });
    else console.error("Nodemailer SMTP Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    throw {
      statusCode: 502,
      code: (error as { code?: string }).code,
      responseCode: (error as { responseCode?: number }).responseCode,
      messages: {
        vi: `Brevo SMTP gửi email thất bại: ${message}`,
        zh: `Brevo SMTP 邮件发送失败：${message}`,
      },
    };
  }
}
