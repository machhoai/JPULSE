import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(new URL("./authenticatedFetch.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function loadClient(auth, fetch) {
  const exports = {};
  runInNewContext(compiled, {
    exports,
    Headers,
    fetch,
    require(name) {
      assert.equal(name, "@/lib/firebase");
      return { auth };
    },
  });
  return exports.authenticatedFetch;
}

test("MFA requests authenticate with Firebase when the browser sends no session cookie", async () => {
  for (const path of ["mfa/verify", "mfa/send-email", "mfa/setup", "mfa/verify-setup", "session"]) {
    const client = loadClient({ currentUser: { getIdToken: async () => "firebase-token" } }, async (url, init) => {
      assert.equal(url, `https://backend.example/api/auth/${path}`);
      assert.equal(init.headers.get("Authorization"), "Bearer firebase-token");
      assert.equal(init.headers.get("Content-Type"), "application/json");
      assert.equal(init.credentials, "include");
      assert.equal(init.body, '{"token":"123456"}');
      return new Response(null, { status: 200 });
    });
    assert.equal((await client(`https://backend.example/api/auth/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: '{"token":"123456"}',
    })).status, 200);
  }
});

test("an expired Firebase token refreshes once and preserves the MFA request", async () => {
  const refreshes = [];
  const calls = [];
  const client = loadClient({ currentUser: { getIdToken: async (refresh) => {
    refreshes.push(refresh);
    return refresh ? "fresh-token" : "expired-token";
  } } }, async (_url, init) => {
    calls.push(init);
    return new Response(null, { status: calls.length === 1 ? 401 : 200 });
  });
  const result = await client("https://backend.example/api/auth/mfa/verify", {
    method: "POST", body: '{"token":"123456"}',
  });
  assert.equal(result.status, 200);
  assert.deepEqual(refreshes, [false, true]);
  assert.equal(calls[1].headers.get("Authorization"), "Bearer fresh-token");
  assert.equal(calls[1].body, calls[0].body);
});

test("an invalid MFA code is returned without repeating verification", async () => {
  let calls = 0;
  const client = loadClient({ currentUser: { getIdToken: async () => "firebase-token" } }, async () => {
    calls++;
    return new Response(null, { status: 400 });
  });
  assert.equal((await client("https://backend.example/api/auth/mfa/verify")).status, 400);
  assert.equal(calls, 1);
});

test("an unauthenticated request remains rejected", async () => {
  let calls = 0;
  const client = loadClient({ currentUser: null }, async (_url, init) => {
    calls++;
    assert.equal(init.headers.has("Authorization"), false);
    return new Response(null, { status: 401 });
  });
  assert.equal((await client("https://backend.example/api/auth/mfa/send-email")).status, 401);
  assert.equal(calls, 1);
});
