import type { Balance, Profile } from "./demo";
import { getZaloMemberCredentials, isZaloTesting } from "./zaloTesting";

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
  PHONE_NOT_VERIFIED: "Chưa xác minh được số điện thoại. Vui lòng thử lại.",
  SESSION_EXPIRED: "Phiên đã hết hạn. Vui lòng quay lại và đăng nhập lại.",
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

export function clearMemberSession() {
  sessionToken = undefined;
}

export async function requestMember(
  operation: "lookup" | "register" | "profile",
  profile?: Registration,
  expectedPhone?: string,
) {
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
  const login = operation === "lookup";
  const token = sessionToken;
  if (!login && !token) throw new Error(messages.SESSION_EXPIRED);
  const credentials = login ? await getZaloMemberCredentials() : undefined;
  const response = await fetch(`${base.replace(/\/$/, "")}/${operation}`, {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(!login && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ ...credentials, profile, expectedPhone }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    if (response.status === 401 && sessionToken === token) clearMemberSession();
    throw new Error(
      messages[result?.code] ??
        "Tạm thời chưa truy vấn được dữ liệu thành viên. Vui lòng thử lại.",
    );
  }
  const member = result as MemberResult;
  if (login) {
    if (!member.sessionToken)
      throw new Error("Chưa nhận được phiên thành viên.");
    sessionToken = member.sessionToken;
  }
  return member;
}
