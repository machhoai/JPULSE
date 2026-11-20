import { randomUUID } from "node:crypto";

import {
  AuditAction,
  type PosHkCatalogProduct,
  type PosVietnamProductSettings,
  type PosVietnamProductSettingsInput,
} from "@bduck/shared-types";

import { db } from "../config/firebase.js";
import type { AuditMetadata } from "../services/auditService.js";
import { isPosProductUpstreamVisible } from "../services/posProductVisibilityPolicy.js";
import { JPOS_PRODUCTS_COLLECTION } from "./posProductVisibilityRepository.js";

const productsForStore = (warehouseId: string) =>
  db.collection("pos_vietnam_product_settings").doc(warehouseId).collection("products");

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
  async list(warehouseId: string): Promise<PosHkCatalogProduct[]> {
    const [catalog, configured] = await Promise.all([
      db.collection(JPOS_PRODUCTS_COLLECTION).get(),
      productsForStore(warehouseId).get(),
    ]);
    const settings = new Map(configured.docs.map((doc) =>
      [doc.id, doc.data() as PosVietnamProductSettings],
    ));
    return catalog.docs.map((doc) => {
      const value = doc.data();
      return {
        goods_id: doc.id,
        goods_name: String(value.goodsName ?? value.name ?? doc.id),
        category: number(value.category) ?? 0,
        group_name: String(value.typeName || value.subCategory || ""),
        hk_price: number(value.price),
        hk_after_tax_price: number(value.afterTaxPrice),
        hk_tax_rate: number(value.taxRate),
        hk_tax_type: number(value.taxRateType),
        hk_available: isPosProductUpstreamVisible(value),
        hk_updated_at: typeof value.lastSyncAt === "string" ? value.lastSyncAt : null,
        vietnam_settings: settings.get(doc.id) ?? null,
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
      if (!product.exists) {
        throw new PosVietnamProductSettingsError(404, {
          vi: "Không tìm thấy SKU trong danh mục HK.",
          zh: "在 HK 商品目录中未找到该商品。",
        });
      }
      const oldValue = previous.data() as PosVietnamProductSettings | undefined;
      const version = oldValue?.version ?? 0;
      const { expected_version, ...value } = input.value;
      if (version !== expected_version) {
        throw new PosVietnamProductSettingsError(409, {
          vi: "Cấu hình đã thay đổi. Tải lại danh mục và thử lại.",
          zh: "配置已更改，请刷新目录后重试。",
        });
      }
      const now = new Date();
      const current = {
        ...value,
        goods_id: input.goodsId,
        warehouse_id: input.warehouseId,
        updated_by: input.actorId,
        updated_at: now.toISOString(),
        version: version + 1,
      };
      const auditId = randomUUID();
      transaction.set(ref, current);
      transaction.create(db.collection("audit_logs").doc(auditId), {
        id: auditId,
        entity_type: "POS_VIETNAM_PRODUCT_SETTINGS",
        entity_id: input.goodsId,
        warehouse_id: input.warehouseId,
        action: oldValue ? AuditAction.UPDATE : AuditAction.CREATE,
        user_id: input.actorId,
        user_name: null,
        entity_name: String(product.get("goodsName") ?? input.goodsId),
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
