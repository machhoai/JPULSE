import { createHash } from "node:crypto";
import { auth, db } from "../config/firebase.js";
import { getUserById } from "../repositories/userRepository.js";
import { isUsableLoginUser } from "./loginUserPolicy.js";

export const jposWebOrigin = "https://jpos.joyworldcityfuns.vn";
const hosts = new Set([
  "https://jpulse.joyworldcityfuns.vn",
  jposWebOrigin,
]);
const mfaLifetimeMs = 24 * 60 * 60 * 1000;

export const isSharedWebOrigin = (origin: string | undefined) =>
  typeof origin === "string" && hosts.has(origin);

export const sharedWebSessionId = (cookie: string) => createHash("sha256").update(cookie).digest("hex");

const proofRef = (uid: string, cookie: string) => db.collection("users").doc(uid)
  .collection("web_session_mfa")
  .doc(sharedWebSessionId(cookie));

export async function hasSharedWebSessionMfa(cookie: string, uid: string) {
  const proof = await proofRef(uid, cookie).get();
  const expiresAt = proof.get("expiresAt")?.toMillis();
  return typeof expiresAt === "number" && expiresAt > Date.now();
}

export async function markSharedWebSessionMfa(cookie: string, uid: string) {
  const session = await auth.verifySessionCookie(cookie, true).catch(() => null);
  if (session?.uid !== uid) return false;
  const expiresAt = new Date(Math.min(session.exp * 1000, Date.now() + mfaLifetimeMs));
  await proofRef(uid, cookie).set({ expiresAt });
  return true;
}

export async function createSharedWebFirebaseToken(cookie: string) {
  if (!cookie) return null;
  const session = await auth.verifySessionCookie(cookie, true).catch(() => null);
  if (!session) return null;

  const [mfaVerified, user] = await Promise.all([
    hasSharedWebSessionMfa(cookie, session.uid),
    getUserById(session.uid),
  ]);
  if (!mfaVerified || !isUsableLoginUser(user)) return null;
  return auth.createCustomToken(session.uid, { jpulse_web_session: sharedWebSessionId(cookie) });
}

export async function clearSharedWebSessionMfa(cookie: string) {
  const session = await auth.verifySessionCookie(cookie, true).catch(() => null);
  if (session) await proofRef(session.uid, cookie).delete();
}
