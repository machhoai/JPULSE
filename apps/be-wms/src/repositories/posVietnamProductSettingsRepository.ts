import { randomUUID } from "node:crypto";

import {
  AuditAction,
  type PosHkCatalogProduct,
  type PosVietnamProductSettings,
  type PosVietnamProductSettingsInput,
  type PosVietnamSalesRollout,
} from "@bduck/shared-types";

import { db } from "../config/firebase.js";
import type { AuditMetadata } from "../services/auditService.js";
import { isPosProductUpstreamVisible } from "../services/posProductVisibilityPolicy.js";
import { JPOS_PRODUCTS_COLLECTION } from "./posProductVisibilityRepository.js";

const storeRef = (warehouseId: string) => db.collection("pos_vietnam_product_settings").doc(warehouseId);
const productsForStore = (warehouseId: string) => storeRef(warehouseId).collection("products");

const localCatalogFields = new Set([
  "goodsName", "description", "category", "subCategory", "typeId", "typeName", "groupKey",
  "foreColor", "backColor", "ticketsPerUnit", "amount", "giftNo", "price", "afterTaxPrice",
  "taxRate", "taxRateType", "isEnabled", "isOpenSales", "isCategoryEnabled", "is_deleted",
  "syncStatus", "lastSyncAt",
]);

type StoredProductSettings = PosVietnamProductSettings & { local_product?: Record<string, unknown> };

const readRollout = (data: FirebaseFirestore.DocumentData | undefined): PosVietnamSalesRollout => ({
  enabled: data?.enabled === true,
  version: typeof data?.version === "number" ? data.version : 0,
  ...(data?.member_packages_enabled === true ? { member_packages_enabled: true } : {}),
});

const number = (value: unknown) =>
  (typeof value === "number" || (typeof value === "string" && value.trim())) &&
  Number.isFinite(Number(value)) ? Number(value) : null;

export class PosVietnamProductSettingsError extends Error {
  constructor(
    readonly statusCode: number,
    readonly messages: { vi: string; zh: string },
  ) {
    super(messages.vi);
  }
}

export const posVietnamProductSettingsRepository = {
  async getRollout(warehouseId: string) {
    return readRollout((await storeRef(warehouseId).get()).data());
  },

  async saveRollout(input: {
    warehouseId: string;
    actorId: string;
    enabled: boolean;
    expectedVersion: number;
  }) {
    const ref = storeRef(input.warehouseId);
    return db.runTransaction(async (transaction) => {
      const previous = readRollout((await transaction.get(ref)).data());
      if (previous.version !== input.expectedVersion) {
        throw new PosVietnamProductSettingsError(409, {
          vi: "Trạng thái thí điểm đã thay đổi. Hãy tải lại trước khi lưu.",
          zh: "试点状态已更改。请刷新后保存。",
        });
      }
      const next = { ...previous, enabled: input.enabled, version: previous.version + 1 };
      const now = new Date();
      transaction.set(ref, { ...next, updated_by: input.actorId, updated_at: now.toISOString() }, { merge: true });
      const auditId = randomUUID();
      transaction.create(db.collection("audit_logs").doc(auditId), {
        id: auditId,
        entity_type: "POS_VIETNAM_SALES_ROLLOUT",
        entity_id: input.warehouseId,
        warehouse_id: input.warehouseId,
        action: previous.version ? AuditAction.UPDATE : AuditAction.CREATE,
        user_id: input.actorId,
        action_time: now,
        sync_time: now,
        old_value: previous,
        new_value: next,
      });
      return next;
    });
  },

  async list(warehouseId: string): Promise<PosHkCatalogProduct[]> {
    const [catalog, configured] = await Promise.all([
      db.collection(JPOS_PRODUCTS_COLLECTION).get(),
      productsForStore(warehouseId).get(),
    ]);
    const settings = new Map(configured.docs.map((doc) =>
      [doc.id, doc.data() as StoredProductSettings],
    ));
    const upstream = new Map(catalog.docs.map((doc) => [doc.id, doc.data()]));
    return [...new Set([...upstream.keys(), ...settings.keys()])].flatMap((goodsId) => {
      const current = settings.get(goodsId);
      const value = upstream.get(goodsId);
      const localProduct = current?.local_product;
      if (!value && !localProduct) return [];
      const vietnamSettings = current ? { ...current } : null;
      if (vietnamSettings) delete vietnamSettings.local_product;
      return {
        goods_id: goodsId,
        goods_name: String(value?.goodsName ?? value?.name ?? localProduct?.goodsName ?? goodsId),
        category: number(value?.category ?? localProduct?.category) ?? 0,
        group_name: String(value?.typeName || value?.subCategory || localProduct?.typeName || localProduct?.subCategory || ""),
        hk_price: number(value?.price),
        hk_after_tax_price: number(value?.afterTaxPrice),
        hk_tax_rate: number(value?.taxRate),
        hk_tax_type: number(value?.taxRateType),
        hk_available: Boolean(value && isPosProductUpstreamVisible(value)),
        hk_updated_at: typeof value?.lastSyncAt === "string" ? value.lastSyncAt : null,
        vietnam_settings: vietnamSettings,
      };
    }).sort((a, b) => a.goods_name.localeCompare(b.goods_name, "vi"));
  },

  async save(input: {
    warehouseId: string;
    goodsId: string;
    actorId: string;
    value: PosVietnamProductSettingsInput;
    context: AuditMetadata;
  }): Promise<PosVietnamProductSettings> {
    const ref = productsForStore(input.warehouseId).doc(input.goodsId);
    const catalog = db.collection(JPOS_PRODUCTS_COLLECTION).doc(input.goodsId);
    return db.runTransaction(async (transaction) => {
      const [product, previous] = await transaction.getAll(catalog, ref);
      const oldValue = previous.data() as StoredProductSettings | undefined;
      if (!product.exists && !oldValue?.local_product) {
        throw new PosVietnamProductSettingsError(404, {
          vi: "Không tìm thấy SKU trong danh mục HK.",
          zh: "在 HK 商品目录中未找到该商品。",
        });
      }
      const version = oldValue?.version ?? 0;
      const { expected_version, ...value } = input.value;
      if (version !== expected_version) {
        throw new PosVietnamProductSettingsError(409, {
          vi: "Cấu hình đã thay đổi. Tải lại danh mục và thử lại.",
          zh: "配置已更改，请刷新目录后重试。",
        });
      }
      const now = new Date();
      const localProduct = !value.import_from_hk || !value.send_sale_to_hk
        ? (oldValue?.import_from_hk === false || !product.exists || product.get("is_deleted") === true ? oldValue?.local_product : undefined)
          ?? Object.fromEntries(Object.entries(product.data() ?? {}).filter(([key]) => localCatalogFields.has(key)))
        : undefined;
      const current = {
        ...value,
        goods_id: input.goodsId,
        warehouse_id: input.warehouseId,
        updated_by: input.actorId,
        updated_at: now.toISOString(),
        version: version + 1,
      };
      const auditId = randomUUID();
      transaction.set(ref, { ...current, ...(localProduct ? { local_product: localProduct } : {}) });
      transaction.create(db.collection("audit_logs").doc(auditId), {
        id: auditId,
        entity_type: "POS_VIETNAM_PRODUCT_SETTINGS",
        entity_id: input.goodsId,
        warehouse_id: input.warehouseId,
        action: oldValue ? AuditAction.UPDATE : AuditAction.CREATE,
        user_id: input.actorId,
        user_name: null,
        entity_name: String(product.get("goodsName") ?? localProduct?.goodsName ?? input.goodsId),
        action_time: now,
        sync_time: now,
        old_value: oldValue ?? null,
        new_value: current,
        ip_address: input.context.ip_address ?? null,
        device_id: input.context.device_id ?? null,
        session_token: input.context.session_token ?? null,
        notes: "Updated Vietnam POS product configuration",
      });
      return current;
    });
  },
};
