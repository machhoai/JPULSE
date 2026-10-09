"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { gooeyToast } from "goey-toast";
import type { EmailSignature } from "@bduck/shared-types";
import { payrollApi, EMAIL_SIGNATURES_CHANGED_EVENT } from "@/api/payrollEmailApi";
import { db } from "@/lib/firebase";
import { useTranslation } from "@/lib/i18n";
import { payrollEmailTranslations } from "@/lib/i18n/payrollEmailTranslations";
import { useUserStore } from "@/stores/useUserStore";

interface SignatureCatalog { signatures: EmailSignature[] }

export function useEmailSignatures() {
  const { lang } = useTranslation();
  const text = payrollEmailTranslations[lang];
  const [signatures, setSignatures] = useState<EmailSignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const activeRef = useRef(true);
  const refresh = useCallback(async () => {
    const catalog = await payrollApi<SignatureCatalog>("/catalog", "GET", undefined, lang);
    if (activeRef.current) setSignatures(catalog.signatures);
  }, [lang]);
  useEffect(() => {
    activeRef.current = true;
    const load = () => { void refresh().catch(e => {
      if (activeRef.current) setError(e instanceof Error ? e.message : text.error);
    }).finally(() => { if (activeRef.current) setLoading(false); }); };
    load();
    const stop = onSnapshot(doc(db, "payroll_catalog", "version"), load,
      () => console.error("EMAIL_SIGNATURE_CATALOG_LISTENER_UNAVAILABLE"));
    return () => { activeRef.current = false; stop(); };
  }, [refresh, text.error]);
  const mutate = async (operation: () => Promise<unknown>) => {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError("");
    try {
      if (!useUserStore.getState().hasPermission("notifications.email_signatures.manage")) throw new Error(text.noPermission);
      const pending = operation();
      await gooeyToast.promise(pending, { loading: text.processing, success: text.done, error: text.error,
        description: { success: text.actionDetail, error: text.retryDetail },
        action: { error: { label: text.retry, onClick: () => void mutate(operation) } } });
      await pending;
      window.dispatchEvent(new Event(EMAIL_SIGNATURES_CHANGED_EVENT));
      await refresh();
      return true;
    } catch (e) {
      if (activeRef.current) setError(e instanceof Error ? e.message : text.error);
      console.error("EMAIL_SIGNATURE_OPERATION_FAILED");
      return false;
    } finally {
      busyRef.current = false;
      if (activeRef.current) setBusy(false);
    }
  };
  const save = (id: string, name: string, html: string) => mutate(() => payrollApi("/signatures/" + (id || crypto.randomUUID()), "PUT",
    { name, html, revision: signatures.find(s => s.id === id)?.revision || 0 }, lang));
  const remove = (id: string) => mutate(() => payrollApi("/signatures/" + id, "DELETE", undefined, lang));
  return { text, signatures, loading, busy, error, save, remove };
}
