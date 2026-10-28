import assert from "node:assert/strict";
import { once } from "node:events";
import { after, mock, test } from "node:test";
import express from "express";

// Test the actual HTTP router without loading runtime Firebase credentials.
const stub = (path, namedExports) =>
  mock.module(new URL(`../dist/${path}.js`, import.meta.url).href, {
    namedExports,
  });
const { ShortcutCredentialError } =
  await import("../dist/services/attendanceShortcutPolicy.js");
let denied = false;
let failure = null;
let expiry = Date.now() + 90 * 86400000;
let writes = 0;
let authorizationLoads = 0;
let issued = 0;
const code = "c".repeat(43);
stub("repositories/attendanceShortcutRepository", {
  createShortcutPairing: async () => {
    issued++;
    return { code, expires_at: Date.now() + 300000 };
  },
  exchangeShortcutPairing: async () => ({
    token: "t".repeat(43),
    expires_at: expiry,
  }),
  getShortcutPairingOwner: async () => "employee-a",
  revokeShortcutConnection: async () => {},
  shortcutConnectionStatus: async () => ({
    connected: true,
    expires_at: expiry,
  }),
  verifyShortcutToken: async (token) => {
    if (token !== "valid-shortcut-token") throw new ShortcutCredentialError();
    return { userId: "employee-a", expiresAt: expiry };
  },
});
stub("repositories/employeeProfileRepository", {
  getEmployeeProfileByUserId: async () => ({
    workplace_warehouse_id: "workplace-a",
  }),
});
stub("services/attendanceAuthorizationPolicy", {
  assertPersonalAttendanceAction: () => {
    if (denied)
      throw { statusCode: 403, messages: { vi: "Không có quyền chấm công." } };
  },
});
stub("api/middlewares/requestAccessContext", {
  requireAuthenticatedRequestUser: (req) => req.user,
  requireRequestAuthorization: () => ({}),
});
stub("api/middlewares/authMiddleware", {
  attachAuthorizationForUser: async (req, uid) => {
    authorizationLoads++;
    if (denied)
      throw { statusCode: 403, messages: { vi: "Tài khoản đã bị khóa." } };
    req.user = { id: uid };
  },
  requireAuth: (req, res, next) => {
    if (req.headers.authorization !== "Bearer browser-session")
      return res.status(401).json({ success: false });
    req.user = { id: "employee-a" };
    next();
  },
});
stub("services/scopedAttendanceService", {
  checkInAttendance: async (user, input, ips, audit) => {
    assert.equal(user.id, "employee-a");
    assert.equal(input.action_time, undefined);
    assert.deepEqual(ips, ["127.0.0.1"]);
    assert.equal(audit.session_token, null);
    if (failure) throw failure;
    writes++;
    return { check_in_at: new Date("2026-10-28T01:30:00Z") };
  },
});
const { attendanceShortcutRoutes } =
  await import("../dist/api/routes/attendanceShortcutRoutes.js");
const app = express();
app.set("trust proxy", () => false);
app.use(express.json());
app.use("/api/attendance/shortcut", attendanceShortcutRoutes);
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
after(() => new Promise((resolve) => server.close(resolve)));
const base = `http://127.0.0.1:${server.address().port}/api/attendance/shortcut`;
const request = (path, token, body = {}, method = "POST") =>
  fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      // These untrusted headers must not supply the attendance IP.
      "x-forwarded-for": "203.0.113.77",
      "x-real-ip": "203.0.113.88",
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });

test("check-in rejects browser credentials and missing shortcut tokens with red HTML", async () => {
  for (const token of [undefined, "browser-session", "invalid-token"]) {
    const response = await request("/check-in", token);
    assert.equal(response.status, 401);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.equal(response.headers.get("cache-control"), "no-store, private");
    assert.match(await response.text(), /✕/);
  }
  assert.equal(writes, 0);
  assert.equal(authorizationLoads, 0);
});

test("check-in returns green HTML, Vietnam check-in time, and reminder only below seven days", async () => {
  expiry = Date.now() + 6 * 86400000;
  let response = await request("/check-in", "valid-shortcut-token");
  assert.equal(response.status, 201);
  let body = await response.text();
  assert.match(body, /✓/);
  assert.match(body, /08:30:00/);
  assert.match(body, /còn dưới 7 ngày/);
  expiry = Date.now() + 90 * 86400000;
  response = await request("/check-in", "valid-shortcut-token");
  body = await response.text();
  assert.doesNotMatch(body, /còn dưới 7 ngày/);
  assert.equal(writes, 2);
  assert.equal(authorizationLoads, 2);
});

test("current authorization is reloaded and caller cannot override time or identity", async () => {
  denied = true;
  const deniedResponse = await request("/check-in", "valid-shortcut-token");
  assert.equal(deniedResponse.status, 403);
  assert.match(await deniedResponse.text(), /Tài khoản đã bị khóa/);
  denied = false;
  const response = await request("/check-in", "valid-shortcut-token", {
    action_time: "2020-01-01T00:00:00Z",
    user_id: "other",
  });
  assert.equal(response.status, 400);
  assert.equal(writes, 2);
});

test("policy failures and duplicate check-ins retain precise reasons and expiry warnings", async () => {
  expiry = Date.now() + 86400000;
  failure = {
    statusCode: 403,
    messages: { vi: "Generic IP message" },
    data: { rejected_reason: "OUTSIDE_GEOFENCE" },
  };
  let response = await request("/check-in", "valid-shortcut-token");
  assert.equal(response.status, 403);
  let body = await response.text();
  assert.match(body, /ngoài phạm vi/);
  assert.match(body, /còn dưới 7 ngày/);
  failure = { statusCode: 409, messages: { vi: "Bạn đã check-in hôm nay." } };
  response = await request("/check-in", "valid-shortcut-token");
  assert.equal(response.status, 409);
  assert.match(await response.text(), /Bạn đã check-in hôm nay/);
  failure = new Error("secret internal stack");
  response = await request("/check-in", "valid-shortcut-token");
  assert.equal(response.status, 500);
  body = await response.text();
  assert.doesNotMatch(body, /secret internal stack/);
  failure = null;
});

test("pairing requires a browser session, permission and a configured template", async () => {
  assert.equal((await request("/pairing", "valid-shortcut-token")).status, 401);
  assert.equal(
    (await request("/connection", undefined, {}, "GET")).status,
    401,
  );
  delete process.env.ATTENDANCE_SHORTCUT_ICLOUD_URL;
  assert.equal((await request("/pairing", "browser-session")).status, 503);
  assert.equal(issued, 0);
  // Synthetic test URL, never exposed as a real published template.
  process.env.ATTENDANCE_SHORTCUT_ICLOUD_URL = `https://www.icloud.com/shortcuts/${"a".repeat(32)}`;
  denied = true;
  assert.equal((await request("/pairing", "browser-session")).status, 403);
  denied = false;
  const response = await request("/pairing", "browser-session");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.code, code);
  assert.equal(issued, 1);
  delete process.env.ATTENDANCE_SHORTCUT_ICLOUD_URL;
});

test("burst limit also returns failure HTML", async () => {
  let response;
  for (let count = 0; count < 21; count++)
    response = await request("/check-in", "invalid");
  assert.equal(response.status, 429);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(await response.text(), /✕/);
});
