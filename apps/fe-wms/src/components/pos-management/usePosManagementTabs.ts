"use client";
import {
  History,
  LayoutDashboard,
  Megaphone,
  MonitorSmartphone,
  Settings2,
  ShoppingBag,
  Users,
} from "lucide-react";

import { usePosAdvertisingCopy } from "./usePosAdvertisingCopy";
import { usePosManagementCopy } from "./usePosManagementCopy";
import { usePosOrderCopy } from "./usePosOrderCopy";

export type PosManagementTab =
  | "overview"
  | "devices"
  | "orders"
  | "settings"
  | "advertising"
  | "access"
  | "audit";

export function usePosManagementTabs(): Array<{
  id: PosManagementTab;
  label: string;
  icon: typeof LayoutDashboard;
}> {
  const copy = usePosManagementCopy();
  const advertisingCopy = usePosAdvertisingCopy();
  const orderCopy = usePosOrderCopy();
  return [
    { id: "overview", label: copy.overview, icon: LayoutDashboard },
    { id: "devices", label: copy.devices, icon: MonitorSmartphone },
    { id: "orders", label: orderCopy.tab, icon: ShoppingBag },
    { id: "settings", label: copy.settings, icon: Settings2 },
    { id: "advertising", label: advertisingCopy.tab, icon: Megaphone },
    { id: "access", label: copy.access, icon: Users },
    { id: "audit", label: copy.audit, icon: History },
  ];
}
