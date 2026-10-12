"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import type { PayrollHistoryEntry, PayrollHistoryFilters } from "@bduck/shared-types";
import { payrollApi } from "@/api/payrollEmailApi";
import { db } from "@/lib/firebase";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useUserStore } from "@/stores/useUserStore";
import type { PayrollComposerState } from "./usePayrollComposer";
import { payrollHistoryDay, payrollMonthRange } from "@/utils/payrollHistory";

export function usePayrollHistory(state: PayrollComposerState) {
  const { warehouses } = useWarehouses();
  const permissions = useUserStore(s => s.permissions);
  const stores = useMemo(() => warehouses.filter(w => w.type === "STORE" && state.hasPermission("notifications.payroll.history.read", w.id)), [warehouses, permissions, state.hasPermission]);
  const [chosen, setChosen] = useState("");
  const facility = stores.find(w => w.id === chosen)?.id || stores.find(w => w.id === state.facility)?.id || stores[0]?.id || "";
  const [month, setMonth] = useState(() => payrollHistoryDay(new Date().toISOString()).slice(0,7));
  const [filters, setFilters] = useState<PayrollHistoryFilters>(() => ({ ...payrollMonthRange(month), status: "ALL" }));
  const [groupBy, setGroupBy] = useState<"day" | "month">("day");
  const [history, setHistory] = useState<PayrollHistoryEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const identity = `${state.userId}:${facility}:${JSON.stringify(filters)}:${JSON.stringify(permissions)}`;
  const current = useRef(identity); current.current = identity;
  const sequence = useRef(0);
  const loadedIdentity = useRef("");
  useEffect(() => {
    if (!state.userId) { setChosen(""); return; }
    try { setChosen(localStorage.getItem("payroll-history-store:" + state.userId) || ""); } catch { /* Device storage is optional. */ }
  }, [state.userId]);
  useEffect(() => {
    if (facility && state.userId) try { localStorage.setItem("payroll-history-store:" + state.userId, facility); } catch { /* Keep working without local storage. */ }
  }, [facility, state.userId]);
  const load = useCallback(async (after?: string) => {
    if (!facility || !state.userId || !state.hasPermission("notifications.payroll.history.read", facility)) return;
    const key = identity, request = ++sequence.current; setLoading(true); setError("");
    const query = new URLSearchParams({ facility_id: facility, status: filters.status || "ALL" });
    if (filters.from) query.set("from", filters.from); if (filters.to) query.set("to", filters.to); if (after) query.set("after", after);
    try {
      const page = await payrollApi<{ records: PayrollHistoryEntry[]; cursor: string | null }>("/history?" + query, "GET", undefined, state.lang);
      if (current.current !== key || sequence.current !== request) return;
      loadedIdentity.current = key;
      setHistory(old => after ? [...old, ...page.records.filter(r => !old.some(p => p.id === r.id))] : page.records); setCursor(page.cursor);
    } catch (e) { if (current.current === key && sequence.current === request) { loadedIdentity.current = key; setHistory([]); setCursor(null); setError(e instanceof Error ? e.message : state.text.error); } }
    finally { if (current.current === key && sequence.current === request) setLoading(false); }
  }, [identity, facility, filters, state.lang, state.userId, state.hasPermission, state.text.error]);
  useEffect(() => {
    setHistory([]); setCursor(null); setError(""); setLoading(false); ++sequence.current;
    if (!facility || !state.userId) return;
    let timer: ReturnType<typeof setTimeout>;
    void load();
    const stop = onSnapshot(doc(db, "payroll_history_signals", facility), () => {
      clearTimeout(timer); timer = setTimeout(() => void load(), 300);
    }, () => setError(state.text.historyLiveError));
    return () => { ++sequence.current; clearTimeout(timer); stop(); };
  }, [load, facility, state.userId, state.text.historyLiveError]);
  const changeMonth = (value: string) => { setMonth(value); setFilters(old => ({ ...old, ...payrollMonthRange(value) })); };
  const changeDates = (patch: PayrollHistoryFilters) => { setMonth(""); setFilters(old => ({ ...old, ...patch })); };
  return { history: loadedIdentity.current === identity ? history : [], historyError: error, historyLoading: loading, cursor: loadedIdentity.current === identity ? cursor : null, loadHistory: load, historyFacility: facility,
    historyStores: stores, chooseHistoryFacility: setChosen, historyMonth: month, changeHistoryMonth: changeMonth,
    historyFilters: filters, changeHistoryDates: changeDates, changeHistoryStatus: (status: PayrollHistoryFilters["status"]) => setFilters(old => ({ ...old, status })),
    historyGroupBy: groupBy, changeHistoryGroupBy: setGroupBy };
}
