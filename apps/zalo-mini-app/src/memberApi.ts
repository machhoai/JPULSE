import type { Balance, Profile } from "./demo";
import { getZaloAccessToken, getZaloPhoneToken, isZaloTesting } from "./zaloTesting";

export type MemberAccount = {
  shopId: number;
  store: string;
  level: string;
  balances: Balance[];
};

export type MemberResult = (
  | { registered: false; phone: string }
  | { registered: true; profile: Profile; accounts: MemberAccount[] }
) & { sessionToken?: string };

export type Registration = {
  name: string;
  email?: string;
  birthday?: string;
  sex?: string;
};

const messages: Record<string, string> = {
  NOT_CONFIGURED: "Kết nối thành viên chưa được cấu hình.",
  ZALO_NOT_VERIFIED: "Chưa xác thực được tài khoản Zalo. Vui lòng thử lại.",
  PHONE_NOT_VERIFIED: "Chưa xác minh được số điện thoại. Vui lòng thử lại.",
  SESSION_EXPIRED: "Phiên đã hết hạn. Vui lòng mở lại My BDuck hoặc thử lại.",
  SESSION_REVOKED: "Quyền chia sẻ đã được rút lại. Bạn có thể cấp lại quyền khi liên kết tài khoản.",
  REGISTRATION_UNAVAILABLE:
    "Đăng ký trực tuyến chưa mở. Vui lòng liên hệ quầy hỗ trợ.",
  PROFILE_INCOMPLETE:
    "Số điện thoại đã có hồ sơ. Hãy đăng nhập lại để kiểm tra và cập nhật thông tin.",
  PROFILE_UNAVAILABLE:
    "Chưa thể sửa hồ sơ trực tuyến. Vui lòng liên hệ quầy hỗ trợ.",
  PHONE_CHANGED:
    "Số điện thoại Zalo đã thay đổi. Vui lòng đăng xuất và đăng nhập lại.",
  INVALID_INPUT: "Thông tin chưa hợp lệ. Vui lòng kiểm tra và thử lại.",
};

export const isZaloProduction = import.meta.env.MODE === "zalo-production";
export const hasMemberBackend =
  isZaloProduction ||
  (isZaloTesting && Boolean(import.meta.env.VITE_ZALO_MEMBER_API_URL));

let sessionToken: string | undefined;

export const hasLocalMemberLookup = import.meta.env.DEV &&
  import.meta.env.MODE === "development" &&
  import.meta.env.VITE_ZALO_LOCAL_LOOKUP === "true";

export async function lookupLocalMember(phone: string): Promise<MemberResult> {
  if (!hasLocalMemberLookup) throw new MemberApiError("NOT_CONFIGURED");
  const response = await fetch("/__local-zalo/lookup", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", "X-Local-Zalo-Lookup": "1" },
    body: JSON.stringify({ phone }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new MemberApiError(result?.code);
  return result as MemberResult;
}

export function clearMemberSession() {
  sessionToken = undefined;
}

export class MemberApiError extends Error {
  constructor(public readonly code: string) {
    super(messages[code] ?? "Tạm thời chưa truy vấn được dữ liệu thành viên. Vui lòng thử lại.");
  }
}

async function postMember<T>(
  operation: string,
  body: object,
  token?: string,
  signal?: AbortSignal,
): Promise<T> {
  const base = import.meta.env.VITE_ZALO_MEMBER_API_URL as string | undefined;
  if (!base) throw new Error(messages.NOT_CONFIGURED);
  const endpoint = new URL(base);
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new Error(messages.NOT_CONFIGURED);
  }
  const response = await fetch(`${base.replace(/\/$/, "")}/${operation}`, {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
    signal,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    if (response.status === 401 && sessionToken === token) clearMemberSession();
    throw new MemberApiError(result?.code);
  }
  return result as T;
}

type EntryResult = { member: MemberResult | null; sessionToken: string };

export async function authenticateMember(signal?: AbortSignal) {
  const accessToken = await getZaloAccessToken();
  const result = await postMember<EntryResult>("authenticate", { accessToken }, undefined, signal);
  signal?.throwIfAborted();
  if (!result.sessionToken) throw new MemberApiError("SESSION_EXPIRED");
  sessionToken = result.sessionToken;
  return result.member;
}

export async function linkMember() {
  const token = sessionToken;
  if (!token) throw new MemberApiError("SESSION_EXPIRED");
  const phoneToken = await getZaloPhoneToken().catch(() => {
    throw new MemberApiError("PHONE_NOT_VERIFIED");
  });
  const accessToken = await getZaloAccessToken();
  const result = await postMember<EntryResult>("link", { accessToken, phoneToken }, token);
  if (!result.sessionToken || !result.member) throw new MemberApiError("SESSION_EXPIRED");
  sessionToken = result.sessionToken;
  return result.member;
}

export async function requestMember(
  operation: "register" | "profile",
  profile: Registration,
  expectedPhone: string,
) {
  const token = sessionToken;
  if (!token) throw new MemberApiError("SESSION_EXPIRED");
  const result = await postMember<MemberResult>(operation, { profile, expectedPhone }, token);
  if (result.sessionToken) sessionToken = result.sessionToken;
  return result;
}
