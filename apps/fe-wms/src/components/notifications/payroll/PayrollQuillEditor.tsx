"use client";
import { useEffect, useRef, useState } from "react";
import type Quill from "quill";
import type { PayrollBlock, PayrollDeltaOp } from "@bduck/shared-types";
import { PAYROLL_BLOCK_LABELS } from "@bduck/shared-types";
import type { PayrollText } from "@/lib/i18n/payrollEmailTranslations";
export default function PayrollQuillEditor({ ops, onChange, requestChange, text, lang, disabled }: {
  ops: PayrollDeltaOp[]; onChange: (ops: PayrollDeltaOp[]) => void;
  requestChange: (ops: PayrollDeltaOp[], accept: () => void) => void; text: PayrollText; lang: "vi" | "zh"; disabled: boolean;
}) {
  const element = useRef<HTMLDivElement>(null); const editor = useRef<Quill | null>(null);
  const values = useRef(ops); const handlers = useRef({ onChange, requestChange }); const [loading, setLoading] = useState(true);
  values.current = ops; handlers.current = { onChange, requestChange };
  useEffect(() => {
    let cancelled = false; let instance: Quill | null = null;
    void import("quill").then(({ default: Constructor }) => {
      if (cancelled || !element.current) return;
      const Embed = Constructor.import("blots/block/embed") as typeof import("quill/blots/block.js").BlockEmbed;
      class PayrollEmbed extends Embed {
        static blotName = "payroll"; static tagName = "div";
        static className = "payroll-fixed-table";
        static create(value: PayrollBlock) {
          const node = super.create(value) as HTMLElement; node.setAttribute("contenteditable", "false"); node.dataset.payroll = value;
          node.className = "payroll-fixed-table my-2 rounded-lg border border-brand-primary/20 bg-brand-primary-muted p-3 text-sm font-medium text-brand-primary";
          node.textContent = PAYROLL_BLOCK_LABELS[value]?.[lang === "zh" ? 1 : 0] ?? value; return node;
        }
        static value(node: HTMLElement) { return node.dataset.payroll; }
      }
      Constructor.register(PayrollEmbed, true);
      instance = new Constructor(element.current, { theme: "snow", formats: ["bold", "italic", "underline", "link", "payroll"], modules: {
        toolbar: [["bold", "italic", "underline"], ["link"], ["clean"]], history: { userOnly: true } } });
      instance.setContents(values.current as never, "silent"); editor.current = instance; setLoading(false);
      instance.on("text-change", (_delta, old, source) => {
        if (source !== "user" || !instance) return;
        const next = instance.getContents().ops as PayrollDeltaOp[];
        const previous = old.ops as PayrollDeltaOp[];
        let accepted = false;
        let handlingUserChange = true;
        const selection = instance.getSelection();
        handlers.current.requestChange(next, () => {
          accepted = true;
          // Synchronous acceptance leaves Quill's live DOM/caret untouched.
          // Only replay content when a deferred confirmation is accepted.
          if (!handlingUserChange) {
            instance?.setContents(next as never, "silent");
            if (selection) instance?.setSelection(selection.index, selection.length, "silent");
          }
          handlers.current.onChange(next);
        });
        handlingUserChange = false;
        // Parent decides whether a destructive change requires confirmation. Preserve previous
        // controlled value until that decision is accepted, including cut, undo and keyboard deletion.
        if (!accepted) {
          instance.setContents(previous as never, "silent");
          (instance.getModule("history") as { clear(): void }).clear();
        }
      });
    }).catch(() => { setLoading(false); console.error("PAYROLL_EDITOR_LOAD_FAILED"); });
    return () => {
      cancelled = true; editor.current = null;
      if (element.current) { const toolbar = element.current.previousElementSibling; if (toolbar?.classList.contains("ql-toolbar")) toolbar.remove(); element.current.innerHTML = ""; }
    };
  }, [lang]);
  useEffect(() => { if (editor.current) {
    const current = editor.current.getContents().ops; if (JSON.stringify(current) !== JSON.stringify(ops)) {
      const selection = editor.current.getSelection(); editor.current.setContents(ops as never, "silent");
      if (selection) editor.current.setSelection(Math.min(selection.index, editor.current.getLength() - 1), 0, "silent");
    }
  } }, [ops]);
  useEffect(() => { editor.current?.enable(!disabled); }, [disabled, loading]);
  const insert = (block: PayrollBlock) => {
    const quill = editor.current; if (!quill || disabled) return;
    const index = quill.getSelection()?.index ?? quill.getLength() - 1;
    quill.insertEmbed(index, "payroll", block, "user");
  };
  return <div className="space-y-3">
    <p className="rounded-lg bg-surface-card p-2 text-xs leading-relaxed text-text-muted">{text.variables}</p>
    <div className="flex flex-wrap gap-2">{(Object.keys(PAYROLL_BLOCK_LABELS) as PayrollBlock[]).map(block =>
      <button key={block} disabled={disabled || loading || ops.some(op => typeof op.insert !== "string" && op.insert.payroll === block)} className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-base disabled:cursor-not-allowed disabled:opacity-50" onClick={() => insert(block)}>
        {text.blocks}: {PAYROLL_BLOCK_LABELS[block][lang === "zh" ? 1 : 0]}</button>)}</div>
    {loading && <div className="skeleton-pulse h-40 rounded-lg bg-surface-base" />}
    <div className="overflow-hidden rounded-lg border border-border-subtle [&_.ql-toolbar]:border-0! [&_.ql-toolbar]:border-b! [&_.ql-toolbar]:border-border-subtle! [&_.ql-toolbar]:bg-surface-card [&_.ql-container]:border-0! [&_.ql-container]:font-body [&_.ql-editor]:text-sm">
    <div ref={element} className="min-h-64 rounded-b-lg bg-white text-sm [&_.ql-editor]:min-h-64" aria-label={text.content} />
    </div>
  </div>;
}
