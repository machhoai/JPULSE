import {
  AuditAction,
  InvoiceOrderSyncPurpose,
  InvoiceOrderSyncRunStatus,
  type MeInvoiceStoreConfig,
} from "@bduck/shared-types";

import { invoiceDocumentRepository } from "../repositories/invoiceDocumentRepository.js";
import {
  invoiceOrderRepository,
  invoiceSourceOrderDocumentId,
  type SourceOrderWriteResult,
} from "../repositories/invoiceOrderRepository.js";
import {
  meInvoiceConfigRepository,
  type StoredMeInvoiceAccount,
} from "../repositories/meInvoiceConfigRepository.js";
import { logAudit, type AuditMetadata } from "./auditService.js";
import type { AuthorizationService } from "./authorization/index.js";
import { resolveExternalStoreBinding } from "./externalStoreBindingService.js";
import { prepareInvoiceDocumentFromSourceOrder } from "./invoiceDocumentService.js";
import type { InvoiceOrderSyncInput } from "./invoiceOrderSyncSchemas.js";
import { invoiceOrderShouldAppearInList } from "./invoiceOrderVisibilityPolicy.js";
import { syncPosInvoiceOrdersForDate } from "./invoicePosOrderSyncService.js";
import { sourceOrderIsInvoiceEligible } from "./invoiceReconciliationPolicy.js";
import { toPublicStoreConfig } from "./meInvoiceStoreConfigService.js";
import { loadWarehouseById } from "./warehouseService.js";

const DETAIL_CONCURRENCY = 5;

interface InvoiceStoreContext {
  storeConfig: MeInvoiceStoreConfig | null;
  account: StoredMeInvoiceAccount | null;
}

const mapLimit = async <T, R>(
  values: T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> => {
  const result: R[] = new Array(values.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      result[index] = await mapper(values[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, worker),
  );
  return result;
};

const loadInvoiceStoreContext = async (
  warehouseId: string,
): Promise<InvoiceStoreContext> => {
  const storedStoreConfig = await meInvoiceConfigRepository.getStoreConfig(
    warehouseId,
  );
  const storeConfig =
    storedStoreConfig && storedStoreConfig.is_deleted !== true
      ? toPublicStoreConfig(storedStoreConfig)
      : null;
  const accountId = storeConfig?.meinvoice_account_id;
  const account = accountId
    ? await meInvoiceConfigRepository.getAccount(accountId)
    : null;
  return { storeConfig, account };
};

const emptyWriteResult = (): SourceOrderWriteResult => ({
  inserted_count: 0,
  updated_count: 0,
  unchanged_count: 0,
});

const addWriteResult = (
  target: SourceOrderWriteResult,
  value: SourceOrderWriteResult,
) => {
  target.inserted_count += value.inserted_count;
  target.updated_count += value.updated_count;
  target.unchanged_count += value.unchanged_count;
};

export const syncInvoiceOrdersForDate = async (
  input: InvoiceOrderSyncInput,
  actorId: string,
  authorization: AuthorizationService,
  auditMetadata?: AuditMetadata,
) => {
  const permission =
    input.purpose === InvoiceOrderSyncPurpose.ISSUE
      ? "invoices.prepare"
      : "invoices.reconcile";
  const binding = await resolveExternalStoreBinding(
    "JOYWORLD_LEGACY",
    input.warehouse_id,
  );
  const canonicalWarehouseId =
    binding?.canonical_warehouse_id ?? input.warehouse_id;
  authorization.assert(permission, canonicalWarehouseId);
  const memberWarehouseIds = binding?.member_warehouse_ids ?? [input.warehouse_id];
  const sourceAccountKey =
    binding?.source_account_key ?? "joyworld-legacy-default";
  await Promise.all(memberWarehouseIds.map(loadWarehouseById));
  const contextEntries = await Promise.all(
    memberWarehouseIds.map(async (warehouseId) => [
      warehouseId,
      await loadInvoiceStoreContext(warehouseId),
    ] as const),
  );
  const contexts = new Map(contextEntries);

  const startedAt = new Date();
  const runId = await invoiceOrderRepository.createRun({
    warehouse_id: canonicalWarehouseId,
    requested_warehouse_id: input.warehouse_id,
    partition_warehouse_ids: memberWarehouseIds,
    external_store_binding_id: binding?.id ?? null,
    business_date: input.business_date,
    purpose: input.purpose,
    status: InvoiceOrderSyncRunStatus.RUNNING,
    order_count: 0,
    inserted_count: 0,
    updated_count: 0,
    unchanged_count: 0,
    error_code: null,
    requested_by: actorId,
    started_at: startedAt,
    completed_at: null,
  });

  try {
    const posSyncEntries = await Promise.all(
      memberWarehouseIds.map(async (warehouseId) => {
        const context = contexts.get(warehouseId) ?? {
          storeConfig: null,
          account: null,
        };
        return [
          warehouseId,
          await syncPosInvoiceOrdersForDate({
            warehouseId,
            businessDate: input.business_date,
            runId,
            ...context,
            externalSourceAccountKey: sourceAccountKey,
          }),
        ] as const;
      }),
    );
    const counts = emptyWriteResult();
    let orderCount = 0;
    let legacySkippedCount = 0;
    const syncTime = new Date();
    for (const [, result] of posSyncEntries) {
      addWriteResult(counts, result);
      orderCount += result.writes.length;
      legacySkippedCount += result.orders.length - result.writes.length;
    }
    let draftCreatedCount = 0;
    let draftRebasedCount = 0;
    let draftRebaseSkippedCount = 0;
    const partitionCounts: Record<string, number> = {};
    for (const [warehouseId, result] of posSyncEntries) {
      partitionCounts[warehouseId] = result.writes.length;
      const context = contexts.get(warehouseId);
      if (
        input.purpose !== InvoiceOrderSyncPurpose.ISSUE ||
        !context?.storeConfig ||
        !context.account ||
        !authorization.can("invoices.prepare", warehouseId)
      ) {
        continue;
      }
      const storeConfig = context.storeConfig;
      const account = context.account;
      const candidates = result.writes.filter((write) => {
        if (!sourceOrderIsInvoiceEligible(write.projection)) return false;
        const preflight = write.projection.preflight as
          | {
              issues?: Array<{ code?: string }>;
            }
          | undefined;
        return !preflight?.issues?.some(
          (issue) => issue.code === "BEFORE_GO_LIVE",
        );
      });
      const existingDocuments = await invoiceDocumentRepository.getDocuments(
        candidates.map((write) =>
          invoiceSourceOrderDocumentId(
            warehouseId,
            write.source_order_id,
            "JPOS",
          ),
        ),
        warehouseId,
      );
      const existingById = new Map(
        existingDocuments.map((document) => [String(document.id), document]),
      );
      const prepared = await mapLimit(
        candidates,
        DETAIL_CONCURRENCY,
        async (write) => {
          const id = invoiceSourceOrderDocumentId(
            warehouseId,
            write.source_order_id,
            "JPOS",
          );
          const existing = existingById.get(id);
          try {
            const preparedDocument = await prepareInvoiceDocumentFromSourceOrder(
              id,
              warehouseId,
              write.source_payload_hash,
              actorId,
              authorization,
              auditMetadata,
              {
                safeAutoRebase: true,
                context: {
                  storeConfig,
                  account,
                },
              },
            );
            return !existing
              ? "CREATED"
              : Number(preparedDocument.revision) > Number(existing.revision)
                ? "REBASED"
                : "UNCHANGED";
          } catch (error) {
            const code = (error as { data?: { code?: string } })?.data?.code;
            if (
              code === "INVOICE_AUTO_REBASE_REQUIRES_REVIEW" ||
              code === "INVOICE_DOCUMENT_NOT_REBASABLE"
            ) {
              return "SKIPPED";
            }
            throw error;
          }
        },
      );
      draftCreatedCount += prepared.filter((item) => item === "CREATED").length;
      draftRebasedCount += prepared.filter((item) => item === "REBASED").length;
      draftRebaseSkippedCount += prepared.filter(
        (item) => item === "SKIPPED",
      ).length;
    }
    const result = {
      id: runId,
      ...input,
      canonical_warehouse_id: canonicalWarehouseId,
      partition_warehouse_ids: memberWarehouseIds,
      partition_counts: partitionCounts,
      order_count: orderCount,
      draft_created_count: draftCreatedCount,
      draft_rebased_count: draftRebasedCount,
      draft_rebase_skipped_count: draftRebaseSkippedCount,
      pos_order_count: orderCount,
      legacy_skipped_count: legacySkippedCount,
      pos_counts: counts,
      ...counts,
    };
    await invoiceOrderRepository.updateRun(runId, {
      status: InvoiceOrderSyncRunStatus.COMPLETED,
      ...counts,
      pos_order_count: orderCount,
      legacy_skipped_count: legacySkippedCount,
      pos_inserted_count: counts.inserted_count,
      pos_updated_count: counts.updated_count,
      pos_unchanged_count: counts.unchanged_count,
      pos_draft_created_count: draftCreatedCount,
      order_count: orderCount,
      draft_created_count: draftCreatedCount,
      draft_rebased_count: draftRebasedCount,
      draft_rebase_skipped_count: draftRebaseSkippedCount,
      completed_at: syncTime,
    });
    await logAudit({
      entity_type: "INVOICE_ORDER_SYNC_RUN",
      entity_id: runId,
      warehouse_id: canonicalWarehouseId,
      action: AuditAction.CREATE,
      user_id: actorId,
      old_value: null,
      new_value: result,
      notes: `JPOS full-day invoice source sync (${input.purpose})`,
      ...auditMetadata,
    });
    return result;
  } catch (error) {
    const errorCode =
      error instanceof Error
        ? error.message.slice(0, 120)
        : "UNKNOWN_SYNC_ERROR";
    await invoiceOrderRepository.updateRun(runId, {
      status: InvoiceOrderSyncRunStatus.FAILED,
      error_code: errorCode,
      completed_at: new Date(),
    });
    throw error;
  }
};

export const listInvoiceSourceOrders = async (
  warehouseId: string,
  businessDate: string,
  authorization: AuthorizationService,
) => {
  authorization.assert("invoices.read", warehouseId);
  const orders = await invoiceOrderRepository.listOrders(
    warehouseId,
    businessDate,
  );
  const visibleOrders = orders.filter(invoiceOrderShouldAppearInList);
  const documents = await invoiceDocumentRepository.getDocuments(
    visibleOrders
      .map((order) => order.invoice_document_id)
      .filter((id): id is string => typeof id === "string" && Boolean(id)),
    warehouseId,
  );
  const documentsById = new Map(
    documents.map((document) => [String(document.id), document]),
  );
  return visibleOrders.map((order) => {
    const document =
      typeof order.invoice_document_id === "string"
        ? documentsById.get(order.invoice_document_id)
        : undefined;
    const documentSourcePayloadHash =
      typeof document?.source_payload_hash === "string"
        ? document.source_payload_hash
        : null;
    return {
      ...order,
      invoice_document_source_payload_hash: documentSourcePayloadHash,
      invoice_document_stale: Boolean(
        documentSourcePayloadHash &&
        documentSourcePayloadHash !== order.source_payload_hash,
      ),
    };
  });
};

export const getInvoiceSourceOrder = async (
  id: string,
  warehouseId: string,
  authorization: AuthorizationService,
) => {
  authorization.assert("invoices.read", warehouseId);
  const order = await invoiceOrderRepository.getOrder(id, warehouseId);
  if (!order) {
    throw {
      statusCode: 404,
      messages: {
        vi: "Không tìm thấy đơn hàng đã đồng bộ.",
        zh: "找不到已同步的订单。",
      },
    };
  }
  const document =
    typeof order.invoice_document_id === "string"
      ? await invoiceDocumentRepository.getDocument(
          order.invoice_document_id,
          warehouseId,
        )
      : null;
  const documentSourcePayloadHash =
    typeof document?.source_payload_hash === "string"
      ? document.source_payload_hash
      : null;
  return {
    ...order,
    invoice_document_source_payload_hash: documentSourcePayloadHash,
    invoice_document_stale: Boolean(
      documentSourcePayloadHash &&
      documentSourcePayloadHash !== order.source_payload_hash,
    ),
  };
};
