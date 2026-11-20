import { randomUUID } from "node:crypto";

import type {
  PosOrderCancelResult,
  PosOrderDetail,
  PosOrderListResult,
  PosOrderRefundPreview,
} from "@bduck/shared-types";

import { posOrderCancellationRepository } from "../repositories/posOrderCancellationRepository.js";
import {
  posOrderRepository,
} from "../repositories/posOrderRepository.js";

import type { AuditMetadata } from "./auditService.js";
import type { AuthorizationService } from "./authorization/index.js";
import { posOrderError as domainError } from "./posOrderErrors.js";
import { decidePosOrderCancellation, derivePosOrderPaymentStatus } from "./posOrderPolicy.js";
import type {
  PosOrderCancelValue,
  PosOrderListQuery,
} from "./posOrderSchemas.js";

const loadAuthorizedDetail = async (
  warehouseId: string,
  localOrderId: string,
  authorization: AuthorizationService,
): Promise<PosOrderDetail> => {
  authorization.assert("pos.orders.read", warehouseId);
  const detail = await posOrderRepository.findDetail(localOrderId, warehouseId);
  if (!detail) throw domainError("ORDER_NOT_FOUND", 404);
  return detail;
};

export const listPosOrders = async (input: {
  warehouseId: string;
  query: PosOrderListQuery;
  authorization: AuthorizationService;
}): Promise<PosOrderListResult> => {
  input.authorization.assert("pos.orders.read", input.warehouseId);
  return posOrderRepository.list(input.warehouseId, input.query);
};

export const getPosOrder = async (input: {
  warehouseId: string;
  localOrderId: string;
  authorization: AuthorizationService;
}): Promise<PosOrderDetail> =>
  loadAuthorizedDetail(
    input.warehouseId,
    input.localOrderId,
    input.authorization,
  );

export const getPosOrderRefundPreview = async (input: {
  warehouseId: string;
  localOrderId: string;
  authorization: AuthorizationService;
}): Promise<PosOrderRefundPreview> => {
  const detail = await loadAuthorizedDetail(input.warehouseId, input.localOrderId, input.authorization);
  const raw = await posOrderRepository.findRaw(input.localOrderId);
  if (raw?.warehouseId !== input.warehouseId) throw domainError("ORDER_NOT_FOUND", 404);
  const decision = decidePosOrderCancellation(raw, [detail.invoice.status]);
  const hasPermission = input.authorization.can("pos.orders.cancel_local", input.warehouseId);
  const legacyPending = detail.cancellation && detail.cancellation.status !== "SUCCEEDED";
  const blockedReason = !hasPermission ? "CANCEL_PERMISSION_DENIED"
    : detail.invoice.blocked ? "INVOICE_LOCKED"
    : legacyPending ? (decision.code ?? "REFUND_UNKNOWN") : decision.code;
  return {
    mode: decision.mode,
    refundable: decision.allowed && !decision.idempotent && !blockedReason,
    amount: derivePosOrderPaymentStatus(raw) === "DRAFT" ? 0 : detail.totalAmount,
    paymentMethodNames: detail.paymentMethodName,
    remoteOrderId: detail.remoteOrderId,
    remoteOrderNumber: detail.hkOrderNumber,
    blockedReason,
  };
};

export const cancelPosOrder = async (input: {
  warehouseId: string;
  localOrderId: string;
  value: PosOrderCancelValue;
  actorId: string;
  actorName: string;
  authorization: AuthorizationService;
  auditMetadata?: AuditMetadata;
}): Promise<PosOrderCancelResult> => {
  input.authorization.assert("pos.orders.read", input.warehouseId);
  input.authorization.assert("pos.orders.cancel_local", input.warehouseId);
  let result;
  try {
    result = await posOrderCancellationRepository.begin({
      localOrderId: input.localOrderId,
      warehouseId: input.warehouseId,
      expectedVersion: input.value.expectedVersion,
      reason: input.value.reason,
      actionTime: input.value.action_time,
      refundConfirmed: input.value.refundConfirmed,
      actorId: input.actorId,
      actorName: input.actorName,
      operationId: randomUUID(),
      context: input.auditMetadata,
    });
  } catch (error) {
    const { code, statusCode } = error as { code?: string; statusCode?: number };
    throw domainError(code ?? "CANCEL_FAILED", statusCode);
  }
  const order = await loadAuthorizedDetail(input.warehouseId, input.localOrderId, input.authorization);
  return { order, idempotent: result.idempotent };
};
