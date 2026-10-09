import type { PosCashDrawerSettingsInput } from "@bduck/shared-types";

import { posCashDrawerSettingsRepository } from "../repositories/posCashDrawerSettingsRepository.js";
import { posDeviceRepository } from "../repositories/posDeviceRepository.js";

import type { AuditMetadata } from "./auditService.js";
import type { AuthorizationService } from "./authorization/index.js";
import { assertCashDrawerDeviceAccess } from "./posCashDrawerAccessPolicy.js";

async function authorizedDevice(
  deviceId: string,
  authorization: AuthorizationService,
  permission: "pos.settings.read" | "pos.settings.manage",
) {
  const device = await posDeviceRepository.findById(deviceId);
  return assertCashDrawerDeviceAccess(device, authorization, permission);
}

export async function getPosCashDrawerSettings(
  deviceId: string,
  authorization: AuthorizationService,
) {
  const device = await authorizedDevice(
    deviceId,
    authorization,
    "pos.settings.read",
  );
  return posCashDrawerSettingsRepository.findByDevice(
    deviceId,
    device.warehouse_id,
  );
}

export async function savePosCashDrawerSettings(input: {
  deviceId: string;
  actorId: string;
  value: PosCashDrawerSettingsInput;
  authorization: AuthorizationService;
  auditMetadata?: AuditMetadata;
}) {
  const device = await authorizedDevice(
    input.deviceId,
    input.authorization,
    "pos.settings.manage",
  );
  return posCashDrawerSettingsRepository.save({
    deviceId: device.id,
    warehouseId: device.warehouse_id,
    actorId: input.actorId,
    value: input.value,
    context: input.auditMetadata,
  });
}
