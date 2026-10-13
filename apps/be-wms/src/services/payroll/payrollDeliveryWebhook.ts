import { createHash, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { z } from "zod";
import { payrollTrackingEvents, payrollTrackingPatch, type PayrollDeliveryStatus, type PayrollSnapshot, type PayrollTrackingField } from "@bduck/shared-types";
import { db } from "../../config/firebase.js";
import { payrollCollections, payrollRef, writePayrollAudit } from "../../repositories/payrollRepository.js";
import { touchPayrollHistory } from "../../repositories/payrollHistoryRepository.js";
import { readPayrollPayload, storePayrollPayload } from "./payrollCrypto.js";
import { payrollError, payrollId } from "./payrollSchemas.js";

const statuses: Record<string, PayrollDeliveryStatus> = { delivered: "DELIVERED", deferred: "DEFERRED", soft_bounce: "SOFT_BOUNCE", softBounce: "SOFT_BOUNCE",
  hard_bounce: "HARD_BOUNCE", hardBounce: "HARD_BOUNCE", blocked: "BLOCKED", invalid: "INVALID", invalid_email: "INVALID", error: "ERROR" };
const schema = z.object({ event: z.string().max(60), email: z.string().email().max(320), "message-id": z.string().max(500).optional(),
  "X-Mailin-custom": z.string().max(2000).optional(), "X-Mailin-Custom": z.string().max(2000).optional(), reason: z.string().max(10000).optional(),
  ts_event: z.number().int().positive().optional(), ts_epoch: z.number().int().positive().optional(), ts: z.number().int().positive().optional() });
const normalizedMessage = (value: string) => value.trim().replace(/^<|>$/g, "");
const supported = (event: string) => Object.hasOwn(statuses, event) || Object.hasOwn(payrollTrackingEvents, event);
function authorize(req: Request) {
  const expected = process.env.PAYROLL_BREVO_WEBHOOK_SECRET || "";
  if (expected.length < 32) payrollError("Chưa cấu hình secret webhook Brevo (tối thiểu 32 ký tự).", "尚未配置 Brevo webhook 密钥（至少 32 个字符）。", 503);
  const actual = req.header("authorization")?.replace(/^Bearer /, "") || "";
  const a = createHash("sha256").update(actual).digest(), b = createHash("sha256").update(expected).digest();
  if (!actual || !timingSafeEqual(a, b)) payrollError("Webhook Brevo không được xác thực.", "Brevo webhook 身份验证失败。", 401);
}
async function receive(input: unknown) {
  if (input && typeof input === "object" && "event" in input && typeof input.event === "string" && !supported(input.event)) return { ignored: true };
  const event = schema.parse(input);
  if (!supported(event.event)) return { ignored: true };
  const custom = event["X-Mailin-custom"] || event["X-Mailin-Custom"] || "";
  let recordId = custom.match(/(?:^|\|)payroll_history:([A-Za-z0-9_-]+)(?:\||$)/)?.[1];
  if (recordId) recordId = payrollId.parse(recordId);
  if (!recordId && event["message-id"]) {
    const message = normalizedMessage(event["message-id"]);
    const matches = await db.collection(payrollCollections.history).where("message_id", "in", [message, "<" + message + ">"]).limit(2).get();
    if (matches.size === 1) recordId = matches.docs[0].id;
  }
  if (!recordId) return { ignored: true };
  const ref = payrollRef("history", recordId); const doc = await ref.get();
  if (!doc.exists || doc.get("is_deleted")) return { ignored: true };
  const facility = doc.get("facility_id") as string;
  const snapshot = await readPayrollPayload<PayrollSnapshot>(doc.get("payload_path"), `snapshot:${doc.get("job_id")}:${doc.get("recipient_id")}:${facility}`);
  if (snapshot.email.trim().toLowerCase() !== event.email.trim().toLowerCase()) return { ignored: true };
  const stamp = event.ts_epoch ?? event.ts_event ?? event.ts;
  const occurredAt = stamp ? new Date(stamp < 1e12 ? stamp * 1000 : stamp) : new Date();
  if (!Number.isFinite(occurredAt.getTime()) || occurredAt.getTime() > Date.now() + 86400000) return { ignored: true };
  const delivery = statuses[event.event];
  const eventId = createHash("sha256").update(JSON.stringify({ recordId, event: event.event, stamp: stamp || 0, reason: event.reason || "", message: event["message-id"] || "" })).digest("hex");
  const eventRef = db.collection("payroll_delivery_events").doc(eventId);
  if ((await eventRef.get()).exists) return { duplicate: true };
  const path = delivery ? await storePayrollPayload("delivery:" + recordId + ":" + facility, { reason: event.reason || "", event: event.event, occurred_at: occurredAt.toISOString() }) : null;
  return db.runTransaction(async tx => {
    const [seen, current] = await Promise.all([tx.get(eventRef), tx.get(ref)]);
    if (seen.exists) return { duplicate: true };
    const previousTime = current.get("delivery_updated_at")?.toMillis?.() || 0;
    const oldStatus = current.get("delivery_status") as PayrollDeliveryStatus | undefined;
    const ranks: Record<string, number> = { PENDING: 0, DEFERRED: 1, ERROR: 2, INVALID: 2, BLOCKED: 2, SOFT_BOUNCE: 2, HARD_BOUNCE: 2, DELIVERED: 3 };
    const newer = Boolean(delivery) && (occurredAt.getTime() > previousTime || occurredAt.getTime() === previousTime && ranks[delivery] > (ranks[oldStatus || "PENDING"] || 0));
    const oldTracking = current.get("tracking") || {};
    const trackingMillis: Partial<Record<PayrollTrackingField, number>> = {};
    for (const field of Object.values(payrollTrackingEvents).flat()) trackingMillis[field] = oldTracking[field]?.toMillis?.();
    const trackingPatch = payrollTrackingPatch(event.event, occurredAt.getTime(), trackingMillis);
    const tracking = { ...oldTracking, ...Object.fromEntries(Object.entries(trackingPatch).map(([field, stamp]) => [field, new Date(stamp)])) };
    const changed = newer || Object.keys(trackingPatch).length > 0;
    tx.create(eventRef, { record_id: recordId, facility_id: facility, event: event.event, ...(delivery ? { status: delivery } : {}), occurred_at: occurredAt, received_at: new Date(), applied: changed });
    if (changed && current.exists && !current.get("is_deleted")) {
      const patch = { ...(newer ? { delivery_status: delivery, delivery_updated_at: occurredAt, delivery_payload_path: path } : {}), tracking, updated_at: new Date(), sync_time: new Date() };
      tx.update(ref, patch); touchPayrollHistory(tx, facility);
      writePayrollAudit(tx, payrollCollections.history, recordId!, "brevo-webhook", facility, current.data()!, { ...current.data(), ...patch });
    }
    return { applied: changed };
  });
}
export async function receivePayrollDeliveryWebhook(req: Request) {
  authorize(req);
  const events = Array.isArray(req.body) ? z.array(z.unknown()).max(25).parse(req.body) : [req.body];
  for (const event of events) await receive(event);
  return { accepted: true };
}
