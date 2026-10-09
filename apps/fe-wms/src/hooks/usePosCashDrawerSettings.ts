"use client";
import {
  POS_CASH_DRAWER_SETTINGS_COLLECTION,
  type PosCashDrawerSettings,
} from "@bduck/shared-types";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";

import { db } from "@/lib/firebase";

export function usePosCashDrawerSettings(warehouseId: string) {
  const [state, setState] = useState<{
    scope: string;
    settings: PosCashDrawerSettings[];
    loading: boolean;
    error: boolean;
  }>({
    scope: warehouseId,
    settings: [],
    loading: true,
    error: false,
  });
  useEffect(
    () =>
      onSnapshot(
        query(
          collection(db, POS_CASH_DRAWER_SETTINGS_COLLECTION),
          where("warehouse_id", "==", warehouseId),
        ),
        (snapshot) =>
          setState({
            scope: warehouseId,
            loading: false,
            error: false,
            settings: snapshot.docs
              .map((d) => ({ ...d.data(), id: d.id }) as PosCashDrawerSettings)
              .filter((s) => !s.is_deleted),
          }),
        (error) => {
          console.error("[cashDrawerSettings] listener failed", error);
          setState({
            scope: warehouseId,
            settings: [],
            loading: false,
            error: true,
          });
        },
      ),
    [warehouseId],
  );
  return state.scope === warehouseId
    ? state
    : { settings: [], loading: true, error: false };
}
