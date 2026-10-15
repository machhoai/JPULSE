import "./noMailGuard.mjs";
import assert from "node:assert/strict";
import test, { mock } from "node:test";

let result = { messageId: "<mock@example.invalid>", accepted: ["employee@example.invalid"], rejected: [] };
const messages = [];
mock.module("nodemailer", { defaultExport: { createTransport: () => ({ sendMail: async message => { messages.push(message); return result; } }) } });
const { sendBrevoEmail } = await import("../../dist/services/brevoEmailService.js");

test("PAY-ROUTING SMTP: actual transport receives separate reply, CC, BCC headers; primary rejection is failure", async () => {
  const input = { to: ["employee@example.invalid"], cc: ["copy@example.invalid"], bcc: ["hidden@example.invalid"], replyTo: "reply@example.invalid", subject: "QA", htmlContent: "<p>QA</p>", textContent: "QA", signature: false };
  await sendBrevoEmail(input);
  assert.equal(messages[0].replyTo, input.replyTo);
  assert.equal(messages[0].cc, input.cc[0]); assert.equal(messages[0].bcc, input.bcc[0]);
  result = { ...result, accepted: input.cc, rejected: input.to };
  await assert.rejects(sendBrevoEmail(input), error => error.code === "EENVELOPE" && error.responseCode === undefined);
  result = { ...result, accepted: input.to, rejected: input.cc };
  await sendBrevoEmail(input);
});
