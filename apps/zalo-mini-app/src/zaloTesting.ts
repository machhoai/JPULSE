export const isZaloTesting = import.meta.env.MODE === "zalo-testing";

export async function getZaloMemberCredentials() {
  const { getAccessToken, getPhoneNumber } = await import("zmp-sdk/apis");
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error("Chưa xác thực được tài khoản Zalo.");
  const { token } = await getPhoneNumber();
  if (!token) throw new Error("Chưa nhận được quyền chia sẻ số điện thoại.");
  return { accessToken, phoneToken: token };
}

export async function captureZaloCard() {
  const { openMediaPicker } = await import("zmp-sdk/apis");
  const { data } = await openMediaPicker({
    type: "zcamera_photo",
    compressLevel: 1,
    maxSelectItem: 1,
    maxItemSize: 15 * 1024 * 1024,
  });
  const path = Array.isArray(data) ? data[0] : data;
  if (!path) return null;
  const photo = new Image();
  photo.src = path;
  await photo.decode();
  return photo;
}
