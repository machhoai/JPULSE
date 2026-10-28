import { db } from "../config/firebase.js";

import { createAttendanceShortcutStore } from "./attendanceShortcutStore.js";

export const createShortcutPairing = (userId: string) =>
  createAttendanceShortcutStore(db).createShortcutPairing(userId);
export const getShortcutPairingOwner = (code: string) =>
  createAttendanceShortcutStore(db).getShortcutPairingOwner(code);
export const exchangeShortcutPairing = (code: string, userId: string) =>
  createAttendanceShortcutStore(db).exchangeShortcutPairing(code, userId);
export const verifyShortcutToken = (token: string) =>
  createAttendanceShortcutStore(db).verifyShortcutToken(token);
export const shortcutConnectionStatus = (userId: string) =>
  createAttendanceShortcutStore(db).shortcutConnectionStatus(userId);
export const revokeShortcutConnection = (userId: string) =>
  createAttendanceShortcutStore(db).revokeShortcutConnection(userId);
