import nodemailer from "nodemailer";
import net from "node:net";
import tls from "node:tls";
const originalTransport = nodemailer.createTransport.bind(nodemailer);
export const mailSafety = { realSmtpCreated: 0, blockedSmtp: 0, blockedNetwork: 0 };
nodemailer.createTransport = (options, defaults) => {
  if (options && typeof options === "object" && options.streamTransport === true)
    return originalTransport(options, defaults);
  mailSafety.blockedSmtp++;
  throw new Error("REAL_SMTP_BLOCKED_BY_PAYROLL_TEST_GUARD");
};
function localOnly(original) {
  return function (...args) {
    const first = args[0];
    const host = typeof first === "object" ? first.host || first.hostname :
      typeof args[1] === "string" ? args[1] : "localhost";
    if (!["localhost", "127.0.0.1", "::1"].includes(host || "localhost")) {
      mailSafety.blockedNetwork++; throw new Error("EXTERNAL_NETWORK_BLOCKED_BY_PAYROLL_TEST_GUARD");
    }
    return original.apply(this, args);
  };
}
net.connect = localOnly(net.connect);
net.createConnection = localOnly(net.createConnection);
tls.connect = localOnly(tls.connect);
process.env.BREVO_API_KEY = "QA-NOT-A-REAL-KEY";
process.env.BREVO_SMTP_LOGIN = "qa-only";
process.env.BREVO_SENDER_EMAIL = "sender@example.invalid";
process.env.BREVO_SENDER_NAME = "Payroll QA";
