"use client";
import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import PayrollSectionHeading from "./PayrollSectionHeading";
import { payrollEligibleIds, resolvePayrollMatch } from "@/utils/payrollRecipients";
import type { PayrollRecipient } from "@bduck/shared-types";
import type { PayrollText } from "@/lib/i18n/payrollEmailTranslations";
import type { PayrollParsedSources } from "./PayrollImportPanel";
export function payrollPersonValid(person: PayrollRecipient, people: PayrollRecipient[]) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email) &&
    !people.some(p => p.id !== person.id && p.selected && p.email.trim().toLowerCase() === person.email.trim().toLowerCase()) &&
    !person.issues.some(i => i.severity === "ERROR" && i.code !== "MISSING_EMAIL" && i.code !== "DUPLICATE_EMAIL");
}
export default function PayrollRecipientTable({ people, change, sources, lang, text, disabled }: {
  people: PayrollRecipient[]; change: (people: PayrollRecipient[]) => void; sources: PayrollParsedSources | null;
  lang: "vi" | "zh"; text: PayrollText; disabled: boolean;
}) {
  const [matches, setMatches] = useState<Record<string, { salary: string; attendance: string }>>({});
  const [matchError, setMatchError] = useState("");
  const [page, setPage] = useState(0);
  const eligible = useMemo(() => payrollEligibleIds(people), [people]);
  const firstId = people[0]?.id;
  useEffect(() => { setPage(0); setMatches({}); setMatchError(""); }, [firstId]);
  const update = (id: string, patch: Partial<PayrollRecipient>) => change(people.map(p => p.id === id ? { ...p, ...patch } : p));
  const match = (person: PayrollRecipient) => {
    const choice = matches[person.id]; if (!choice?.salary || !choice?.attendance) return;
    const candidates = person.match_candidates || (sources ? { salary: sources.salary.rows, attendance: sources.attendance.blocks } : null);
    if (!candidates) return;
    const salary = candidates.salary[Number(choice.salary)]; const attendance = candidates.attendance[Number(choice.attendance)];
    const used = people.find(p => p.id !== person.id && p.selected && !p.issues.some(i => i.code === "MATCH_REQUIRED") && (JSON.stringify(p.resolved_sources?.salary) === JSON.stringify(salary.source) || JSON.stringify(p.resolved_sources?.attendance) === JSON.stringify(attendance.source)));
    if (used) { setMatchError((lang === "vi" ? "Bản ghi này đã được ghép cho: " : "此记录已匹配到：") + used.name); return; }
    setMatchError("");
    update(person.id, resolvePayrollMatch(person, salary, attendance));
  };
  return <section className="space-y-3 rounded-xl border border-border-subtle bg-surface-elevated p-4 shadow-sm">
    {matchError && <p role="alert" className="text-sm text-error-text">{matchError}</p>}
    <div className="flex flex-wrap items-center justify-between gap-2"><PayrollSectionHeading icon={Users} title={`${text.recipients} (${people.length})`} />
      <span className="rounded-full bg-brand-primary-muted px-2 py-1 text-xs font-medium text-brand-primary">{text.count}: {people.filter(p => p.selected && eligible.has(p.id)).length}</span></div>
    <div className="overflow-hidden rounded-lg border border-border-soft md:overflow-x-auto"><table className="block w-full text-sm md:table"><thead className="hidden md:table-header-group"><tr className="bg-surface-card text-left text-xxs font-semibold uppercase tracking-wider text-text-muted">
      <th className="p-2">{text.selected}</th><th className="p-2">{text.name}</th><th className="p-2">{text.email}</th><th className="p-2">{text.match}</th></tr></thead>
      <tbody className="block md:table-row-group">{people.slice(page * 25, page * 25 + 25).map(person => {
        const needsMatch = person.issues.some(i => i.code === "MATCH_REQUIRED");
        const candidates = person.match_candidates || (sources ? { salary: sources.salary.rows, attendance: sources.attendance.blocks } : null);
        return <tr key={person.id} className="mb-2 block rounded-lg border border-border-soft bg-surface-elevated align-top last:mb-0 md:mb-0 md:table-row md:rounded-none md:border-0 md:border-t md:border-border-soft">
          <td className="block p-2 md:table-cell"><input aria-label={person.name} className="size-4 shrink-0 cursor-pointer accent-brand-primary disabled:cursor-not-allowed" type="checkbox" checked={person.selected} disabled={disabled}
            onChange={e => update(person.id, { selected: e.target.checked })} /></td>
          <td className="block p-2 font-medium md:table-cell">{person.name}<p className="text-xs text-text-muted">{person.source.sheet} · {person.source.row}</p></td>
          <td className="block p-2 md:table-cell"><span className="text-xs md:hidden">{text.email}</span><input aria-label={text.email + ": " + person.name} className="h-8 w-full rounded-lg border border-border-subtle bg-surface-input px-3 text-sm outline-none transition focus:border-border-focus focus:ring-2 focus:ring-brand-primary-muted disabled:bg-surface-base" value={person.email} disabled={disabled}
            onChange={e => update(person.id, { email: e.target.value.trim(), issues: person.issues.filter(i => i.code !== "MISSING_EMAIL") })} />
            {!eligible.has(person.id) && <p className="text-xs text-error-text">{needsMatch ? text.matchMissing : text.invalidEmail}</p>}</td>
          <td className="block space-y-1 p-2 md:table-cell">
            {person.issues.map((issue,i) => <p key={i} className={issue.severity === "ERROR" ? "rounded-md bg-error-bg px-2 py-1 text-xs text-error-text" : "rounded-md bg-warning-bg px-2 py-1 text-xs text-warning-text"}>{issue.messages[lang]}</p>)}
            {needsMatch && candidates && <div className="space-y-1">
              <select aria-label={text.salary} className="h-8 w-full rounded-lg border border-border-subtle bg-surface-input px-3 text-sm outline-none transition focus:border-border-focus focus:ring-2 focus:ring-brand-primary-muted disabled:bg-surface-base" disabled={disabled} value={matches[person.id]?.salary || ""}
                onChange={e => setMatches(m => ({ ...m, [person.id]: { salary: e.target.value, attendance: m[person.id]?.attendance || "" } }))}>
                <option value="">{text.salary}</option>{candidates.salary.map((r,i) => <option key={i} value={String(i)}>{r.name} · {r.source.sheet} · {r.source.row}</option>)}</select>
              <select aria-label={text.attendance} className="h-8 w-full rounded-lg border border-border-subtle bg-surface-input px-3 text-sm outline-none transition focus:border-border-focus focus:ring-2 focus:ring-brand-primary-muted disabled:bg-surface-base" disabled={disabled} value={matches[person.id]?.attendance || ""}
                onChange={e => setMatches(m => ({ ...m, [person.id]: { attendance: e.target.value, salary: m[person.id]?.salary || "" } }))}>
                <option value="">{text.attendance}</option>{candidates.attendance.map((r,i) => <option key={i} value={String(i)}>{r.name} · {r.source.row}</option>)}</select>
              <button disabled={disabled || !matches[person.id]?.salary || !matches[person.id]?.attendance} className="inline-flex h-6 items-center rounded-md border border-border-subtle bg-surface-elevated px-2 text-xs text-text-secondary hover:bg-surface-base disabled:opacity-50"
                onClick={() => match(person)}>{text.confirmMatch}</button>
            </div>}
          </td>
        </tr>;
      })}</tbody></table></div>
    <div className="flex items-center justify-end gap-2 border-t border-border-soft pt-3"><button disabled={!page || disabled} aria-label={text.moveUp} className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-base disabled:cursor-not-allowed disabled:opacity-50" onClick={() => setPage(p => p - 1)}>‹</button>
      <span className="text-xs">{page + 1}/{Math.max(1, Math.ceil(people.length / 25))}</span>
      <button disabled={(page + 1) * 25 >= people.length || disabled} aria-label={text.more} className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-base disabled:cursor-not-allowed disabled:opacity-50" onClick={() => setPage(p => p + 1)}>›</button></div>
  </section>;
}
