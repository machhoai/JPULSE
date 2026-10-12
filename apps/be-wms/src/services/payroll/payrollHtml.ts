import { PAYROLL_SIGNATURE_POLICY } from "@bduck/shared-types";
import sanitizeHtml from "sanitize-html";
export function sanitizePayrollSignature(html: string) {
  return sanitizeHtml(html, PAYROLL_SIGNATURE_POLICY);
}
export function payrollPlainText(html: string) {
  return sanitizeHtml(html.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/p>/gi, "\n"), { allowedTags: [], allowedAttributes: {} });
}
