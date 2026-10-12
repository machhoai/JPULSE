import type { PayrollDraftContent, PayrollRecipient } from "@bduck/shared-types";
import { getSelectedLocalFirebaseTarget } from "@/lib/localFirebaseTarget";
import { useUserStore } from "@/stores/useUserStore";
const dbName = "payroll-private-v1";
export interface PayrollLocalDraft { id: string; revision: number; facility_id: string; content: PayrollDraftContent; people: PayrollRecipient[] }
function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("keys"); request.result.createObjectStore("drafts"); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
function get<T>(db: IDBDatabase, store: string, key: string) {
  return new Promise<T | undefined>((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
function put(db: IDBDatabase, store: string, key: string, value: unknown) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite"); tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
}
const scope = (user: string) => getSelectedLocalFirebaseTarget() + ":" + user;
async function localKey(db: IDBDatabase, user: string) {
  const key = await get<CryptoKey>(db, "keys", scope(user));
  if (key) return key;
  const created = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt","decrypt"]);
  await put(db, "keys", scope(user), created); return created;
}
export async function savePayrollLocalDraft(user: string, value: PayrollLocalDraft) {
  if (useUserStore.getState().user?.id !== user) return;
  const db = await open();
  try {
    const key = await localKey(db, user); const iv = crypto.getRandomValues(new Uint8Array(12)); const aad = new TextEncoder().encode(scope(user));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, new TextEncoder().encode(JSON.stringify(value)));
    if (useUserStore.getState().user?.id !== user) return;
    await put(db, "drafts", scope(user), { iv, ciphertext });
  } finally { db.close(); }
}
export async function loadPayrollLocalDraft(user: string) {
  const db = await open();
  try {
    const data = await get<{ iv: Uint8Array; ciphertext: ArrayBuffer }>(db, "drafts", scope(user));
    const key = await get<CryptoKey>(db, "keys", scope(user));
    if (!data || !key) return null;
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.iv as BufferSource,
      additionalData: new TextEncoder().encode(scope(user)) }, key, data.ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext)) as PayrollLocalDraft;
  } finally { db.close(); }
}
export async function clearPayrollLocalDrafts() {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["keys","drafts"], "readwrite"); tx.objectStore("keys").clear(); tx.objectStore("drafts").clear();
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  }); db.close();
}
// The subscription survives unmounting the notification page; logout must clear keys too.
if (typeof window !== "undefined") useUserStore.subscribe((next, previous) => {
  if ((previous.user && next.user?.id !== previous.user.id) || ["REVOKED", "ERROR", "SIGNED_OUT"].includes(next.accessStatus))
    void clearPayrollLocalDrafts().catch(() => console.error("PAYROLL_LOCAL_CACHE_CLEAR_FAILED"));
});
