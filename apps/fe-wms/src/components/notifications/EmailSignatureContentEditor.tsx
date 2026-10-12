"use client";
import { useMemo } from "react";
import { Code2, Eye } from "lucide-react";
import HtmlCodeEditor from "@/components/ui/HtmlCodeEditor";
import { buildEmailSignaturePreview } from "@/utils/emailSignaturePreview";
import type { PayrollText } from "@/lib/i18n/payrollEmailTranslations";

interface SignatureContentEditorProps {
  html: string;
  change: (html: string) => void;
  disabled: boolean;
  text: PayrollText;
  lang: "vi" | "zh";
}

export default function EmailSignatureContentEditor({ html, change, disabled, text, lang }: SignatureContentEditorProps) {
  const preview = useMemo(() => buildEmailSignaturePreview(html, lang), [html, lang]);
  return <div className="grid min-w-0 gap-3 lg:grid-cols-2">
    <div className="min-w-0 space-y-1">
      <p className="flex items-center gap-2 text-xs font-medium text-text-secondary"><Code2 size={14} aria-hidden="true" />{text.html}</p>
      <HtmlCodeEditor value={html} onChange={change} label={text.html} disabled={disabled} />
      <p className="text-xs text-text-muted">{text.signatureCodeHint}</p>
    </div>
    <div className="min-w-0 space-y-1">
      <p className="flex items-center gap-2 text-xs font-medium text-text-secondary"><Eye size={14} aria-hidden="true" />{text.signaturePreview}</p>
      {html.trim() ? <iframe title={text.signaturePreview} sandbox="" referrerPolicy="no-referrer" className="h-48 w-full rounded-lg border border-border-subtle bg-white sm:h-64" srcDoc={preview} /> : <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border-subtle bg-surface-card p-3 text-center text-sm text-text-muted sm:h-64">{text.signaturePreviewEmpty}</div>}
    </div>
  </div>;
}
