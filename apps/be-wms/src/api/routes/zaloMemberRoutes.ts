import { createHash, createHmac } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { zaloMemberRateLimiter } from "../middlewares/rateLimitMiddleware.js";
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
zaloMemberRoutes.use((_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});

const credentials = z.object({
  accessToken: z.string().min(1).max(4096),
  phoneToken: z.string().min(1).max(4096),
  expectedPhone: z
    .string()
    .regex(/^0\d{9}$/)
    .optional(),
});
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

function handler(operation: "lookup" | "register" | "update") {
  return async (request: Request, response: Response) => {
    const secret = process.env.ZALO_MEMBER_APP_SECRET;
    const hk = getZaloHkMemberConfig();
    if (!secret || !hk) {
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
    const input = credentials.safeParse(request.body);
    const bearer = request.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    const details = profile.safeParse(request.body?.profile);
    if (
      (!bearer && !input.success) ||
      (operation !== "lookup" && !details.success)
    ) {
      response.status(400).json({ code: "INVALID_INPUT" });
      return;
    }
    try {
      const balanceLabels = balancePresentation.parse(
        JSON.parse(process.env.ZALO_MEMBER_BALANCE_LABELS || "{}"),
      );
      let session = bearer
        ? readZaloMemberSession(bearer, secret, hk.shopId)
        : null;
      let sessionToken: string | undefined;
      if (!session && !bearer && operation === "lookup" && input.success) {
        const { accessToken, phoneToken } = input.data;
        const identity = graphProfile.safeParse(
          await graph("me?fields=id", {
            access_token: accessToken,
            appsecret_proof: createHmac("sha256", secret)
              .update(accessToken)
              .digest("hex"),
          }),
        );
        const verified =
          identity.success &&
          graphPhone.safeParse(
            await graph("me/info", {
              access_token: accessToken,
              code: phoneToken,
              secret_key: secret,
            }),
          );
        const phone =
          verified &&
          verified.success &&
          normalizePhone(verified.data.data.number);
        if (identity.success && phone) {
          const verifiedIdentity = {
            sub: identity.data.id,
            phone,
            shopId: hk.shopId,
          };
          sessionToken = issueZaloMemberSession(verifiedIdentity, secret);
          session = readZaloMemberSession(sessionToken, secret, hk.shopId);
        }
      }
      if (!session) {
        response
          .status(401)
          .json({ code: bearer ? "SESSION_EXPIRED" : "PHONE_NOT_VERIFIED" });
        return;
      }
      const { phone } = session;
      if (operation !== "lookup" && request.body?.expectedPhone !== phone) {
        response.status(409).json({ code: "PHONE_CHANGED" });
        return;
      }

      const current = await findZaloHkMember(hk, phone);
      if (
        operation === "lookup" ||
        !details.success ||
        (operation === "register" && current)
      ) {
        response.json({
          ...customerResult(phone, current, balanceLabels),
          sessionToken,
        });
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
      if (!refreshed) throw new Error("Member not yet available");
      const result = customerResult(phone, refreshed, balanceLabels);
      response.json({
        ...result,
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

zaloMemberRoutes.post("/lookup", zaloMemberRateLimiter, handler("lookup"));
zaloMemberRoutes.post("/register", zaloMemberRateLimiter, handler("register"));
zaloMemberRoutes.post("/profile", zaloMemberRateLimiter, handler("update"));

export const zaloMemberCors = {
  origin,
  methods: ["POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
