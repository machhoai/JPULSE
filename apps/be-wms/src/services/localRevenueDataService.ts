import { meInvoiceConfigRepository } from "../repositories/meInvoiceConfigRepository.js";
import { posInvoiceOrderRepository } from "../repositories/posInvoiceOrderRepository.js";
import { fetchRevenueProductGroups } from "../repositories/revenueProductRepository.js";

import {
  buildLocalRevenuePeriod,
  type RevenuePeriodData,
} from "./localRevenuePeriodBuilder.js";
import {
  toVietnamIsoRange,
  type RevenueDateRange,
} from "./revenueDateRange.js";
import { toPublicStoreConfig } from "./meInvoiceStoreConfigService.js";

export type { RevenuePeriodData } from "./localRevenuePeriodBuilder.js";

export async function loadLocalRevenuePeriod(
  warehouseId: string | readonly string[],
  range: RevenueDateRange,
  invoicePreparation = false,
): Promise<RevenuePeriodData> {
  const { startIso, endExclusiveIso } = toVietnamIsoRange(range);
  const warehouseIds = [
    ...new Set(typeof warehouseId === "string" ? [warehouseId] : warehouseId),
  ];
  const sourceOrders = [];
  // Bound Firestore concurrency for users managing many stores.
  for (let index = 0; index < warehouseIds.length; index += 5) {
    const batches = await Promise.all(
      warehouseIds
        .slice(index, index + 5)
        .map((id) =>
          posInvoiceOrderRepository.listPaidForDate(
            id,
            startIso,
            endExclusiveIso,
          ),
        ),
    );
    sourceOrders.push(...batches.flat());
  }
  const groups = sourceOrders.length ? await fetchRevenueProductGroups() : {};
  const invoiceConfigs = invoicePreparation
    ? new Map(await Promise.all(warehouseIds.map(async (id) => {
        const config = await meInvoiceConfigRepository.getStoreConfig(id);
        return [id, config && config.is_deleted !== true ? toPublicStoreConfig(config) : null] as const;
      })))
    : undefined;
  return buildLocalRevenuePeriod(sourceOrders, range, groups, invoiceConfigs);
}

export async function loadLocalTaxByDate(
  warehouseId: string,
  range: RevenueDateRange,
): Promise<Record<string, number>> {
  const period = await loadLocalRevenuePeriod(warehouseId, range);
  return Object.fromEntries(
    period.dailyRows.map((row) => [row.date, row.totalTax]),
  );
}
