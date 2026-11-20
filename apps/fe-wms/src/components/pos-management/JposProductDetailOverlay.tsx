"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { BottomSheet } from "@/components/ui/BottomSheet";

// Desktop layout and focus handling follow PosOrderDetailOverlay.
export function JposProductDetailOverlay({ title, closeLabel, saving, onClose, children }: {
  title: string;
  closeLabel: string;
  saving: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches,
  );
  const close = () => { if (!saving) onClose(); };

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (isDesktop) dialogRef.current?.focus();
  }, [isDesktop]);

  if (!isDesktop) {
    return (
      <BottomSheet
        isOpen
        title={title}
        closeLabel={closeLabel}
        defaultSnap="full"
        bottomOffset="0px"
        zIndex={80}
        onClose={close}
        contentClassName="flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {children}
      </BottomSheet>
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:enabled, input:enabled, select:enabled, textarea:enabled, [tabindex="0"]',
    );
    const first = focusable?.[0];
    const last = focusable?.[focusable.length - 1];
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={close}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="jpos-product-detail-title"
        tabIndex={-1} onKeyDown={handleKeyDown} onMouseDown={(event) => event.stopPropagation()}
        className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl outline-none">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
          <h2 id="jpos-product-detail-title" className="min-w-0 break-words text-base font-semibold text-slate-900">{title}</h2>
          <button type="button" disabled={saving} onClick={close} aria-label={closeLabel}
            className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-amber-600 disabled:opacity-50">
            <X size={18} aria-hidden />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
