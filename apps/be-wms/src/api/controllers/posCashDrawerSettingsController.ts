import type { Request, Response } from "express";
import { z } from "zod";

import { posCashDrawerSettingsSchema } from "../../services/posCashDrawerSchemas.js";
import {
  getPosCashDrawerSettings,
  savePosCashDrawerSettings,
} from "../../services/posCashDrawerSettingsService.js";
import { posDeviceParamsSchema } from "../../services/posDeviceSchemas.js";
import { getAuditRequestMetadata } from "../../utils/auditRequestMetadata.js";
import { sendError, sendSuccess } from "../../utils/responseHelper.js";
import {
  requireAuthenticatedRequestUser,
  requireRequestAuthorization,
} from "../middlewares/requestAccessContext.js";

function handleError(res: Response, error: unknown) {
  console.error("[posCashDrawerSettings]", error);
  if (error instanceof z.ZodError)
    return sendError(
      res,
      {
        vi: "Cấu hình két không hợp lệ. TSPL chỉ hỗ trợ chân 2.",
        zh: "钱箱配置无效；TSPL 仅支持引脚 2。",
      },
      400,
      error.flatten(),
    );
  const domain = error as {
    statusCode?: number;
    messages?: { vi: string; zh: string };
  };
  if (domain.statusCode && domain.messages)
    return sendError(res, domain.messages, domain.statusCode);
  return sendError(
    res,
    { vi: "Không thể xử lý cấu hình két tiền.", zh: "无法处理钱箱配置。" },
    500,
  );
}

export async function getPosCashDrawerSettingsHandler(
  req: Request,
  res: Response,
) {
  try {
    const { deviceId } = posDeviceParamsSchema.parse(req.params);
    return sendSuccess(
      res,
      await getPosCashDrawerSettings(
        deviceId,
        requireRequestAuthorization(req),
      ),
    );
  } catch (error) {
    return handleError(res, error);
  }
}

export async function savePosCashDrawerSettingsHandler(
  req: Request,
  res: Response,
) {
  try {
    const { deviceId } = posDeviceParamsSchema.parse(req.params);
    const value = posCashDrawerSettingsSchema.parse(req.body);
    return sendSuccess(
      res,
      await savePosCashDrawerSettings({
        deviceId,
        value,
        actorId: requireAuthenticatedRequestUser(req).id,
        authorization: requireRequestAuthorization(req),
        auditMetadata: getAuditRequestMetadata(req),
      }),
      {
        vi: "Đã lưu cấu hình két cho máy POS.",
        zh: "已保存该 POS 设备的钱箱配置。",
      },
    );
  } catch (error) {
    return handleError(res, error);
  }
}
