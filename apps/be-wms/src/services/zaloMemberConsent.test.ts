import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import {
  createZaloMemberConsentStore,
  verifyZaloWebhookSignature,
  zaloConsentEvent,
} from "./zaloMemberConsent.js";
import {
  issueZaloMemberSession,
  readZaloMemberSession,
  zaloMemberSessionLifetimeMs,
} from "./zaloMemberSession.js";

const appId = "2646373759294038927";
const userId = "4047671499938107249";
const event = "user.revoke.consent";
const timestamp = 1670553442564;
const payload = { event, userId, appId, timestamp };

test("verifies Zalo's signature using sorted field values and the Open APIs key", () => {
  const key = "test-open-apis-key";
  const signature = createHash("sha256")
    .update("2646373759294038927user.revoke.consent16705534425644047671499938107249test-open-apis-key")
    .digest("hex");

  assert.equal(zaloConsentEvent.safeParse(payload).success, true);
  assert.equal(zaloConsentEvent.safeParse({ ...payload, timestamp: undefined }).success, true);
  assert.equal(zaloConsentEvent.safeParse({ ...payload, userId: Number(userId) }).success, false);
  assert.equal(verifyZaloWebhookSignature(payload, signature, key), true);
  assert.equal(verifyZaloWebhookSignature({ ...payload, timestamp: timestamp + 1 }, signature, key), false);
  assert.equal(verifyZaloWebhookSignature(payload, signature, "other-key"), false);
  assert.equal(verifyZaloWebhookSignature(payload, undefined, key), false);
});

test("a session carries its issuance time and is scoped to the configured Mini App", () => {
  const now = Date.now();
  const secret = "test-zalo-app-secret";
  const token = issueZaloMemberSession({ appId, sub: userId, phone: "0912345678", shopId: 1 }, secret, now);
  const session = readZaloMemberSession(token, secret, 1, appId);
  assert.equal(session?.issuedAt, now);
  assert.equal(session?.expires, now + zaloMemberSessionLifetimeMs);
  assert.equal(readZaloMemberSession(token, secret, 1, "123"), null);
});

test("retries and out-of-order events preserve the latest revocation across server instances", {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const app = initializeApp({ projectId: "demo-zalo-consent" }, randomUUID());
  const db = getFirestore(app);
  const store = createZaloMemberConsentStore(db);
  const reader = createZaloMemberConsentStore(db);
  const secret = randomUUID();
  try {
    assert.equal(await reader.isRevoked(appId, userId, secret, timestamp), false);
    await Promise.all([
      store.revoke(appId, userId, secret, timestamp),
      reader.revoke(appId, userId, secret, timestamp - 1),
    ]);
    await reader.revoke(appId, userId, secret, timestamp);
    assert.equal(await reader.isRevoked(appId, userId, secret, timestamp - 1), true);
    assert.equal(await reader.isRevoked(appId, userId, secret, timestamp), true);
    assert.equal(await reader.isRevoked(appId, userId, secret, timestamp + 1), false);
    assert.equal(await reader.isRevoked("123", userId, secret, timestamp), false);
  } finally {
    await deleteApp(app);
  }
});
