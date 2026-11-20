import type { Request, Response } from "express";
import { z } from "zod";

import {
  PosVietnamProductSettingsError,
  posVietnamProductSettingsRepository,
} from "../../repositories/posVietnamProductSettingsRepository.js";
import { posWarehouseParamsSchema } from "../../services/posDeviceSchemas.js";
import {
  posCatalogGoodsIdSchema,
  posVietnamProductSettingsSchema,
} from "../../services/posVietnamProductSettingsSchema.js";
import { loadWarehouseById } from "../../services/warehouseService.js";
import { getAuditRequestMetadata } from "../../utils/auditRequestMetadata.js";
import { sendError, sendSuccess } from "../../utils/responseHelper.js";
import {
  requireAuthenticatedRequestUser,
  requireRequestAuthorization,
} from "../middlewares/requestAccessContext.js";

const productParams = posWarehouseParamsSchema.extend({ goodsId: posCatalogGoodsIdSchema });

function handleError(response: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    return sendError(response, {
      vi: "Giá, VAT hoặc ngày hiệu lực chưa hợp lệ.",
      zh: "售价、增值税或生效日期无效。",
    }, 400, error.flatten());
  }
  if (error instanceof PosVietnamProductSettingsError) {
    return sendError(response, error.messages, error.statusCode);
  }
  const domain = error as { statusCode?: number; messages?: { vi: string; zh: string } };
  if (domain.statusCode && domain.messages) {
    return sendError(response, domain.messages, domain.statusCode);
  }
  console.error("[posVietnamProductSettings]", error);
  return sendError(response, {
    vi: "Không thể xử lý cấu hình giá sản phẩm.",
    zh: "无法处理商品价格配置。",
  }, 500);
}

export async function listPosVietnamProductSettings(request: Request, response: Response) {
  try {
    const { warehouseId } = posWarehouseParamsSchema.parse(request.params);
    requireRequestAuthorization(request).assert("pos.settings.read", warehouseId);
    await loadWarehouseById(warehouseId);
    return sendSuccess(response, await posVietnamProductSettingsRepository.list(warehouseId));
  } catch (error) {
    return handleError(response, error);
  }
}

export async function savePosVietnamProductSettings(request: Request, response: Response) {
  try {
    const { warehouseId, goodsId } = productParams.parse(request.params);
    requireRequestAuthorization(request).assert("pos.settings.manage", warehouseId);
    const value = posVietnamProductSettingsSchema.parse(request.body);
    await loadWarehouseById(warehouseId);
    const actorId = requireAuthenticatedRequestUser(request).id;
    return sendSuccess(response, await posVietnamProductSettingsRepository.save({
      warehouseId, goodsId, actorId, value, context: getAuditRequestMetadata(request),
    }));
  } catch (error) {
    return handleError(response, error);
  }
}
