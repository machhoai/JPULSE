import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { createStore } = require("zustand/vanilla");

function load(path, modules, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    ...globals,
    require(name) {
      assert.ok(name in modules, `Unexpected import: ${name}`);
      return modules[name];
    },
  });
  return exports;
}

function events() {
  const listeners = new Map();
  return {
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    },
    removeEventListener(name, callback) {
      listeners.get(name)?.delete(callback);
    },
    emit(name) {
      return Promise.all(
        [...(listeners.get(name) || [])].map((callback) => callback()),
      );
    },
    count(name) {
      return listeners.get(name)?.size || 0;
    },
  };
}

function idleClient(persistedState) {
  let now = 1_000_000;
  const storage = new Map();
  if (persistedState)
    storage.set(
      "mfa-storage",
      JSON.stringify({ state: persistedState, version: 0 }),
    );
  const browserStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  const middleware = require("zustand/middleware");
  const { useMfaStore: store, MFA_IDLE_TIMEOUT_MS: timeout } = load(
    "../stores/useMfaStore.ts",
    {
      zustand: {
        create: () => (initializer) => {
          const api = createStore(initializer);
          return Object.assign((selector) => selector(api.getState()), api);
        },
      },
      "zustand/middleware": {
        persist: (initializer, options) =>
          middleware.persist(initializer, {
            ...options,
            storage: middleware.createJSONStorage(() => browserStorage),
          }),
      },
    },
    {
      Date: { now: () => now },
    },
  );
  const window = {
    ...events(),
    setInterval(callback) {
      this.tick = callback;
      return 1;
    },
    clearInterval() {
      this.tick = null;
    },
  };
  const document = { ...events(), visibilityState: "visible" };
  const cleanups = [];
  const { useMFA } = load(
    "../hooks/useMFA.ts",
    {
      react: { useEffect: (effect) => cleanups.push(effect()) },
      "../stores/useMfaStore": { useMfaStore: store },
    },
    { window, document },
  );
  return {
    store,
    timeout,
    window,
    document,
    useMFA,
    cleanups,
    advance: (ms) => {
      now += ms;
    },
  };
}

test("the first interaction after 24h locks before it can erase inactivity", async () => {
  for (const event of [
    "pointermove",
    "pointerdown",
    "keydown",
    "click",
    "touchstart",
    "scroll",
  ]) {
    const client = idleClient();
    client.useMFA();
    const before = client.store.getState().lastActiveTime;
    client.advance(client.timeout);
    await client.window.emit(event);
    assert.equal(client.store.getState().isLocked, true, event);
    assert.equal(client.store.getState().lastActiveTime, before);
    client.cleanups.forEach((cleanup) => cleanup());
  }
});

test("resume, visibility, page restore and mount check the deadline without waiting for a timer", async () => {
  for (const event of ["focus", "pageshow", "visibilitychange", "mount"]) {
    const client = idleClient();
    if (event !== "mount") client.useMFA();
    client.advance(client.timeout + 1);
    if (event === "mount") client.useMFA();
    else
      await (
        event === "visibilitychange" ? client.document : client.window
      ).emit(event);
    assert.equal(client.store.getState().isLocked, true, event);
    client.cleanups.forEach((cleanup) => cleanup());
  }
});

test("normal activity extends the deadline; only successful unlock resets a locked session", async () => {
  const client = idleClient();
  client.useMFA();
  client.advance(client.timeout - 1_000);
  await client.window.emit("pointerdown");
  client.advance(1_000);
  client.window.tick();
  assert.equal(client.store.getState().isLocked, false);
  client.advance(client.timeout);
  client.window.tick();
  assert.equal(client.store.getState().isLocked, true);
  const before = client.store.getState().lastActiveTime;
  await client.window.emit("keydown");
  assert.equal(client.store.getState().lastActiveTime, before);
  client.store.getState().unlockScreen();
  client.window.tick();
  assert.equal(client.store.getState().isLocked, false);
  client.cleanups.forEach((cleanup) => cleanup());
});

test("multiple hook consumers share listeners and clean up on final unmount", () => {
  const client = idleClient();
  client.useMFA();
  client.useMFA();
  assert.equal(client.window.count("keydown"), 1);
  client.cleanups[0]();
  assert.equal(client.window.count("keydown"), 1);
  client.cleanups[1]();
  assert.equal(client.window.count("keydown"), 0);
  assert.equal(client.document.count("visibilitychange"), 0);
  assert.equal(client.window.tick, null);
});

test("a reloaded tab respects the persisted idle deadline and existing lock", () => {
  for (const state of [
    { isLocked: false, lastActiveTime: 1_000_000 - 24 * 60 * 60 * 1000 },
    { isLocked: true, lastActiveTime: 1_000_000 },
  ]) {
    const client = idleClient(state);
    client.useMFA();
    assert.equal(client.store.getState().isLocked, true);
    client.cleanups.forEach((cleanup) => cleanup());
  }
});

test("a terminated access listener reconnects on resume and keeps receiving updates", async () => {
  const window = { ...events(), navigator: { onLine: true } };
  const document = { ...events(), visibilityState: "visible" };
  const listeners = [];
  let reads = 0;
  let applies = 0;
  let cleanup;
  const state = {
    user: { id: "user-a" },
    revokeAccess() {},
    markAccessOffline() {},
    markAccessOnline() {},
    beginAccessRefresh() {},
    applyAccessSnapshot() {
      applies++;
    },
  };
  const snapshot = {
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({ access_version: 1, active_version_id: "v1" }),
  };
  const useUserStore = Object.assign((selector) => selector(state), {
    getState: () => state,
  });
  const { default: Provider } = load(
    "../components/providers/AccessVersionProvider.tsx",
    {
      react: {
        useEffect: (effect) => {
          cleanup = effect();
        },
      },
      "@bduck/shared-types": {},
      "@/lib/firebase": { db: {} },
      "@/stores/useUserStore": { useUserStore },
      "@/lib/accessSnapshotPolicy": {
        parseActiveAccessMetadata: (_id, data) => data,
        needsGrantReload: () => true,
        buildMaterializedPermissions: () => ({}),
      },
      "firebase/firestore": {
        doc: () => ({}),
        collection: () => ({}),
        getDocFromServer: async () => {
          reads++;
          return snapshot;
        },
        getDocsFromServer: async () => ({ docs: [] }),
        onSnapshot: (_ref, _options, next, error) => {
          const listener = { next, error, stopped: false };
          listeners.push(listener);
          return () => {
            listener.stopped = true;
          };
        },
      },
    },
    { window, document, console: { error() {} } },
  );
  Provider();
  listeners[0].error(new Error("permission-denied after token failure"));
  await window.emit("focus");
  assert.equal(reads, 1);
  assert.equal(listeners.length, 2);
  assert.equal(listeners[0].stopped, true);
  assert.equal(applies, 1);
  listeners[1].next(snapshot);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(applies, 2);
  await window.emit("focus");
  assert.equal(listeners.length, 2, "healthy listeners must not be duplicated");
  cleanup();
  assert.equal(listeners[1].stopped, true);
  assert.equal(window.count("focus"), 0);
  assert.equal(document.count("visibilitychange"), 0);
});
