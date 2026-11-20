"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { JposMFALockScreen } from "@/components/auth/JposMFALockScreen";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentUserRoleSync } from "@/hooks/useCurrentUserRoleSync";
import { useMFA } from "@/hooks/useMFA";
import { useStores } from "@/hooks/useWarehouses";
import { I18nProvider, useTranslation } from "@/lib/i18n";
import { useSidebarStore } from "@/stores/useSidebarStore";
import { useUserStore } from "@/stores/useUserStore";

import { JposSidebar } from "./JposSidebar";
import { PosManagementSkeleton, PosNoAccess } from "./PosManagementSections";
import { jposReadPermissions } from "./jposSections";
import { usePosManagementCopy } from "./usePosManagementCopy";

const StoreContext = createContext({
  activeStoreId: "",
  storeName: "",
  transferTargets: [] as { id: string; name: string }[],
});

export function useJposStore() {
  return useContext(StoreContext);
}

function JposWorkspace({ children }: { children: ReactNode }) {
  const { lang } = useTranslation();
  const copy = usePosManagementCopy();
  const { stores, loading, error } = useStores();
  const hasPermission = useUserStore((state) => state.hasPermission);
  const collapsed = useSidebarStore((state) => state.isCollapsed);
  const [selectedStoreId, setSelectedStoreId] = useState("");

  const availableStores = stores.filter(({ id }) =>
    jposReadPermissions.some((permission) => hasPermission(permission, id)),
  );
  const activeStore = availableStores.find(({ id }) => id === selectedStoreId)
    ?? availableStores[0];
  const transferTargets = stores
    .filter(({ id }) => id !== activeStore?.id && hasPermission("pos.devices.manage", id))
    .map(({ id, name }) => ({ id, name }));

  return (
    <div className="min-h-dvh bg-[var(--color-surface-base)]">
      <JposSidebar />
      <main className={`min-w-0 p-3 sm:p-4 ${
        collapsed ? "lg:ml-[var(--sidebar-width-collapsed)]" : "lg:ml-[var(--sidebar-width-expanded)]"
      }`}>
        {loading ? (
          <PosManagementSkeleton />
        ) : error ? (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
        ) : activeStore ? (
          <>
            <div className="mb-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2">
              <label htmlFor="jpos-store" className="shrink-0 text-sm font-medium text-slate-700">
                {lang === "zh" ? "选择门店" : "Cửa hàng"}
              </label>
              <select id="jpos-store" value={activeStore.id}
                onChange={(event) => setSelectedStoreId(event.target.value)}
                className="min-h-11 min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600">
                {availableStores.map(({ id, name }) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
            <StoreContext.Provider value={{ activeStoreId: activeStore.id, storeName: activeStore.name, transferTargets }}>
              {children}
            </StoreContext.Provider>
          </>
        ) : (
          <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{copy.noStores}</p>
        )}
      </main>
    </div>
  );
}

function JposManagementGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { lang, t } = useTranslation();
  const authStatus = useUserStore((state) => state.authStatus);
  const accessStatus = useUserStore((state) => state.accessStatus);
  const userId = useUserStore((state) => state.user?.id);
  const canEnter = useUserStore((state) =>
    jposReadPermissions.some((permission) => state.hasPermission(permission)),
  );
  const { isLocked } = useMFA();
  const { logout, isLoading } = useAuth();
  useCurrentUserRoleSync(authStatus === "AUTHENTICATED");

  useEffect(() => {
    if (authStatus === "SIGNED_OUT") router.replace("/jpos/login");
  }, [authStatus, router]);

  if (authStatus === "AUTHENTICATED" && isLocked) return <JposMFALockScreen />;
  if (authStatus === "ERROR" || accessStatus === "ERROR") {
    return <p role="alert" className="p-4">{lang === "zh" ? "无法验证登录会话或权限。" : "Không thể xác minh phiên đăng nhập hoặc quyền truy cập."}</p>;
  }
  if (authStatus === "AUTHENTICATED" && (accessStatus === "READY" || accessStatus === "REVOKED")) {
    return accessStatus === "READY" && canEnter
      ? <JposWorkspace key={userId}>{children}</JposWorkspace>
      : (
        <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 p-4">
          <PosNoAccess />
          <button type="button" disabled={isLoading} onClick={() => void logout()}
            className="min-h-11 self-start rounded-lg border border-slate-300 px-4 text-sm">
            {t.user.logout}
          </button>
        </main>
      );
  }
  return <div className="p-4"><PosManagementSkeleton /></div>;
}

export function JposManagementLayout({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <JposManagementGuard>{children}</JposManagementGuard>
    </I18nProvider>
  );
}
