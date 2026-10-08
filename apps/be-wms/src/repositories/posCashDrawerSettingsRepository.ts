import { randomUUID } from "crypto";

import {
  AuditAction,
  POS_CASH_DRAWER_SETTINGS_COLLECTION,
  type PosCashDrawerSettings,
  type PosCashDrawerSettingsInput,
} from "@bduck/shared-types";

import { db } from "../config/firebase.js";
import type { AuditMetadata } from "../services/auditService.js";
import {
  assertCashDrawerVersion,
  PosCashDrawerConflictError,
} from "../services/posCashDrawerSchemas.js";

import { POS_DEVICES_COLLECTION } from "./posDeviceRepository.js";

export const posCashDrawerSettingsRepository = {
  async findByDevice(
    deviceId: string,
    warehouseId: string,
  ): Promise<PosCashDrawerSettings | null> {
    const snapshot = await db
      .collection(POS_CASH_DRAWER_SETTINGS_COLLECTION)
      .doc(deviceId)
      .get();
    if (!snapshot.exists) return null;
    const value = snapshot.data() as PosCashDrawerSettings;
    return !value.is_deleted &&
      value.device_id === deviceId &&
      value.warehouse_id === warehouseId
      ? value
      : null;
  },
  async save(input: {
    deviceId: string;
    warehouseId: string;
    actorId: string;
    value: PosCashDrawerSettingsInput;
    context?: AuditMetadata;
  }): Promise<PosCashDrawerSettings> {
    const reference = db
      .collection(POS_CASH_DRAWER_SETTINGS_COLLECTION)
      .doc(input.deviceId);
    return db.runTransaction(async (transaction) => {
      const [deviceSnapshot, snapshot] = await Promise.all([
        transaction.get(
          db.collection(POS_DEVICES_COLLECTION).doc(input.deviceId),
        ),
        transaction.get(reference),
      ]);
      const device = deviceSnapshot.data();
      if (
        !device ||
        device.is_deleted ||
        device.status !== "ACTIVE" ||
        device.warehouse_id !== input.warehouseId
      ) {
        throw new PosCashDrawerConflictError();
      }
      const previous = snapshot.exists
        ? (snapshot.data() as PosCashDrawerSettings)
        : null;
      // A transferred device must not inherit the previous store's configuration/version.
      const sameScope =
        previous?.warehouse_id === input.warehouseId && !previous.is_deleted;
      assertCashDrawerVersion(
        sameScope ? previous.version : 0,
        input.value.expected_version,
      );
      const now = new Date();
      const current: PosCashDrawerSettings = {
        id: input.deviceId,
        device_id: input.deviceId,
        warehouse_id: input.warehouseId,
        auto_open_enabled: input.value.auto_open_enabled,
        protocol: input.value.protocol,
        pin: input.value.pin,
        version: (previous?.version ?? 0) + 1,
        updated_by: input.actorId,
        is_deleted: false,
        created_at: previous?.created_at ?? now.toISOString(),
        updated_at: now.toISOString(),
      };
      const auditId = randomUUID();
      transaction.set(reference, current);
      transaction.create(db.collection("audit_logs").doc(auditId), {
        id: auditId,
        entity_type: "POS_CASH_DRAWER_SETTINGS",
        entity_id: input.deviceId,
        warehouse_id: input.warehouseId,
        action: previous ? AuditAction.UPDATE : AuditAction.CREATE,
        user_id: input.actorId,
        user_name: null,
        entity_name: null,
        action_time: new Date(input.value.action_time),
        sync_time: now,
        old_value: previous,
        new_value: current,
        ip_address: input.context?.ip_address ?? null,
        device_id: input.context?.device_id ?? null,
        session_token: input.context?.session_token ?? null,
        notes: "JPULSE per-device cash drawer settings",
      });
      return current;
    });
  },
};
