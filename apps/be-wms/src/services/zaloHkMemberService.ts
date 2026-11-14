import { z } from "zod";
import { db } from "../config/firebase.js";
import { OpenApiActionError, sendOpenApiAction } from "./openApiService.js";

const numeric = z.union([z.number(), z.string().trim().min(1)])
  .transform(Number).pipe(z.number().finite());
const values = z.array(z.object({
  category: numeric.pipe(z.number().int()),
  value: numeric,
})).nullish();
const account = z.object({
  uid: z.string().trim().min(1).nullish(),
  shopId: numeric.pipe(z.number().int()),
  shopName: z.string().nullish(),
  levelName: z.string().nullish(),
  storedValues: values,
  storedValue: values,
});
const member = z.object({
  uid: z.string().trim().min(1).nullish(),
  phone: z.string(),
  realName: z.string().nullish(),
  email: z.string().nullish(),
  birthday: z.string().nullish(),
  sex: z.union([z.string(), z.number()]).nullish(),
  levelName: z.string().nullish(),
  storedValues: values,
  storedValue: values,
  items: z.array(account).nullish(),
});

export function normalizePhone(value: string) {
  const phone = value.trim().replace(/^\+/, "").replace(/^84(?=\d{9}$)/, "0");
  return /^0\d{9}$/.test(phone) ? phone : null;
}

export function getZaloHkMemberConfig() {
  const { HK_API_APP_ID, HK_API_KEY, HK_API_BASE_URL, HK_API_SHOP_ID } = process.env;
  const shopId = Number(HK_API_SHOP_ID);
  if (!HK_API_APP_ID || !HK_API_KEY || !HK_API_BASE_URL ||
      !Number.isSafeInteger(shopId) || shopId <= 0) return null;
  return { shopId, app_id: HK_API_APP_ID, secret_key: HK_API_KEY, base_url: HK_API_BASE_URL };
}

type Config = NonNullable<ReturnType<typeof getZaloHkMemberConfig>>;
type Action = "member_getmember_phone" | "member_getmember_uid" | "member_join" | "member_info_modify";

export function callZaloHkMember(config: Config, action: Action, body: Record<string, unknown>) {
  return sendOpenApiAction(config, action, "10.11.8", body, {
    signal: AbortSignal.timeout(10_000),
    requireHttps: process.env.ZALO_MEMBER_HK_ALLOW_HTTP !== "true",
  });
}

async function findScopedHkAccount(config: Config, phone: string) {
  try {
    const response = await callZaloHkMember(config, "member_getmember_phone", {
      shopId: config.shopId,
      phone,
    });
    const data = member.parse(response.data);
    const accounts = data.items?.filter((item) => item.shopId === config.shopId);
    const uid = accounts ? accounts[0]?.uid : data.uid;
    if (response.success !== true || normalizePhone(data.phone) !== phone ||
        !uid || (accounts && accounts.length !== 1)) {
      throw new Error("HK did not confirm a unique member in the configured shop");
    }
    return { uid, shopName: accounts?.[0]?.shopName };
  } catch (error) {
    if (error instanceof OpenApiActionError &&
        (error.status === 200 || error.status === 404) &&
        error.response?.success === false && error.response.data === null &&
        (error.response.msg === "Member information does not exist" ||
         error.response.desc === "No member information found via mobile phone number")) return null;
    throw error;
  }
}

export async function findZaloHkMember(config: Config, phone: string) {
  const matches = await db.collection("pos_members")
    .where("shopId", "==", config.shopId)
    .where("phone", "==", phone)
    .limit(2).get();
  if (matches.size > 1) throw new Error("Multiple JPOS members share this phone");

  const local = matches.docs[0];
  const scopeNeedsConfirmation = local?.get("hkImportUnassigned") === true;
  const scoped = !local || scopeNeedsConfirmation
    ? await findScopedHkAccount(config, phone)
    : null;
  const uid = local?.id ?? scoped?.uid;
  if (!uid) return null;
  if (scopeNeedsConfirmation && scoped?.uid !== uid) {
    throw new Error("HK did not confirm the imported JPOS member's shop");
  }
  const response = await callZaloHkMember(config, "member_getmember_uid", { uid });
  const data = member.parse(response.data);
  const accounts = data.items?.filter((item) => item.shopId === config.shopId);
  const selected = accounts?.[0];
  if (response.success !== true || data.uid !== uid || normalizePhone(data.phone) !== phone ||
      (accounts && (accounts.length !== 1 || (selected?.uid && selected.uid !== uid)))) {
    throw new Error("HK member details do not match the verified identity and shop");
  }
  return {
    uid,
    shopId: config.shopId,
    shopName: selected?.shopName ?? scoped?.shopName ??
      z.string().catch("").parse(local?.get("shopName")),
    levelName: selected?.levelName ?? data.levelName,
    storedValues: selected?.storedValues ?? selected?.storedValue ?? data.storedValues ?? data.storedValue ?? [],
    realName: data.realName,
    email: data.email,
    birthday: data.birthday,
    sex: data.sex,
  };
}
