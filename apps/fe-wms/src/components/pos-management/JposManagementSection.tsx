"use client";

import { useState } from "react";

import { usePosManagement } from "@/hooks/usePosManagement";
import { useTranslation } from "@/lib/i18n";
import { useUserStore } from "@/stores/useUserStore";

import { useJposStore } from "./JposManagementLayout";
import { JposVietnamCatalog } from "./JposVietnamCatalog";
import { PosAdvertisingPanel } from "./PosAdvertisingPanel";
import { PosConfigurationPanels } from "./PosConfigurationPanels";
import { PosDevicePanel } from "./PosDevicePanel";
import { PosNoAccess, PosOverview } from "./PosManagementSections";
import { PosOrderPanel } from "./PosOrderPanel";
import type { SettingsSubTab } from "./PosSettingsSubNav";
import { jposSections, type JposSection } from "./jposSections";
import { usePosManagementCopy } from "./usePosManagementCopy";

type SectionProps = { section: JposSection };

export function JposManagementSection({ section }: SectionProps) {
  const { activeStoreId } = useJposStore();
  return <StoreSection key={activeStoreId} section={section} />;
}

function StoreSection({ section }: SectionProps) {
  const { lang } = useTranslation();
  const copy = usePosManagementCopy();
  const { activeStoreId, storeName, transferTargets } = useJposStore();
  const hasPermission = useUserStore((state) => state.hasPermission);
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>("receipt");
  const canReadDevices = hasPermission("pos.devices.read", activeStoreId);
  const canReadOrders = hasPermission("pos.orders.read", activeStoreId);
  const canReadSettings = hasPermission("pos.settings.read", activeStoreId);
  const canReadAdvertising = hasPermission("pos.advertising.read", activeStoreId);
  const canManageSettings = hasPermission("pos.settings.manage", activeStoreId);
  const management = usePosManagement(activeStoreId, {
    devices: canReadDevices && (section === "overview" || section === "devices"),
    settings: canReadSettings && (section === "overview" || section === "settings"),
  });
  const item = jposSections.find(({ id }) => id === section);

  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-2xs">
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h1 className="text-lg font-bold text-slate-900">{lang === "zh" ? item?.zh : item?.vi}</h1>
        {management.loading && <span role="status" className="text-xs text-slate-500">{copy.syncing}</span>}
      </header>
      <div className="p-3 sm:p-4">
        {management.error && <p role="alert" className="mb-3 rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-700">{management.error}</p>}
        {section === "overview" && (
          <PosOverview overview={management.overview} canReadDevices={canReadDevices}
            settingsVersion={management.settings?.version ?? null} />
        )}
        {section === "devices" && (canReadDevices ? (
          <PosDevicePanel warehouseId={activeStoreId} devices={management.devices}
            transferTargets={transferTargets} canManage={hasPermission("pos.devices.manage", activeStoreId)}
            onChanged={management.refresh} />
        ) : <PosNoAccess />)}
        {section === "orders" && (canReadOrders ? (
          <PosOrderPanel warehouseId={activeStoreId} canRead={canReadOrders}
            canCancelLocal={hasPermission("pos.orders.cancel_local", activeStoreId)} />
        ) : <PosNoAccess />)}
        {section === "settings" && (canReadSettings ? (
          <PosConfigurationPanels warehouseId={activeStoreId} storeName={storeName}
            management={management} canManage={canManageSettings} activeSubTab={settingsSubTab}
            onSelect={setSettingsSubTab} jposWeb />
        ) : <PosNoAccess />)}
        {section === "products" && (canReadSettings ? (
          <JposVietnamCatalog warehouseId={activeStoreId} canManage={canManageSettings} />
        ) : <PosNoAccess />)}
        {section === "advertising" && (canReadAdvertising ? (
          <PosAdvertisingPanel warehouseId={activeStoreId}
            canManage={hasPermission("pos.advertising.manage", activeStoreId)} />
        ) : <PosNoAccess />)}
      </div>
    </section>
  );
}
