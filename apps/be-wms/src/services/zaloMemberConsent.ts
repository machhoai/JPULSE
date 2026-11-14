import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { zaloMemberSessionLifetimeMs } from "./zaloMemberSession.js";

export const zaloConsentEvent = z.strictObject({
  appId: z.string().regex(/^\d{1,32}$/),
  event: z.literal("user.revoke.consent"),
  timestamp: z.number().int().min(1_000_000_000_000).max(9_999_999_999_999).optional(),
  userId: z.string().regex(/^\d{1,32}$/),
});

export function verifyZaloWebhookSignature(
  payload: Record<string, unknown>,
  header: string | undefined,
  apiKey: string,
) {
  if (!header || !/^[a-f0-9]{64}$/i.test(header)) return false;
  const digest = createHash("sha256");
  for (const key of Object.keys(payload).sort()) {
    const value = payload[key];
    digest.update(typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  return timingSafeEqual(digest.update(apiKey).digest(), Buffer.from(header, "hex"));
}

export function createZaloMemberConsentStore(db: Firestore) {
  function ref(appId: string, userId: string, secret: string) {
    const id = createHmac("sha256", secret)
      .update(JSON.stringify(["jpulse:zalo-member:consent", appId, userId]))
      .digest("hex");
    return db.collection("zalo_member_consent_revocations").doc(id);
  }

  return {
    async revoke(appId: string, userId: string, secret: string, revokedAt: number) {
      const document = ref(appId, userId, secret);
      await db.runTransaction(async (transaction) => {
        const existing = await transaction.get(document);
        const previous = existing.get("revokedAt") as number | undefined;
        if (previous !== undefined && previous >= revokedAt) return;
        transaction.set(document, {
          revokedAt,
          expiresAt: new Date(revokedAt + zaloMemberSessionLifetimeMs),
        });
      });
    },

    async isRevoked(appId: string, userId: string, secret: string, issuedAt: number) {
      const snapshot = await ref(appId, userId, secret).get();
      const revokedAt = snapshot.get("revokedAt") as number | undefined;
      return revokedAt !== undefined && issuedAt <= revokedAt;
    },
  };
}
