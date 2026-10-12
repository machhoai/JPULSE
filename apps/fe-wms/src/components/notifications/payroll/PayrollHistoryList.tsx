"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, History, Inbox } from "lucide-react";
import type { PayrollHistoryEntry } from "@bduck/shared-types";
import type { PayrollComposerState } from "@/hooks/usePayrollComposer";
import type { usePayrollDelivery } from "@/hooks/usePayrollDelivery";
import { downloadPayrollZip } from "@/api/payrollEmailApi";
import { payrollHistoryDay } from "@/utils/payrollHistory";
import PayrollSectionHeading from "./PayrollSectionHeading";
import PayrollHistoryStatusBadge from "./PayrollHistoryStatusBadge";
import PayrollHistoryDetail from "./PayrollHistoryDetail";

interface HistoryListProps { state: PayrollComposerState; delivery: ReturnType<typeof usePayrollDelivery> }
const field = "h-8 w-full rounded-lg border border-border-subtle bg-surface-input px-3 text-sm outline-none focus:border-border-focus disabled:opacity-50";
export default function PayrollHistoryList({ state, delivery: h }: HistoryListProps) {
  const { text, lang } = state;
  const [selected, setSelected] = useState<PayrollHistoryEntry | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const current = selected && selected.facility_id === h.historyFacility ? h.history.find(r => r.id === selected.id) || selected : null;
  useEffect(() => { setSelected(null); }, [h.historyFacility, state.userId]);
  const groups = useMemo(() => {
    const result = new Map<string, PayrollHistoryEntry[]>();
    for (const record of h.history) {
      const day = payrollHistoryDay(record.created_at), key = h.historyGroupBy === "month" ? day.slice(0,7) : day;
      result.set(key, [...(result.get(key) || []), record]);
    }
    return [...result];
  }, [h.history, h.historyGroupBy]);
  const close = () => { setSelected(null); requestAnimationFrame(() => trigger.current?.focus()); };
  if (!state.hasPermission("notifications.payroll.history.read")) return null;
  return <section className="space-y-3 rounded-xl border border-border-subtle bg-surface-elevated p-4 shadow-sm">
    <PayrollSectionHeading icon={History} title={text.history} description={text.historyHint} />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="space-y-1 text-xs font-medium text-text-secondary">{text.facility}<select aria-label={text.historyFacility} className={field} value={h.historyFacility} onChange={e => h.chooseHistoryFacility(e.target.value)}>
        {!h.historyStores.length && <option value="">{text.choose}</option>}{h.historyStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="space-y-1 text-xs font-medium text-text-secondary">{text.historyMonth}<input className={field} type="month" value={h.historyMonth} onChange={e => h.changeHistoryMonth(e.target.value)} /></label>
      <label className="space-y-1 text-xs font-medium text-text-secondary">{text.status}<select aria-label={text.historyStatusFilter} className={field} value={h.historyFilters.status || "ALL"} onChange={e => h.changeHistoryStatus(e.target.value as "ALL" | "PENDING" | "SUCCESS" | "ERROR")}>
        <option value="ALL">{text.historyAll}</option><option value="SUCCESS">{text.historySuccess}</option><option value="ERROR">{text.historyFailure}</option><option value="PENDING">{text.historyPending}</option></select></label>
      <label className="space-y-1 text-xs font-medium text-text-secondary">{text.historyFrom}<input className={field} type="date" value={h.historyFilters.from || ""} onChange={e => h.changeHistoryDates({ from: e.target.value })} /></label>
      <label className="space-y-1 text-xs font-medium text-text-secondary">{text.historyTo}<input className={field} type="date" min={h.historyFilters.from} value={h.historyFilters.to || ""} onChange={e => h.changeHistoryDates({ to: e.target.value })} /></label>
      <label className="space-y-1 text-xs font-medium text-text-secondary">{text.historyGroup}<select className={field} value={h.historyGroupBy} onChange={e => h.changeHistoryGroupBy(e.target.value as "day" | "month")}><option value="day">{text.historyByDay}</option><option value="month">{text.historyByMonth}</option></select></label>
    </div>
    {h.historyError && <p role="alert" className="rounded-lg bg-error-bg p-3 text-sm text-error-text">{h.historyError}</p>}
    {h.historyLoading && <div className="skeleton-pulse h-20 rounded-lg bg-surface-base" />}
    {!h.historyLoading && !h.history.length && !h.historyError && <div className="flex items-center gap-3 rounded-lg bg-surface-card p-3 text-sm text-text-muted"><Inbox size={18} />{h.cursor ? text.historyContinue : text.historyEmpty}</div>}
    {groups.map(([key, records]) => <section key={key} className="overflow-hidden rounded-lg border border-border-subtle">
      <header className="flex items-center gap-2 bg-surface-card p-2 text-xs font-semibold text-text-secondary"><CalendarDays size={14} aria-hidden="true" /><span>{key.split("-").reverse().join("/")}</span><span className="ml-auto font-normal text-text-muted">{records.length} {text.email}</span></header>
      <ul className="divide-y divide-border-soft">{records.map(record => <li key={record.id}>
        <button type="button" className="grid w-full gap-2 p-3 text-left transition hover:bg-surface-card md:grid-cols-12" onClick={e => { trigger.current = e.currentTarget; setSelected(record); }}>
          <span className="min-w-0 md:col-span-3"><span className="block text-sm font-medium">{record.snapshot.name}</span><span className="block break-all text-xs text-text-muted">{record.snapshot.email}</span></span>
          <span className="break-words text-sm text-text-secondary md:col-span-5">{record.snapshot.subject}</span>
          <span className="text-xs text-text-muted md:col-span-2">{new Date(record.created_at).toLocaleTimeString(lang === "vi" ? "vi-VN" : "zh-CN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" })}<span className="block">{text.historyAttempt}: {record.attempt || 1}</span></span>
          <span className="md:col-span-2"><PayrollHistoryStatusBadge record={record} text={text} /></span>
        </button>
      </li>)}</ul>
    </section>)}
    {h.cursor && <button disabled={h.historyLoading} className="h-8 rounded-lg border border-border-subtle px-3 text-sm disabled:opacity-50" onClick={() => void h.loadHistory(h.cursor!)}>{text.more}</button>}
    {current && <PayrollHistoryDetail record={current} state={state} text={text} lang={lang} busy={state.busy} close={close}
      download={state.hasPermission("notifications.payroll.download", h.historyFacility) ? () => void state.run(() => downloadPayrollZip(current.id, [], lang, true)) : undefined} />}
  </section>;
}
