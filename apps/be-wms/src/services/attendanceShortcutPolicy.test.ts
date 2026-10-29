import assert from "node:assert/strict";
import test from "node:test";

import {
  hashShortcutSecret,
  newShortcutSecret,
  isShortcutExpiringSoon,
  renderShortcutResult,
  SHORTCUT_WARNING_MS,
  shortcutCheckInSchema,
} from "./attendanceShortcutPolicy.js";

test("expiry warning uses a strict seven-day boundary and excludes expired credentials", () => {
  const now = Date.parse("2026-10-28T00:00:00Z");
  assert.equal(isShortcutExpiringSoon(now + SHORTCUT_WARNING_MS, now), false);
  assert.equal(
    isShortcutExpiringSoon(now + SHORTCUT_WARNING_MS - 1, now),
    true,
  );
  assert.equal(isShortcutExpiringSoon(now, now), false);
  assert.equal(isShortcutExpiringSoon(now - 1, now), false);
});

test("results escape failure messages and render Vietnam server time with an expiry reminder", () => {
  const now = Date.parse("2026-10-28T00:00:00Z");
  const success = renderShortcutResult({
    success: true,
    message: "OK",
    checkedInAt: new Date(now),
    expiresAt: now + 1000,
    now,
  });
  assert.match(success, /✓/);
  assert.match(success, /07:00:00/);
  assert.match(success, /28\/10\/2026/);
  assert.match(success, /còn dưới 7 ngày/);
  const failure = renderShortcutResult({
    success: false,
    message: '<script>alert("secret")</script>',
    expiresAt: now + SHORTCUT_WARNING_MS,
    now,
  });
  assert.match(failure, /✕/);
  assert.match(failure, /color:#dc2626/);
  assert.doesNotMatch(failure, /<script>/);
  assert.doesNotMatch(failure, /còn dưới 7 ngày/);
  assert.match(failure, /&lt;script&gt;/);
});

test("shortcut cannot override check-in time, user, IP or GPS validation", () => {
  assert.equal(shortcutCheckInSchema.safeParse({}).success, true);
  for (const field of ["action_time", "user_id", "ip_address", "token"]) {
    assert.equal(
      shortcutCheckInSchema.safeParse({ [field]: "value" }).success,
      false,
    );
  }
  assert.equal(
    shortcutCheckInSchema.safeParse({
      location: {
        latitude: 200,
        longitude: 0,
        accuracy_m: 1,
        captured_at: new Date().toISOString(),
      },
    }).success,
    false,
  );
});

test("credentials are random 256-bit values and hashes cannot be used as credentials", () => {
  const a = newShortcutSecret();
  const b = newShortcutSecret();
  assert.notEqual(a, b);
  assert.equal(Buffer.from(a, "base64url").length, 32);
  assert.notEqual(hashShortcutSecret(a), a);
  assert.equal(hashShortcutSecret(a).length, 64);
});

test("native Shortcut GPS may omit accuracy but must supply valid coordinates and capture time", () => {
  const location = {
    latitude: 10.7769,
    longitude: 106.7009,
    captured_at: "2026-10-29T01:00:00Z",
  };
  assert.equal(shortcutCheckInSchema.safeParse({ location }).success, true);
  for (const accuracy_m of [null, 0, -1, "10", 10001]) {
    assert.equal(
      shortcutCheckInSchema.safeParse({ location: { ...location, accuracy_m } })
        .success,
      false,
    );
  }
  assert.equal(
    shortcutCheckInSchema.safeParse({
      location: { ...location, captured_at: undefined },
    }).success,
    false,
  );
  assert.equal(
    shortcutCheckInSchema.safeParse({
      location: { ...location, longitude: 181 },
    }).success,
    false,
  );
  assert.equal(
    shortcutCheckInSchema.safeParse({
      location,
      allowUnknownGpsAccuracy: true,
    }).success,
    false,
  );
});
