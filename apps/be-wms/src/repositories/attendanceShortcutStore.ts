import type { Firestore } from "firebase-admin/firestore";

import {
  hashShortcutSecret,
  newShortcutSecret,
  shortcutSecretSchema,
  ShortcutCredentialError,
  SHORTCUT_PAIRING_LIFETIME_MS,
  SHORTCUT_TOKEN_LIFETIME_MS,
} from "../services/attendanceShortcutPolicy.js";

export function createAttendanceShortcutStore(db: Firestore) {
  // Server-only collections; never store plaintext credentials.
  const connections = () => db.collection("attendance_shortcut_connections");
  const pairings = () => db.collection("attendance_shortcut_pairings");
  const sessions = () => db.collection("attendance_shortcut_sessions");

  async function createShortcutPairing(userId: string) {
    const code = newShortcutSecret();
    const hash = hashShortcutSecret(code);
    const expiresAt = Date.now() + SHORTCUT_PAIRING_LIFETIME_MS;
    await db.runTransaction(async (transaction) => {
      transaction.set(
        connections().doc(userId),
        { pending_hash: hash },
        { merge: true },
      );
      transaction.create(pairings().doc(hash), {
        user_id: userId,
        expires_at: expiresAt,
      });
    });
    return { code, expires_at: expiresAt };
  }

  async function getShortcutPairingOwner(code: string) {
    const invalidPairing = () =>
      new ShortcutCredentialError(
        "Mã kết nối đã dùng, hết hạn hoặc không hợp lệ. Vui lòng mở trang chấm công và tạo kết nối mới; không dùng lại liên kết cập nhật cũ.",
      );
    if (!shortcutSecretSchema.safeParse(code).success) throw invalidPairing();
    const pairing = (
      await pairings().doc(hashShortcutSecret(code)).get()
    ).data();
    if (!pairing || pairing.expires_at <= Date.now()) throw invalidPairing();
    return pairing.user_id as string;
  }

  async function exchangeShortcutPairing(code: string, userId: string) {
    const codeHash = hashShortcutSecret(code);
    const token = newShortcutSecret();
    const tokenHash = hashShortcutSecret(token);
    const expiresAt = Date.now() + SHORTCUT_TOKEN_LIFETIME_MS;
    await db.runTransaction(async (transaction) => {
      const pairingRef = pairings().doc(codeHash);
      const connectionRef = connections().doc(userId);
      const [pairing, connection] = await Promise.all([
        transaction.get(pairingRef),
        transaction.get(connectionRef),
      ]);
      const data = pairing.data();
      if (
        !data ||
        data.user_id !== userId ||
        data.expires_at <= Date.now() ||
        connection.data()?.pending_hash !== codeHash
      ) {
        throw new ShortcutCredentialError(
          "Mã kết nối đã dùng, hết hạn hoặc được thay thế. Vui lòng tạo kết nối mới trên trang chấm công.",
        );
      }
      const oldHash = connection.data()?.active_hash;
      if (typeof oldHash === "string")
        transaction.delete(sessions().doc(oldHash));
      transaction.create(sessions().doc(tokenHash), {
        user_id: userId,
        expires_at: expiresAt,
      });
      transaction.set(connectionRef, {
        active_hash: tokenHash,
        expires_at: expiresAt,
        pending_hash: null,
      });
      transaction.delete(pairingRef);
    });
    return { token, expires_at: expiresAt };
  }

  async function verifyShortcutToken(token: string) {
    if (!shortcutSecretSchema.safeParse(token).success)
      throw new ShortcutCredentialError();
    const tokenHash = hashShortcutSecret(token);
    const session = (await sessions().doc(tokenHash).get()).data();
    if (!session || session.expires_at <= Date.now())
      throw new ShortcutCredentialError();
    const connection = (await connections().doc(session.user_id).get()).data();
    if (connection?.active_hash !== tokenHash)
      throw new ShortcutCredentialError();
    return {
      userId: session.user_id as string,
      expiresAt: session.expires_at as number,
    };
  }

  async function shortcutConnectionStatus(userId: string) {
    const data = (await connections().doc(userId).get()).data();
    return {
      connected: Boolean(data?.active_hash),
      expires_at: data?.expires_at ?? null,
    };
  }

  async function revokeShortcutConnection(userId: string) {
    await db.runTransaction(async (transaction) => {
      const ref = connections().doc(userId);
      const connection = (await transaction.get(ref)).data();
      if (connection?.active_hash)
        transaction.delete(sessions().doc(connection.active_hash));
      transaction.delete(ref);
    });
  }

  return {
    createShortcutPairing,
    getShortcutPairingOwner,
    exchangeShortcutPairing,
    verifyShortcutToken,
    shortcutConnectionStatus,
    revokeShortcutConnection,
  };
}
