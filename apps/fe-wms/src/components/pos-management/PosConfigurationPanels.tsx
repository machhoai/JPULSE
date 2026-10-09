"use client";
import type { usePosManagement } from "@/hooks/usePosManagement";

import { PosCashDrawerSettingsPanel } from "./PosCashDrawerSettingsPanel";
import { PosLuckyDrawSettingsPanel } from "./PosLuckyDrawSettingsPanel";
import { PosPaymentSettingsPanel } from "./PosPaymentSettingsPanel";
import { PosProductVisibilityPanel } from "./PosProductVisibilityPanel";
import { PosSettingsPanel } from "./PosSettingsPanel";
import { PosSettingsSubNav, type SettingsSubTab } from "./PosSettingsSubNav";
import { PosTicketSettingsPanel } from "./PosTicketSettingsPanel";
import { PosVoucherSettingsPanel } from "./PosVoucherSettingsPanel";

export function PosConfigurationPanels({
  warehouseId,
  storeName,
  management,
  canManage,
  activeSubTab,
  onSelect,
}: {
  warehouseId: string;
  storeName: string;
  management: ReturnType<typeof usePosManagement>;
  canManage: boolean;
  activeSubTab: SettingsSubTab;
  onSelect: (value: SettingsSubTab) => void;
}) {
  return (
    <div>
      <PosSettingsSubNav activeSubTab={activeSubTab} onSelect={onSelect} />
      {activeSubTab === "receipt" && (
        <PosSettingsPanel
          key={`${warehouseId}:${management.settings?.version ?? 0}`}
          warehouseId={warehouseId}
          storeName={storeName}
          settings={management.settings}
          canManage={canManage}
          onChanged={management.refresh}
        />
      )}
      {activeSubTab === "ticket" && (
        <PosTicketSettingsPanel
          key={`${warehouseId}:${management.ticketSettings?.version ?? 0}:ticket`}
          warehouseId={warehouseId}
          storeName={storeName}
          settings={management.ticketSettings}
          canManage={canManage}
          onChanged={management.refresh}
        />
      )}
      {activeSubTab === "lucky-draw" && (
        <PosLuckyDrawSettingsPanel
          key={`${warehouseId}:${management.luckyDrawView?.settings?.version ?? 0}:lucky-draw`}
          warehouseId={warehouseId}
          view={management.luckyDrawView}
          canManage={canManage}
          onChanged={management.refresh}
        />
      )}
      {activeSubTab === "payment" && (
        <PosPaymentSettingsPanel
          key={`${warehouseId}:payment`}
          devices={management.devices}
          canManage={canManage}
        />
      )}
      {activeSubTab === "cash-drawer" && (
        <PosCashDrawerSettingsPanel
          key={`${warehouseId}:cash-drawer`}
          warehouseId={warehouseId}
          devices={management.devices}
          canManage={canManage}
        />
      )}
      {activeSubTab === "products" && (
        <PosProductVisibilityPanel
          key={`${warehouseId}:products`}
          warehouseId={warehouseId}
          canManage={canManage}
        />
      )}
      {activeSubTab === "vouchers" && (
        <PosVoucherSettingsPanel
          key={`${warehouseId}:vouchers`}
          warehouseId={warehouseId}
          canManage={canManage}
        />
      )}
    </div>
  );
}
