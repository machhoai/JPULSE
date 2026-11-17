import { createHash, createHmac } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { zaloMemberRateLimiter } from "../middlewares/rateLimitMiddleware.js";
import { db } from "../../config/firebase.js";
import {
  createZaloMemberConsentStore,
  verifyZaloWebhookSignature,
  zaloConsentEvent,
} from "../../services/zaloMemberConsent.js";
import {
  issueZaloMemberSession,
  readZaloMemberSession,
} from "../../services/zaloMemberSession.js";
import {
  callZaloHkMember,
  findZaloHkMember,
  getZaloHkMemberConfig,
  normalizePhone,
} from "../../services/zaloHkMemberService.js";

const origin = "https://h5.zdn.vn";
export const zaloMemberRoutes: Router = Router();
const consentStore = createZaloMemberConsentStore(db);
zaloMemberRoutes.use((_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});

const token = z.string().min(1).max(4096);
const accessCredentials = z.object({ accessToken: token });
const linkCredentials = accessCredentials.extend({ phoneToken: token });
const profile = z.object({
  name: z.string().trim().min(2).max(100),
  email: z
    .union([z.literal(""), z.string().trim().email().max(150)])
    .optional(),
  birthday: z
    .string()
    .date()
    .refine((date) => date <= new Date().toISOString().slice(0, 10))
    .optional(),
  sex: z.enum(["1", "2", "3"]).optional(),
});
const graphProfile = z.object({
  id: z.string().min(1),
  error: z.literal(0).optional(),
});
const graphPhone = z.object({
  error: z.literal(0),
  data: z.object({ number: z.string() }),
});
const balancePresentation = z.record(
  z.string().regex(/^\d+$/),
  z.object({ label: z.string().trim().min(1), unit: z.string().trim() }),
);

async function graph(path: string, headers: Record<string, string>) {
  const response = await fetch(`https://graph.zalo.me/v2.0/${path}`, {
    headers,
    signal: AbortSignal.timeout(8000),
    redirect: "error",
  });
  if (response.status >= 500 || response.status === 429)
    throw new Error("Zalo unavailable");
  return response.ok ? response.json() : null;
}

function customerResult(
  phone: string,
  member: Awaited<ReturnType<typeof findZaloHkMember>>,
  balanceLabels: z.infer<typeof balancePresentation>,
) {
  if (!member) return { registered: false, phone };
  return {
    registered: true,
    profile: {
      name: member.realName ?? "",
      email: member.email ?? "",
      phone,
      birthday: member.birthday?.slice(0, 10),
      sex: (
        { male: "1", female: "2", "1": "1", "2": "2", "3": "3" } as Record<
          string,
          string
        >
      )[String(member.sex).toLowerCase()],
    },
    accounts: [{
      shopId: member.shopId,
      store: member.shopName,
      level: member.levelName || "Thành viên",
      balances: member.storedValues.map(({ category, value }) => ({
        category,
        label:
          balanceLabels[String(category)]?.label ?? `Số dư loại ${category}`,
        amount: value,
        unit: balanceLabels[String(category)]?.unit ?? "",
      })),
    }],
  };
}

function readBalanceLabels() {
  return balancePresentation.parse(JSON.parse(process.env.ZALO_MEMBER_BALANCE_LABELS || "{}"));
}

async function identifyZaloUser(accessToken: string, secret: string) {
  return graphProfile.safeParse(await graph("me?fields=id", {
    access_token: accessToken,
    appsecret_proof: createHmac("sha256", secret).update(accessToken).digest("hex"),
  }));
}

function bearerToken(request: Request) {
  return request.get("authorization")?.match(/^Bearer (.+)$/i)?.[1] ?? "";
}

function memberEntry(operation: "authenticate" | "link") {
  return async (request: Request, response: Response) => {
    const issuedAt = Date.now();
    const secret = process.env.ZALO_MEMBER_APP_SECRET;
    const appId = process.env.ZALO_MEMBER_MINI_APP_ID;
    const hk = getZaloHkMemberConfig();
    if (!secret || !appId || !hk) {
      response.status(503).json({ code: "NOT_CONFIGURED" });
      return;
    }
    const input = accessCredentials.safeParse(request.body);
    const linkInput = linkCredentials.safeParse(request.body);
    if (!input.success || (operation === "link" && !linkInput.success)) {
      response.status(400).json({ code: "INVALID_INPUT" });
      return;
    }
    try {
      const { accessToken } = input.data;
      const identity = await identifyZaloUser(accessToken, secret);
      if (!identity.success) {
        response.status(401).json({ code: "ZALO_NOT_VERIFIED" });
        return;
      }
      const sub = identity.data.id;
      const isRevoked = () => consentStore.isRevoked(appId, sub, secret, issuedAt);
      const scope = { appId, sub, shopId: hk.shopId };
      if (operation === "authenticate") {
        const link = await consentStore.readLink(appId, sub, secret);
        const member = link?.shopId === hk.shopId ? await findZaloHkMember(hk, link.phone) : null;
        if (await isRevoked()) {
          response.status(401).json({ code: "SESSION_REVOKED" });
          return;
        }
        if (link && member?.uid === link.uid &&
            !await consentStore.isRevoked(appId, sub, secret, link.linkedAt)) {
          const sessionToken = issueZaloMemberSession({ ...scope, phone: link.phone, memberUid: link.uid }, secret, issuedAt);
          response.json({ sessionToken, member: customerResult(link.phone, member, readBalanceLabels()) });
          return;
        }
        response.json({ sessionToken: issueZaloMemberSession(scope, secret, issuedAt), member: null });
        return;
      }

      const session = readZaloMemberSession(bearerToken(request), secret, hk.shopId, appId);
      if (!session || session.sub !== sub || session.phone || !linkInput.success) {
        response.status(401).json({ code: "SESSION_EXPIRED" });
        return;
      }
      const isLinkRevoked = () => consentStore.isRevoked(appId, sub, secret, session.issuedAt);
      if (await isLinkRevoked()) {
        response.status(401).json({ code: "SESSION_REVOKED" });
        return;
      }
      const verified = graphPhone.safeParse(await graph("me/info", {
        access_token: accessToken,
        code: linkInput.data.phoneToken,
        secret_key: secret,
      }));
      const phone = verified.success && normalizePhone(verified.data.data.number);
      if (!phone) {
        response.status(422).json({ code: "PHONE_NOT_VERIFIED" });
        return;
      }
      const member = await findZaloHkMember(hk, phone);
      const result = customerResult(phone, member, readBalanceLabels());
      const saved = !member || await consentStore.saveLink(appId, sub, secret, session.issuedAt,
        { phone, uid: member.uid, shopId: hk.shopId });
      if (!saved || await isLinkRevoked()) {
        response.status(401).json({ code: "SESSION_REVOKED" });
        return;
      }
      response.json({
        sessionToken: issueZaloMemberSession({ ...scope, phone, memberUid: member?.uid }, secret, session.issuedAt),
        member: result,
      });
    } catch {
      response.status(502).json({ code: "MEMBER_SERVICE_UNAVAILABLE" });
    }
  };
}

function handler(operation: "register" | "update") {
  return async (request: Request, response: Response) => {
    const secret = process.env.ZALO_MEMBER_APP_SECRET;
    const appId = process.env.ZALO_MEMBER_MINI_APP_ID;
    const hk = getZaloHkMemberConfig();
    if (!secret || !appId || !hk) {
      response.status(503).json({ code: "NOT_CONFIGURED" });
      return;
    }
    if (
      operation === "register" &&
      process.env.ZALO_MEMBER_REGISTRATION_ENABLED !== "true"
    ) {
      response.status(503).json({ code: "REGISTRATION_UNAVAILABLE" });
      return;
    }
    const details = profile.safeParse(request.body?.profile);
    if (!details.success) {
      response.status(400).json({ code: "INVALID_INPUT" });
      return;
    }
    try {
      const balanceLabels = readBalanceLabels();
      const session = readZaloMemberSession(bearerToken(request), secret, hk.shopId, appId);
      if (!session?.phone || (operation === "update" && !session.memberUid)) {
        response.status(401).json({ code: "SESSION_EXPIRED" });
        return;
      }
      const { phone } = session;
      const isRevoked = () => consentStore.isRevoked(appId, session.sub, secret, session.issuedAt);
      if (await isRevoked()) {
        response.status(401).json({ code: "SESSION_REVOKED" });
        return;
      }
      if (request.body?.expectedPhone !== phone) {
        response.status(409).json({ code: "PHONE_CHANGED" });
        return;
      }

      const current = await findZaloHkMember(hk, phone);
      if (await isRevoked()) {
        response.status(401).json({ code: "SESSION_REVOKED" });
        return;
      }
      if (session.memberUid) {
        const link = await consentStore.readLink(appId, session.sub, secret);
        if (current?.uid !== session.memberUid || link?.uid !== session.memberUid ||
            link.phone !== phone || link.shopId !== hk.shopId) {
          response.status(401).json({ code: "SESSION_EXPIRED" });
          return;
        }
      }
      const confirmLink = async (member: NonNullable<typeof current>) => {
        const saved = await consentStore.saveLink(appId, session.sub, secret, session.issuedAt,
          { phone, uid: member.uid, shopId: hk.shopId });
        return saved ? issueZaloMemberSession({ appId, sub: session.sub,
          phone, memberUid: member.uid, shopId: hk.shopId }, secret, session.issuedAt) : null;
      };
      if (operation === "register" && current) {
        const sessionToken = await confirmLink(current);
        if (!sessionToken) {
          response.status(401).json({ code: "SESSION_REVOKED" });
          return;
        }
        response.json({ ...customerResult(phone, current, balanceLabels), sessionToken });
        return;
      }
      const { name, email, birthday, sex } = details.data;
      let uid = current?.uid;
      let created = false;
      if (operation === "register") {
        try {
          const result = await callZaloHkMember(hk, "member_join", {
            openId: createHash("sha256").update(`jpos-member:${phone}`).digest("hex").slice(0, 28),
            phone,
            realName: name,
          });
          if (result.success !== true)
            throw new Error("Member creation not confirmed");
          const joinedUid = z.object({ uid: z.string().min(1) }).parse(result.data).uid;
          const joined = await findZaloHkMember(hk, phone);
          if (joined?.uid !== joinedUid) {
            response.status(409).json({ code: "PROFILE_INCOMPLETE" });
            return;
          }
          uid = joined.uid;
        } catch (error) {
          const existing = await findZaloHkMember(hk, phone);
          if (!existing) throw error;
          response.status(409).json({ code: "PROFILE_INCOMPLETE" });
          return;
        }
        created = true;
      }
      if (!uid) {
        response.status(409).json({ code: "PROFILE_UNAVAILABLE" });
        return;
      }
      if (!created || email || birthday || sex) {
        try {
          const result = await callZaloHkMember(hk, "member_info_modify", {
            uid,
            realName: name,
            email,
            birthday,
            sex: sex ? Number(sex) : undefined,
          });
          if (result.success !== true || result.data !== true)
            throw new Error("Profile update not confirmed");
        } catch (error) {
          if (!created) throw error;
          response.status(409).json({ code: "PROFILE_INCOMPLETE" });
          return;
        }
      }
      const refreshed = await findZaloHkMember(hk, phone);
      if (await isRevoked()) {
        response.status(401).json({ code: "SESSION_REVOKED" });
        return;
      }
      if (!refreshed || refreshed.uid !== uid) throw new Error("Member not yet available");
      const sessionToken = operation === "register" ? await confirmLink(refreshed) : undefined;
      if (sessionToken === null) {
        response.status(401).json({ code: "SESSION_REVOKED" });
        return;
      }
      const result = customerResult(phone, refreshed, balanceLabels);
      response.json({
        ...result,
        sessionToken,
        profile: {
          ...result.profile,
          email: refreshed.email ?? email ?? "",
          birthday: result.profile?.birthday ?? birthday,
          sex: result.profile?.sex ?? sex,
        },
      });
    } catch {
      response.status(502).json({ code: "MEMBER_SERVICE_UNAVAILABLE" });
    }
  };
}

zaloMemberRoutes.post("/authenticate", zaloMemberRateLimiter, memberEntry("authenticate"));
zaloMemberRoutes.post("/link", zaloMemberRateLimiter, memberEntry("link"));
zaloMemberRoutes.post("/register", zaloMemberRateLimiter, handler("register"));
zaloMemberRoutes.post("/profile", zaloMemberRateLimiter, handler("update"));

zaloMemberRoutes.post("/webhook", async (request, response) => {
  const appId = process.env.ZALO_MEMBER_MINI_APP_ID;
  const apiKey = process.env.ZALO_MEMBER_WEBHOOK_API_KEY;
  const secret = process.env.ZALO_MEMBER_APP_SECRET;
  if (!appId || !apiKey || !secret) {
    response.status(503).json({ code: "NOT_CONFIGURED" });
    return;
  }

  const event = zaloConsentEvent.safeParse(request.body);
  if (!event.success) {
    response.status(400).json({ code: "INVALID_EVENT" });
    return;
  }
  if (
    event.data.appId !== appId ||
    !verifyZaloWebhookSignature(request.body, request.get("x-zevent-signature"), apiKey)
  ) {
    response.status(403).json({ code: "INVALID_SIGNATURE" });
    return;
  }

  try {
    const { userId, timestamp = Date.now() } = event.data;
    await consentStore.revoke(appId, userId, secret, timestamp);
    response.json({ success: true });
  } catch {
    console.error("[zalo-members] Failed to persist consent revocation");
    response.status(503).json({ code: "CONSENT_STORE_UNAVAILABLE" });
  }
});

export const zaloMemberCors = {
  origin,
  methods: ["POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
