"use client";
import { useState } from "react";
import { FileSpreadsheet, Download, ScanLine } from "lucide-react";
import PayrollSectionHeading from "./PayrollSectionHeading";
import { PAYROLL_FIELDS, type PayrollComposer, type PayrollRecipient, type PayrollSourceMapping } from "@bduck/shared-types";
import type { PayrollText } from "@/lib/i18n/payrollEmailTranslations";
import { downloadPayrollTemplate } from "@/utils/payrollExcelTemplate";
import { readPayrollWorkbook, detectPayrollMapping, previewPayrollColumns, parsePayrollRows, mergePayrollData,
  type PayrollWorkbook, type PayrollImportKind } from "@/utils/payrollExcelImport";
export type PayrollParsedSources = { salary: ReturnType<typeof parsePayrollRows>; attendance: ReturnType<typeof parsePayrollRows> };
const kinds: PayrollImportKind[] = ["roster","salary","attendance"];
const slots: Record<PayrollImportKind, string[]> = {
  roster: ["name","email","job_title","bank_account","bank","gross","tax","net","notes"],
  salary: ["name","days","shifts7","shifts8","holiday","gross","tax","net","standard_days","overtime_hours","overtime_pay","insurance","advance","notes"],
  attendance: ["date","weekday","shift","day_type","check_in","check_out","standard_hours","hours","missing_minutes","extra_minutes","shift_status","in_status","out_status","source"],
};
export default function PayrollImportPanel({ text, lang, composer, setMappings, busy, run, onRead }: {
  text: PayrollText; lang: "vi" | "zh"; composer: PayrollComposer; setMappings: (maps: PayrollComposer["mappings"]) => void;
  busy: boolean; run: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
  onRead: (people: PayrollRecipient[], sources: PayrollParsedSources) => void;
}) {
  const [books, setBooks] = useState<PayrollWorkbook[]>([]); const [selected, setSelected] = useState<Record<string, number>>({});
  const mappingFor = (kind: string) => composer.mappings[kind];
  const select = (kind: PayrollImportKind, index: number) => {
    const book = books[index]; setSelected(s => ({ ...s, [kind]: index }));
    const preferred = book.workbook.worksheets.find(s => kind === "roster" ? /bảng kê/i.test(s.name) : kind === "salary" ? /bảng lương/i.test(s.name) : /bảng công/i.test(s.name)) || book.workbook.worksheets[0];
    const saved = mappingFor(kind);
    setMappings({ ...composer.mappings, [kind]: saved && book.workbook.getWorksheet(saved.sheet) ? saved : detectPayrollMapping(book, preferred.name) });
  };
  const upload = (kind: PayrollImportKind, file: File) => void run(async () => {
    const book = await readPayrollWorkbook(file); const index = books.length; setBooks(previous => [...previous, book]);
    setSelected(s => ({ ...s, [kind]: index }));
    const preferred = book.workbook.worksheets.find(s => kind === "roster" ? /bảng kê/i.test(s.name) : kind === "salary" ? /bảng lương/i.test(s.name) : /bảng công/i.test(s.name)) || book.workbook.worksheets[0];
    const saved = mappingFor(kind);
    setMappings({ ...composer.mappings, [kind]: saved && book.workbook.getWorksheet(saved.sheet) ? saved : detectPayrollMapping(book, preferred.name) });
  });
  const read = () => void run(async () => {
    const parse = (kind: PayrollImportKind) => {
      const book = books[selected[kind]]; const mapping = mappingFor(kind);
      if (!book || !mapping) throw new Error(text.chooseFile + ": " + text[kind]);
      return parsePayrollRows(book, mapping, kind);
    };
    const roster = parse("roster"), salary = parse("salary"), attendance = parse("attendance");
    const people = mergePayrollData(roster, salary, attendance);
    if (!people.length) throw new Error(text.firstRow + ": " + text.roster);
    onRead(people, { salary, attendance });
  });
  return <details className="rounded-xl border border-border-subtle bg-surface-elevated p-4 shadow-sm" open><summary className="cursor-pointer text-base font-semibold marker:text-text-muted"><span className="ml-1 inline-flex align-middle"><PayrollSectionHeading icon={FileSpreadsheet} title={text.import} /></span></summary>
    <div className="mt-3 grid gap-3 lg:grid-cols-3">{kinds.map(kind => {
      const book = books[selected[kind]]; const mapping = mappingFor(kind);
      const columns = book && mapping && book.workbook.getWorksheet(mapping.sheet) ? previewPayrollColumns(book, mapping) : [];
      const update = (next: PayrollSourceMapping) => setMappings({ ...composer.mappings, [kind]: next });
      return <fieldset key={kind} disabled={busy} className="space-y-3 rounded-xl border border-border-subtle bg-surface-elevated p-4 shadow-sm"><legend className="px-1 text-sm font-semibold text-text-primary">{text[kind]}</legend>
        <label className="block space-y-1 text-xs font-medium text-text-secondary">{text.file}<input className="block w-full cursor-pointer rounded-lg border border-dashed border-border-subtle bg-surface-elevated p-2 text-xs text-text-muted file:mr-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-brand-primary-muted file:px-2 file:py-1 file:text-xs file:font-medium file:text-brand-primary" type="file" accept=".xlsx"
          onChange={e => { const file = e.target.files?.[0]; if (file) upload(kind, file); e.target.value = ""; }} /></label>
        <select className="h-8 w-full rounded-lg border border-border-subtle bg-surface-input px-3 text-sm text-text-primary outline-none transition focus:border-border-focus focus:ring-2 focus:ring-brand-primary-muted disabled:bg-surface-base disabled:text-text-muted" aria-label={text.chooseFile} value={selected[kind] ?? ""} onChange={e => select(kind, Number(e.target.value))}>
          <option value="">{text.chooseFile}</option>{books.map((b,i) => <option key={i} value={i}>{b.file.name}</option>)}</select>
        {book && mapping && <>
          <label className="block space-y-1 text-xs font-medium text-text-secondary">{text.sheet}<select className="h-8 w-full rounded-lg border border-border-subtle bg-surface-input px-3 text-sm text-text-primary outline-none transition focus:border-border-focus focus:ring-2 focus:ring-brand-primary-muted disabled:bg-surface-base disabled:text-text-muted" value={mapping.sheet}
            onChange={e => update(detectPayrollMapping(book, e.target.value))}>{book.workbook.worksheets.map(s => <option key={s.id}>{s.name}</option>)}</select></label>
          <label className="block space-y-1 text-xs font-medium text-text-secondary">{text.firstRow}<input className="h-8 w-full rounded-lg border border-border-subtle bg-surface-input px-3 text-sm text-text-primary outline-none transition focus:border-border-focus focus:ring-2 focus:ring-brand-primary-muted disabled:bg-surface-base disabled:text-text-muted" type="number" min={1} value={mapping.start_row}
            onChange={e => update({ ...mapping, start_row: Math.max(1, Number(e.target.value) || 1) })} /></label>
          <p className="text-xs text-text-muted">{text.mapping}</p>
          <div className="flex flex-wrap gap-1">{columns.map(c => <span key={c.column} draggable
            onDragStart={e => e.dataTransfer.setData("text/plain", c.column)} className="cursor-grab rounded-lg bg-surface-base px-2 py-1 text-xs"
            title={c.sample}>{c.column}: {c.header || c.sample}</span>)}</div>
          <details><summary className="cursor-pointer text-xs">{text.fields}</summary><div className="space-y-1 pt-2">{slots[kind].map(field =>
            <label className="grid grid-cols-2 items-center gap-2 text-xs" key={field} onDragOver={e => e.preventDefault()} onDrop={e => {
              e.preventDefault(); const column = e.dataTransfer.getData("text/plain");
              if (columns.some(c => c.column === column)) update({ ...mapping, columns: { ...mapping.columns, [field]: column } });
            }}>{PAYROLL_FIELDS[field as keyof typeof PAYROLL_FIELDS][lang === "zh" ? 1 : 0]}
              <select className="h-8 rounded-lg border border-border-subtle bg-surface-input px-3 text-sm outline-none focus:border-border-focus focus:ring-2 focus:ring-brand-primary-muted" value={mapping.columns[field] || ""} onChange={e => {
                const next = { ...mapping.columns }; if (e.target.value) next[field] = e.target.value; else delete next[field]; update({ ...mapping, columns: next });
              }}><option value="">—</option>{columns.map(c => <option key={c.column} value={c.column}>{c.column}: {c.sample}</option>)}</select>
            </label>)}</div></details>
        </>}
      </fieldset>;
    })}</div>
    <div className="mt-3 flex gap-2"><button disabled={busy} className="inline-flex h-8 items-center justify-center gap-2 rounded-lg bg-brand-primary px-3 text-sm font-medium text-white transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50" onClick={read}><ScanLine size={14} aria-hidden="true" />{text.read}</button>
      <button disabled={busy} className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-base disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void run(downloadPayrollTemplate)}><Download size={14} aria-hidden="true" />{text.templateDownload}</button></div>
  </details>;
}
