import { createHash, randomBytes } from "node:crypto";

import { z } from "zod";

export const SHORTCUT_TOKEN_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
export const SHORTCUT_PAIRING_LIFETIME_MS = 5 * 60 * 1000;
export const SHORTCUT_WARNING_MS = 7 * 24 * 60 * 60 * 1000;
export const newShortcutSecret = () => randomBytes(32).toString("base64url");
export const hashShortcutSecret = (secret: string) =>
  createHash("sha256").update(secret).digest("hex");
export const shortcutSecretSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
// Shortcuts can serialize a numeric Location detail as localized decimal text.
// Accept only a single decimal coordinate, never empty/null/boolean or a list.
const shortcutCoordinate = (min: number, max: number) =>
  z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const decimal = value.trim();
    return /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(decimal)
      ? Number(decimal.replace(",", "."))
      : value;
  }, z.number().min(min).max(max));
export const shortcutCheckInSchema = z
  .object({
    location: z
      .object({
        latitude: shortcutCoordinate(-90, 90),
        longitude: shortcutCoordinate(-180, 180),
        accuracy_m: z.number().positive().max(10_000).optional(),
        captured_at: z.string().datetime(),
      })
      .optional(),
  })
  .strict();

export class ShortcutCredentialError extends Error {
  readonly statusCode = 401;
  readonly messages: { vi: string; zh: string };
  constructor(
    message = "Phiên đăng nhập Shortcut không hợp lệ hoặc đã hết hạn. Vào trang chấm công để cập nhật kết nối.",
  ) {
    super(message);
    this.messages = {
      vi: message,
      zh: "快捷指令连接无效或已过期，请进入考勤页面重新连接。",
    };
  }
}

export const isShortcutExpiringSoon = (expiresAt: number, now = Date.now()) =>
  expiresAt > now && expiresAt - now < SHORTCUT_WARNING_MS;

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );

export function renderShortcutResult(input: {
  success: boolean;
  message: string;
  checkedInAt?: Date;
  expiresAt?: number;
  now?: number;
}) {
  const warning =
    input.expiresAt !== undefined &&
    isShortcutExpiringSoon(input.expiresAt, input.now);
  const time = input.checkedInAt
    ? new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour12: false,
      }).format(input.checkedInAt)
    : "";
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Kết quả chấm công</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f4f7fb;color:#172033;font-family:system-ui,-apple-system,sans-serif}main{width:100%;max-width:420px;background:white;border-radius:28px;padding:36px 24px;text-align:center;box-shadow:0 16px 60px #15244b12}.icon{width:84px;height:84px;margin:0 auto 24px;border-radius:50%;display:grid;place-items:center;font-size:48px;font-weight:700;background:${input.success ? "#dcfce7;color:#15803d" : "#fee2e2;color:#dc2626"}}h1{font-size:23px}p{line-height:1.6;overflow-wrap:anywhere}time{display:block;font-size:21px;font-weight:600;margin:20px 0}.warning{padding:16px;background:#fffbeb;color:#92400e;border-radius:16px;font-size:14px}.brand{font-size:12px;color:#64748b;margin-top:28px}</style></head><body><main>
  <div class="icon" aria-hidden="true">${input.success ? "✓" : "✕"}</div><h1>${input.success ? "Chấm công thành công" : "Chấm công thất bại"}</h1>
  ${time ? `<time>${escapeHtml(time)}</time>` : ""}<p>${escapeHtml(input.message)}</p>
  ${warning ? '<p class="warning">Phiên đăng nhập Shortcut còn dưới 7 ngày. Vui lòng vào trang chấm công /attendance để cập nhật phiên đăng nhập của Shortcut.</p>' : ""}
  <p class="brand">BDuck · Chấm công</p></main></body></html>`;
}
