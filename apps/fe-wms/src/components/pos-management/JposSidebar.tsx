"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import { useRef } from "react";

import SidebarActions from "@/components/layouts/SidebarActions";
import SidebarMenuItem from "@/components/layouts/SidebarMenuItem";
import { useTranslation } from "@/lib/i18n";
import { useSidebarStore } from "@/stores/useSidebarStore";

import { jposSections } from "./jposSections";

function SidebarContents({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const { lang, t } = useTranslation();

  return (
    <>
      <div className="flex h-20 shrink-0 items-center justify-center">
        <Image src="/logo/jpos.png" alt="JPOS" width={60} height={60}
          className={collapsed ? "size-9" : "size-15"} priority />
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-2">
        {!collapsed && (
          <p className="mb-1.5 px-2.5 text-xxs uppercase text-white/50">
            {t.sidebar.navigation}
          </p>
        )}
        <nav aria-label="JPOS" className="grid gap-1">
          {jposSections.map(({ id, icon, vi, zh }) => {
            const label = lang === "zh" ? zh : vi;
            return (
              <SidebarMenuItem
                key={id}
                item={{ id, icon, href: `/jpos/${id}`, labelKey: label }}
                label={label}
                isCollapsed={collapsed}
                onNavigate={onNavigate}
              />
            );
          })}
        </nav>
      </div>
      <div className="border-t border-white/10 px-2.5 py-3">
        <SidebarActions isCollapsed={collapsed} showCollapse={!onNavigate} />
      </div>
    </>
  );
}

export function JposSidebar() {
  const collapsed = useSidebarStore((state) => state.isCollapsed);
  const { lang } = useTranslation();
  const drawer = useRef<HTMLDialogElement>(null);
  const openLabel = lang === "zh" ? "打开菜单" : "Mở menu";
  const closeLabel = lang === "zh" ? "关闭菜单" : "Đóng menu";

  return (
    <>
      <aside
        className={`fixed left-0 top-0 z-40 hidden h-dvh flex-col rounded-r-md border-r border-[var(--color-border-soft)] bg-[var(--color-surface-nav)] text-[var(--color-text-on-dark)] lg:flex ${
          collapsed ? "w-[var(--sidebar-width-collapsed)]" : "w-[var(--sidebar-width-expanded)]"
        }`}
      >
        <SidebarContents collapsed={collapsed} />
      </aside>
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white p-3 lg:hidden">
        <button type="button" aria-label={openLabel} aria-haspopup="dialog"
          onClick={() => drawer.current?.showModal()}
          className="inline-flex size-11 items-center justify-center rounded-md border border-slate-200">
          <Menu aria-hidden size={20} />
        </button>
        <Image src="/logo/jpos.png" alt="JPOS" width={36} height={36} />
      </div>
      <dialog ref={drawer} aria-label="JPOS"
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-64 max-w-[85vw] bg-[var(--color-surface-nav)] text-white backdrop:bg-slate-900/50 open:flex open:flex-col">
        <button type="button" aria-label={closeLabel} onClick={() => drawer.current?.close()}
          className="absolute right-2 top-2 inline-flex size-11 items-center justify-center rounded-md hover:bg-white/10">
          <X aria-hidden size={20} />
        </button>
        <SidebarContents onNavigate={() => drawer.current?.close()} />
      </dialog>
    </>
  );
}
