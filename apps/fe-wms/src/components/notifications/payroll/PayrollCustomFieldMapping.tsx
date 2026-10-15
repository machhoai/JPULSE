"use client";
import { PAYROLL_SOURCE_BLOCK, isPayrollCustomLabelValid, payrollOrderedFields, type PayrollComposer, type PayrollImportSource, type PayrollSourceMapping } from "@bduck/shared-types";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { PayrollText } from "@/lib/i18n/payrollEmailTranslations";

const inputClass = "h-8 min-w-0 w-full rounded-lg border border-border-subtle bg-surface-input px-3 text-sm outline-none focus:border-border-focus focus:ring-2 focus:ring-brand-primary-muted";
type Column = { column: string; sample: string; header: string };
type PendingField = { id: string; label: string; column: string };
export default function PayrollCustomFieldMapping({ composer, source, mapping, columns, change, text }: {
  composer: PayrollComposer; source: PayrollImportSource; mapping: PayrollSourceMapping; columns: Column[];
  change: (composer: PayrollComposer) => void; text: PayrollText;
}) {
  const [pending, setPending] = useState<PendingField | null>(null); const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null); const committed = useRef("");
  useEffect(() => { input.current?.focus(); }, [pending?.id]);
  const block = PAYROLL_SOURCE_BLOCK[source];
  const custom = (composer.custom_fields ?? []).filter(field => field.source === source);
  const validName = (label: string, exclude?: string) => isPayrollCustomLabelValid(composer, source, label, exclude);
  const commit = (field = pending) => {
    if (!field || committed.current === field.id) return true;
    if (!validName(field.label)) { setError(text.customFieldNameError); return false; }
    committed.current = field.id;
    change({ ...composer, custom_fields: [...(composer.custom_fields ?? []), { id: field.id, label: field.label.trim(), source }],
      fields: { ...composer.fields, [block]: [...composer.fields[block], field.id] },
      field_order: { ...composer.field_order, [block]: [...payrollOrderedFields(composer, block), field.id] },
      mappings: { ...composer.mappings, [source]: { ...mapping, columns: { ...mapping.columns, ...(field.column ? { [field.id]: field.column } : {}) } } } });
    setPending(null); setError(""); return true;
  };
  const map = (id: string, column: string) => {
    const next = { ...mapping.columns }; if (column) next[id] = column; else delete next[id];
    change({ ...composer, mappings: { ...composer.mappings, [source]: { ...mapping, columns: next } } });
  };
  const options = <><option value="">—</option>{columns.map(column => <option key={column.column} value={column.column}>{column.column}: {column.sample}</option>)}</>;
  return <div className="space-y-1">
    {custom.map(field => <div key={field.id} className="grid grid-cols-2 items-center gap-2 text-xs" onDragOver={event => event.preventDefault()} onDrop={event => {
      event.preventDefault(); const column = event.dataTransfer.getData("text/plain"); if (columns.some(item => item.column === column)) map(field.id, column);
    }}>
      <input key={field.id + field.label} className={inputClass} aria-label={text.customFieldName + ": " + field.label} defaultValue={field.label} maxLength={160} onBlur={event => {
        if (event.target.value === field.label) return;
        if (!validName(event.target.value, field.id)) { setError(text.customFieldNameError); event.target.value = field.label; return; }
        setError(""); change({ ...composer, custom_fields: composer.custom_fields?.map(item => item.id === field.id ? { ...item, label: event.target.value.trim() } : item) });
      }} />
      <select className={inputClass} aria-label={text.mapping + ": " + field.label} value={mapping.columns[field.id] ?? ""} onChange={event => map(field.id, event.target.value)}>{options}</select>
    </div>)}
    {pending && <div className="grid grid-cols-2 items-center gap-2" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget) && pending.label.trim()) commit();
    }} onDragOver={event => event.preventDefault()} onDrop={event => {
      event.preventDefault(); const column = event.dataTransfer.getData("text/plain");
      if (columns.some(item => item.column === column)) { const next = { ...pending, column }; if (validName(next.label)) commit(next); else setPending(next); }
    }}>
      <input ref={input} className={inputClass} aria-label={text.customFieldName} placeholder={text.customFieldName} value={pending.label} maxLength={160}
        onChange={event => setPending({ ...pending, label: event.target.value })} onKeyDown={event => {
          if (event.key === "Enter") { event.preventDefault(); commit(); }
          if (event.key === "Escape") { event.preventDefault(); setPending(null); setError(""); }
        }} />
      <select className={inputClass} aria-label={text.mapping + ": " + text.customFieldName} value={pending.column} onChange={event => {
        const next = { ...pending, column: event.target.value }; if (validName(next.label)) commit(next); else setPending(next);
      }}>{options}</select>
    </div>}
    {error && <p role="alert" className="text-xs text-error-text">{error}</p>}
    <button type="button" aria-label={text.addField} title={text.addField}
      className="flex size-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-brand-primary-muted hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-brand-primary"
      onClick={() => {
        if (pending && !commit()) { input.current?.focus(); return; }
        setPending({ id: "custom_" + source + "_" + crypto.randomUUID().replaceAll("-", ""), label: "", column: "" }); setError("");
      }}><Plus size={16} aria-hidden="true" /></button>
  </div>;
}
