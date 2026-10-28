import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import {
  hashShortcutSecret,
  SHORTCUT_TOKEN_LIFETIME_MS,
} from "../services/attendanceShortcutPolicy.js";

import { createAttendanceShortcutStore } from "./attendanceShortcutStore.js";

test(
  "pairing is single-use and atomic; rotation, expiry and revocation invalidate credentials",
  { skip: !process.env.FIRESTORE_EMULATOR_HOST },
  async () => {
    // Never load runtime credentials or the configured application Firebase project.
    const app = initializeApp(
      { projectId: "demo-attendance-shortcut" },
      randomUUID(),
    );
    const db = getFirestore(app);
    const store = createAttendanceShortcutStore(db);
    const uid = randomUUID();
    try {
      await assert.rejects(store.verifyShortcutToken("invalid"));
      const obsolete = await store.createShortcutPairing(uid);
      const fresh = await store.createShortcutPairing(uid);
      await assert.rejects(store.exchangeShortcutPairing(obsolete.code, uid));
      await assert.rejects(
        store.exchangeShortcutPairing(fresh.code, "other-user"),
      );
      const attempts = await Promise.allSettled([
        store.exchangeShortcutPairing(fresh.code, uid),
        store.exchangeShortcutPairing(fresh.code, uid),
      ]);
      assert.equal(
        attempts.filter((item) => item.status === "fulfilled").length,
        1,
      );
      const winner = attempts.find((item) => item.status === "fulfilled");
      assert.ok(winner && winner.status === "fulfilled");
      const first = winner.value;
      assert.ok(
        Math.abs(first.expires_at - Date.now() - SHORTCUT_TOKEN_LIFETIME_MS) <
          10_000,
      );
      assert.equal((await store.verifyShortcutToken(first.token)).userId, uid);
      await assert.rejects(store.getShortcutPairingOwner(fresh.code));
      const next = await store.createShortcutPairing(uid);
      // Merely starting a new pairing does not revoke the working credential.
      await store.verifyShortcutToken(first.token);
      const second = await store.exchangeShortcutPairing(next.code, uid);
      await assert.rejects(store.verifyShortcutToken(first.token));
      await store.verifyShortcutToken(second.token);
      const stored = (
        await db
          .collection("attendance_shortcut_sessions")
          .doc(hashShortcutSecret(second.token))
          .get()
      ).data();
      assert.ok(stored);
      assert.equal(JSON.stringify(stored).includes(second.token), false);
      await db
        .collection("attendance_shortcut_sessions")
        .doc(hashShortcutSecret(second.token))
        .update({ expires_at: Date.now() - 1 });
      await assert.rejects(store.verifyShortcutToken(second.token));
      const expiredPairing = await store.createShortcutPairing(uid);
      await db
        .collection("attendance_shortcut_pairings")
        .doc(hashShortcutSecret(expiredPairing.code))
        .update({ expires_at: Date.now() - 1 });
      await assert.rejects(store.getShortcutPairingOwner(expiredPairing.code));
      await assert.rejects(
        store.exchangeShortcutPairing(expiredPairing.code, uid),
      );
      const lastPairing = await store.createShortcutPairing(uid);
      const last = await store.exchangeShortcutPairing(lastPairing.code, uid);
      await store.revokeShortcutConnection(uid);
      await assert.rejects(store.verifyShortcutToken(last.token));
      await assert.rejects(
        store.exchangeShortcutPairing(lastPairing.code, uid),
      );
      assert.equal(
        (await store.shortcutConnectionStatus(uid)).connected,
        false,
      );
    } finally {
      await deleteApp(app);
    }
  },
);
