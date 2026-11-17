export const isZaloTesting = import.meta.env.MODE === "zalo-testing";

export async function getZaloAccessToken() {
  const { getAccessToken } = await import("zmp-sdk/apis");
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error("Chưa xác thực được tài khoản Zalo.");
  return accessToken;
}

export async function getZaloPhoneToken() {
  const { getPhoneNumber } = await import("zmp-sdk/apis");
  const result = await getPhoneNumber();
  if (!result.token) throw new Error("Chưa nhận được quyền chia sẻ số điện thoại.");
  return result.token;
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
