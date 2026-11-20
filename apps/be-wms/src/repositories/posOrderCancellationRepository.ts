import { randomUUID } from "node:crypto";

import { db } from "../config/firebase.js";
import { resolveExternalStoreBinding } from "../services/externalStoreBindingService.js";
import { invoiceGlobalSourceIdentityDocumentId } from "../services/invoiceSourceIdentityPolicy.js";
import {
  decidePosOrderCancellation,
  derivePosOrderPaymentStatus,
  type PosOrderCancellationMode,
} from "../services/posOrderPolicy.js";

import { buildPosOrderCancellationAudit } from "./posOrderCancellationAudit.js";
import {
  buildPosOrderSummaryDocument,
  type RawPosOrder,
} from "./posOrderRepository.js";

export interface PosOrderCancellationOperation {
  operation_id: string;
  local_order_id: string;
  warehouse_id: string;
  mode: PosOrderCancellationMode;
  status: "PENDING" | "REFUNDING" | "SUCCEEDED" | "FAILED" | "UNKNOWN";
  reason: string;
  action_time: string;
  sync_time: string;
  cancelled_by: string;
  cancelled_by_name: string;
  biz_code: string | null;
  remote_order_id: string | null;
  remote_order_number: string | null;
  refund_order_number: string | null;
  refunded_amount?: number;
  refund_confirmed_at?: string | null;
  refund_payment_method?: string | null;
  last_error: string | null;
  attempt_count: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  is_deleted: false;
}

export class PosOrderCancellationRepositoryError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
  ) {
    super(code);
  }
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export const posOrderCancellationRepository = {
  async begin(input: {
    localOrderId: string;
    warehouseId: string;
    expectedVersion: number;
    reason: string;
    actionTime: string;
    actorId: string;
    actorName: string;
    operationId: string;
    refundConfirmed: boolean;
    context?: {
      ip_address?: string | null;
      device_id?: string | null;
      session_token?: string | null;
    };
  }): Promise<{ idempotent: boolean }> {
    const orderRef = db.collection("pos_orders").doc(input.localOrderId);
    const operationRef = db
      .collection("pos_order_cancellations")
      .doc(input.localOrderId);
    const sources = db.collection("invoice_source_orders")
      .where("warehouse_id", "==", input.warehouseId);

    return db.runTransaction(async (transaction) => {
      const [orderSnapshot, operationSnapshot] = await Promise.all([
        transaction.get(orderRef),
        transaction.get(operationRef),
      ]);
      if (!orderSnapshot.exists) {
        throw new PosOrderCancellationRepositoryError("ORDER_NOT_FOUND", 404);
      }
      const order = orderSnapshot.data() as RawPosOrder;
      if (order.warehouseId !== input.warehouseId) {
        throw new PosOrderCancellationRepositoryError("ORDER_NOT_FOUND", 404);
      }
      if (operationSnapshot.exists) {
        const existing = operationSnapshot.data() as PosOrderCancellationOperation;
        if (existing.status === "SUCCEEDED") return { idempotent: true };
        // Existing JoyWorld operations must be reconciled before another refund.
        throw new PosOrderCancellationRepositoryError(
          existing.status === "REFUNDING" ? "REFUND_IN_PROGRESS" : "REFUND_UNKNOWN",
          409,
        );
      }

      const queries = [sources.where("local_order_id", "==", input.localOrderId)];
      const hkOrderNumber = text(order.hkOrderNumber);
      if (hkOrderNumber) queries.push(sources.where("order_number", "==", hkOrderNumber));
      const sourceSnapshots = await Promise.all(queries.map((query) => transaction.get(query)));
      const matchedSources = new Map(sourceSnapshots.flatMap((snapshot) =>
        snapshot.docs.map((document) => [document.id, document] as const),
      ));
      const invoiceSources = new Map<string, FirebaseFirestore.DocumentSnapshot>(matchedSources);
      if (hkOrderNumber) {
        const binding = await resolveExternalStoreBinding("JOYWORLD_LEGACY", input.warehouseId);
        const identityId = invoiceGlobalSourceIdentityDocumentId(
          binding?.source_account_key ?? "joyworld-legacy-default",
          hkOrderNumber,
        );
        const identity = await transaction.get(db.collection("invoice_source_identities").doc(identityId));
        const sourceId = text(identity.get("source_order_document_id"));
        if (sourceId && !invoiceSources.has(sourceId)) {
          const source = await transaction.get(db.collection("invoice_source_orders").doc(sourceId));
          if (source.exists) invoiceSources.set(sourceId, source);
        }
      }
      const invoiceIds = new Set<string>();
      for (const source of invoiceSources.values()) {
        invoiceIds.add(text(source.get("invoice_document_id")) ?? source.id);
      }
      const invoiceSnapshots = await Promise.all([...invoiceIds].map((id) =>
        transaction.get(db.collection("invoice_documents").doc(id)),
      ));
      const invoiceStatuses = [
        ...[...invoiceSources.values()].map((source) => source.get("invoice_document_status")),
        ...invoiceSnapshots.map((invoice) => invoice.get("status")),
      ];
      if ([...invoiceSources.values()].some((source) =>
          source.get("match_status") === "MATCHED" ||
          source.get("warehouse_id") !== input.warehouseId) ||
          invoiceSnapshots.some((invoice) => Boolean(invoice.get("active_issue_job_id")))) {
        throw new PosOrderCancellationRepositoryError("INVOICE_LOCKED", 409);
      }
      const decision = decidePosOrderCancellation(order, invoiceStatuses);
      if (!decision.allowed) {
        throw new PosOrderCancellationRepositoryError(decision.code ?? "CANCEL_BLOCKED", 409);
      }
      if (decision.idempotent) return { idempotent: true };
      const version = Number(order.version ?? 0);
      if (version !== input.expectedVersion) {
        throw new PosOrderCancellationRepositoryError(
          "ORDER_VERSION_CONFLICT",
          409,
        );
      }

      const now = new Date().toISOString();
      const paid = derivePosOrderPaymentStatus(order) !== "DRAFT";
      const refundedAmount = paid ? order.totalAmount : 0;
      if (!Number.isFinite(refundedAmount) || refundedAmount < 0) {
        throw new PosOrderCancellationRepositoryError("INVALID_REFUND_AMOUNT", 409);
      }
      if (refundedAmount > 0 && !input.refundConfirmed) {
        throw new PosOrderCancellationRepositoryError("REFUND_CONFIRMATION_REQUIRED", 400);
      }
      const paymentWatchId = text(order.paymentWatchId);
      const paymentWatch = paymentWatchId
        ? await transaction.get(db.collection("pos_payment_status").doc(paymentWatchId))
        : null;
      const paymentStatus = paid ? "REFUNDED" : "DRAFT";
      const operation: PosOrderCancellationOperation = {
        operation_id: input.operationId,
        local_order_id: input.localOrderId,
        warehouse_id: input.warehouseId,
        mode: "LOCAL_ONLY",
        status: "SUCCEEDED",
        reason: input.reason,
        action_time: input.actionTime,
        sync_time: now,
        cancelled_by: input.actorId,
        cancelled_by_name: input.actorName,
        biz_code: null,
        remote_order_id: text(order.remoteOrderId),
        remote_order_number: text(order.hkOrderNumber),
        refund_order_number: null,
        refunded_amount: refundedAmount,
        refund_confirmed_at: refundedAmount > 0 ? now : null,
        refund_payment_method: refundedAmount > 0
          ? text(order.paymentMethodId) ?? text(order.paymentMethod) ?? text(order.paymentMethodName)
          : null,
        last_error: null,
        attempt_count: 0,
        created_at: now,
        updated_at: now,
        completed_at: now,
        is_deleted: false,
      };
      const orderUpdate = {
        status: "CANCELLED",
        paymentStatus,
        syncStatus: "CANCELLED",
        syncOperationId: null,
        refundedAmount,
        refundedAt: operation.refund_confirmed_at,
        cancellationOperationId: input.operationId,
        cancelledAt: input.actionTime,
        cancelledBy: input.actorId,
        cancelReason: input.reason,
        version: version + 1,
        updatedAt: now,
      };
      transaction.create(operationRef, operation);
      transaction.update(orderRef, orderUpdate);
      if (paymentWatch?.exists && paymentWatch.get("localOrderId") === input.localOrderId) {
        transaction.update(paymentWatch.ref, {
          orderStatus: "CANCELLED",
          paymentStatus: "CANCELLED",
          updatedAt: now,
        });
      }
      for (const source of matchedSources.values()) {
        transaction.update(source.ref, {
          source_status: 4,
          pos_order_status: "CANCELLED",
          "preflight.issue_eligible": false,
          updated_at: new Date(now),
        });
      }
      for (const invoice of invoiceSnapshots) {
        if (invoice.exists) {
          transaction.update(invoice.ref, {
            status: "CANCELLED",
            issue_eligible: false,
            updated_at: new Date(now),
          });
        }
      }
      transaction.set(
        db.collection("pos_order_summaries").doc(input.localOrderId),
        buildPosOrderSummaryDocument(input.localOrderId, {
          ...order,
          ...orderUpdate,
        }),
        { merge: false },
      );
      const auditId = randomUUID();
      transaction.create(
        db.collection("audit_logs").doc(auditId),
        buildPosOrderCancellationAudit({
          id: auditId,
          order,
          actorId: input.actorId,
          actorName: input.actorName,
          actionTime: input.actionTime,
          oldValue: {
            status: order.status,
            paymentStatus: order.paymentStatus ?? null,
            syncStatus: order.syncStatus ?? null,
          },
          newValue: orderUpdate,
          notes: "Recorded local JPOS cancellation",
          context: input.context,
        }),
      );
      return { idempotent: false };
    });
  },
};
