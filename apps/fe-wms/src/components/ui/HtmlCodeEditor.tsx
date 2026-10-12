"use client";
import { useEffect, useRef, useState } from "react";
import type { EditorView } from "codemirror";
import type { Compartment } from "@codemirror/state";

interface HtmlCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
}

export default function HtmlCodeEditor({ value, onChange, label, disabled = false }: HtmlCodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const readOnly = useRef<Compartment | null>(null);
  const current = useRef({ value, onChange, disabled });
  current.current = { value, onChange, disabled };
  const syncing = useRef(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setFailed(false);
    void Promise.all([import("codemirror"), import("@codemirror/lang-html"), import("@codemirror/state")]).then(([cm, language, state]) => {
      if (cancelled || !host.current) return;
      const compartment = new state.Compartment();
      readOnly.current = compartment;
      view.current = new cm.EditorView({ parent: host.current, doc: current.current.value,
        extensions: [cm.basicSetup, language.html(), cm.EditorView.lineWrapping,
          compartment.of([state.EditorState.readOnly.of(current.current.disabled), cm.EditorView.editable.of(!current.current.disabled)]),
          cm.EditorView.contentAttributes.of({ "aria-label": label, "aria-multiline": "true", role: "textbox" }),
          cm.EditorView.updateListener.of(update => {
            if (update.docChanged && !syncing.current) current.current.onChange(update.state.doc.toString());
          })] });
      setLoading(false);
    }).catch(() => { if (!cancelled) { setFailed(true); setLoading(false); } });
    return () => { cancelled = true; view.current?.destroy(); view.current = null; readOnly.current = null; };
  }, [label]);
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) {
      syncing.current = true;
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
      syncing.current = false;
    }
  }, [value, loading]);
  useEffect(() => {
    if (!view.current || !readOnly.current) return;
    const editor = view.current, compartment = readOnly.current;
    void Promise.all([import("@codemirror/state"), import("codemirror")]).then(([state, cm]) => {
      if (view.current !== editor) return;
      editor.dispatch({ effects: compartment.reconfigure([state.EditorState.readOnly.of(disabled), cm.EditorView.editable.of(!disabled)]) });
      editor.contentDOM.setAttribute("aria-disabled", String(disabled));
    });
  }, [disabled, loading]);
  return <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface-input focus-within:border-border-focus focus-within:ring-2 focus-within:ring-brand-primary-muted">
    {loading && <div className="skeleton-pulse h-48 bg-surface-base sm:h-64" aria-busy="true" />}
    <div ref={host} className={`${loading || failed ? "hidden" : "h-48 sm:h-64"} [&_.cm-editor]:h-full [&_.cm-editor]:bg-surface-input [&_.cm-focused]:outline-none! [&_.cm-scroller]:overflow-auto [&_.cm-scroller]:font-mono [&_.cm-scroller]:text-sm [&_.cm-gutters]:border-border-subtle! [&_.cm-gutters]:bg-surface-card! [&_.cm-gutters]:text-text-muted!`} />
    {failed && <textarea aria-label={label} className="h-48 w-full bg-surface-input p-3 font-mono text-sm outline-none sm:h-64" value={value} disabled={disabled} onChange={e => onChange(e.target.value)} />}
  </div>;
}
