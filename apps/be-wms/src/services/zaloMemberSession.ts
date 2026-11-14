import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const zaloMemberSessionLifetimeMs = 15 * 60_000;
const claims = z.object({
  appId: z.string().min(1),
  sub: z.string().min(1),
  phone: z.string().regex(/^0\d{9}$/),
  shopId: z.number().int().positive(),
  issuedAt: z.number().int(),
  expires: z.number().int(),
});

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`jpulse:zalo-member:v3:${payload}`)
    .digest();
}

export function issueZaloMemberSession(
  identity: Omit<z.infer<typeof claims>, "expires" | "issuedAt">,
  secret: string,
  issuedAt: number,
) {
  const payload = Buffer.from(
    JSON.stringify({ ...identity, issuedAt, expires: issuedAt + zaloMemberSessionLifetimeMs }),
  ).toString("base64url");
  return `${payload}.${signature(payload, secret).toString("base64url")}`;
}

export function readZaloMemberSession(
  token: string,
  secret: string,
  shopId: number,
  appId: string,
) {
  const parts = token.match(/^([\w-]+)\.([\w-]{43})$/);
  if (!parts || token.length > 4096) return null;
  const [, payload, mac] = parts;
  const actual = Buffer.from(mac, "base64url");
  const expected = signature(payload, secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null;
  try {
    const result = claims.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    if (
      result.success &&
      result.data.expires > Date.now() &&
      result.data.appId === appId &&
      result.data.shopId === shopId
    ) {
      return result.data;
    }
  } catch {
    return null;
  }
  return null;
}
