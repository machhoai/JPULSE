"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { gooeyToast } from "goey-toast";
import { createPayrollComposer, type PayrollComposer, type PayrollEmailTemplate, type EmailSignature,
  type PayrollRecipient, type PayrollDraftContent, type PayrollDraftMetadata } from "@bduck/shared-types";
import { useTranslation } from "@/lib/i18n";
import { useUserStore } from "@/stores/useUserStore";
import { payrollEmailTranslations } from "@/lib/i18n/payrollEmailTranslations";
import { payrollApi, EMAIL_SIGNATURES_CHANGED_EVENT } from "@/api/payrollEmailApi";
import { savePayrollLocalDraft, loadPayrollLocalDraft, clearPayrollLocalDrafts } from "@/utils/payrollLocalDraft";
export interface PayrollCatalog { templates: PayrollEmailTemplate[]; signatures: EmailSignature[]; default_signature: { html: string; text: string } }
export function usePayrollComposer() {
  const { lang } = useTranslation(); const text = payrollEmailTranslations[lang];
  const user = useUserStore(s => s.user); const accessStatus = useUserStore(s => s.accessStatus);
  const hasPermission = useUserStore(s => s.hasPermission);
  const permissions = useUserStore(s => s.permissions);
  const [catalog, setCatalog] = useState<PayrollCatalog>({ templates: [], signatures: [], default_signature: { html: "", text: "" } });
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  const [error, setError] = useState(""); const [composer, setComposer] = useState<PayrollComposer>(createPayrollComposer);
  const [templateId, setTemplateId] = useState(""); const [templateName, setTemplateName] = useState("");
  const [facility, setFacility] = useState(""); const [people, setPeople] = useState<PayrollRecipient[]>([]);
  const [draft, setDraft] = useState({ id: "", revision: 0, name: "", clock: "" });
  const [drafts, setDrafts] = useState<PayrollDraftMetadata[]>([]); const [offline, setOffline] = useState(false);
  const savedRevision = useRef(0);
  const run = useCallback(async <T,>(operation: () => Promise<T>): Promise<T | undefined> => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      const pending = operation();
      await gooeyToast.promise(pending, { loading: text.processing, success: text.done, error: text.error,
        description: { success: text.actionDetail, error: text.retryDetail },
        action: { error: { label: text.retry, onClick: () => void run(operation) } } });
      return await pending;
    } catch (e) { const message = e instanceof Error ? e.message : text.error; setError(message);
      console.error("PAYROLL_OPERATION_FAILED"); return undefined;
    } finally { busyRef.current = false; setBusy(false); }
  }, [text]);
  const refreshCatalog = useCallback(async () => {
    const result = await payrollApi<PayrollCatalog>("/catalog", "GET", undefined, lang); setCatalog(result); return result;
  }, [lang]);
  useEffect(() => {
    let cancelled = false;
    void refreshCatalog().catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
    const stop = onSnapshot(doc(db, "payroll_catalog", "version"), () => {
      void refreshCatalog().catch(e => { if (!cancelled) setError(e.message); });
    }, () => console.error("PAYROLL_CATALOG_LISTENER_UNAVAILABLE"));
    const signatureChanged = () => { void refreshCatalog().catch(e => { if (!cancelled) setError(e.message); }); };
    window.addEventListener(EMAIL_SIGNATURES_CHANGED_EVENT, signatureChanged);
    return () => { cancelled = true; stop(); window.removeEventListener(EMAIL_SIGNATURES_CHANGED_EVENT, signatureChanged); };
  }, [refreshCatalog]);
  useEffect(() => {
    if (!facility || !hasPermission("notifications.payroll.compose", facility)) { setDrafts([]); return; }
    let active = true;
    void payrollApi<PayrollDraftMetadata[]>("/drafts?facility_id=" + facility, "GET", undefined, lang)
      .then(data => { if (active) setDrafts(data); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [facility, lang, hasPermission, draft.revision]);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine); update();
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  useEffect(() => {
    if (!user || ["SIGNED_OUT", "REVOKED", "ERROR"].includes(accessStatus)) {
      void clearPayrollLocalDrafts().catch(() => console.error("PAYROLL_CACHE_CLEAR_FAILED"));
      setPeople([]); setComposer(createPayrollComposer()); setDraft({ id: "", revision: 0, name: "", clock: "" });
    }
  }, [user?.id, accessStatus]);
  useEffect(() => {
    if (user && facility && !hasPermission("notifications.payroll.compose", facility)) {
      setPeople([]); setDraft({ id: "", revision: 0, name: "", clock: "" });
      setComposer(structuredClone(catalog.templates.find(t => t.id === templateId)?.composer || createPayrollComposer()));
      void clearPayrollLocalDrafts().catch(() => console.error("PAYROLL_REVOKED_CACHE_CLEAR_FAILED"));
    }
  }, [permissions, facility, user?.id, hasPermission]);
  useEffect(() => {
    if (!user || !templateId || !facility || !hasPermission("notifications.payroll.compose", facility)) return;
    const timer = setTimeout(() => {
      void savePayrollLocalDraft(user.id, { id: draft.id, revision: draft.revision, facility_id: facility,
        content: { template_id: templateId, composer, name: draft.name || templateName, clock: draft.clock || new Date().toISOString() }, people })
        .catch(() => setError(text.error + ": IndexedDB"));
    }, 600);
    return () => clearTimeout(timer);
  }, [user?.id, templateId, facility, composer, people, draft, templateName, hasPermission, text.error]);
  const applyTemplate = (id: string) => {
    const selected = catalog.templates.find(t => t.id === id); if (!selected) return;
    setTemplateId(id); setTemplateName(selected.name); setFacility(selected.facility_id);
    setComposer(structuredClone(selected.composer)); setPeople([]); setDraft({ id: "", revision: 0, name: selected.name, clock: new Date().toISOString() });
  };
  const newTemplate = () => {
    setTemplateId(crypto.randomUUID()); setTemplateName(""); setFacility("");
    setComposer(createPayrollComposer()); setPeople([]); setDraft({ id: "", revision: 0, name: "", clock: new Date().toISOString() });
  };
  const saveTemplate = () => run(async () => {
    if (!templateName || !facility) throw new Error(text.requiredName);
    const existing = catalog.templates.find(t => t.id === templateId);
    const saved = await payrollApi<PayrollEmailTemplate>("/templates/" + (templateId || crypto.randomUUID()), "PUT",
      { name: templateName, facility_id: facility, composer, revision: existing?.revision ?? 0 }, lang);
    setTemplateId(saved.id); await refreshCatalog();
  });
  const persist = async () => {
    if (!user || !templateId || !facility) throw new Error(text.chooseTemplate);
    if (!hasPermission("notifications.payroll.compose", facility)) throw new Error(text.noPermission);
    const current = { ...draft, id: draft.id || crypto.randomUUID(), clock: draft.clock || new Date().toISOString(), name: draft.name || templateName };
    const period = (clock: string) => new Intl.DateTimeFormat("en", { timeZone: "Asia/Ho_Chi_Minh", month: "2-digit", year: "numeric" }).format(new Date(clock));
    if (period(current.clock) !== period(new Date().toISOString())) {
      setDraft({ ...current, clock: new Date().toISOString() }); throw new Error(text.dataChanged);
    }
    const content: PayrollDraftContent = { template_id: templateId, composer, name: current.name, clock: current.clock, recipient_ids: people.map(p => p.id) };
    if (!navigator.onLine) {
      await savePayrollLocalDraft(user.id, { id: current.id, revision: current.revision, facility_id: facility, content, people });
      setDraft(current); return current.id;
    }
    const meta = await payrollApi<PayrollDraftMetadata>("/drafts/" + current.id, "PUT", { ...content, revision: current.revision }, lang);
    if (useUserStore.getState().user?.id !== user.id) throw new Error(text.noPermission);
    savedRevision.current = meta.revision;
    setDraft({ ...current, revision: meta.revision });
    for (const person of people) await payrollApi("/drafts/" + current.id + "/recipients/" + person.id, "PUT", { ...person, draft_revision: meta.revision }, lang);
    return current.id;
  };
  const openDraft = (id: string) => run(async () => {
    const { meta, content } = await payrollApi<{ meta: PayrollDraftMetadata; content: PayrollDraftContent }>("/drafts/" + id, "GET", undefined, lang);
    let cursor: string | null = null; const recipients: PayrollRecipient[] = [];
    do {
      const page: { people: PayrollRecipient[]; cursor: string | null } = await payrollApi("/drafts/" + id + "/recipients" + (cursor ? "?after=" + cursor : ""), "GET", undefined, lang);
      recipients.push(...page.people); cursor = page.cursor;
    } while (cursor);
    if (useUserStore.getState().user?.id !== user?.id) return;
    if (!useUserStore.getState().hasPermission("notifications.payroll.compose", meta.facility_id)) throw new Error(text.noPermission);
    const manifest = new Set(content.recipient_ids || recipients.map(p => p.id));
    const loaded = recipients.filter(p => manifest.has(p.id));
    if (loaded.length !== manifest.size) throw new Error(text.incompleteDraft + " (" + loaded.length + "/" + manifest.size + ")");
    const order = new Map((content.recipient_ids || loaded.map(p => p.id)).map((id, index) => [id, index]));
    setTemplateId(content.template_id); setFacility(meta.facility_id); setTemplateName(catalog.templates.find(t => t.id === content.template_id)?.name || meta.name);
    setComposer(content.composer); setPeople(loaded.sort((a,b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)));
    setDraft({ id, revision: meta.revision, name: content.name, clock: new Date().toISOString() });
  });
  const restoreLocal = () => run(async () => {
    if (!user) return; const saved = await loadPayrollLocalDraft(user.id); if (!saved) return;
    if (useUserStore.getState().user?.id !== user.id) return;
    if (!hasPermission("notifications.payroll.compose", saved.facility_id)) throw new Error(text.noPermission);
    setFacility(saved.facility_id); setTemplateId(saved.content.template_id); setTemplateName(saved.content.name);
    setComposer(saved.content.composer); setPeople(saved.people);
    setDraft({ id: saved.id, revision: saved.revision, name: saved.content.name, clock: new Date().toISOString() });
  });
  return { lang, text, catalog, loading, busy, error, setError, composer, setComposer, templateId, templateName, setTemplateName,
    facility, setFacility, people, setPeople, draft, drafts, offline, run, refreshCatalog, applyTemplate, newTemplate,
    saveTemplate, persist, openDraft, restoreLocal, hasPermission, savedRevision, userId: user?.id, permissions };
}
export type PayrollComposerState = ReturnType<typeof usePayrollComposer>;
