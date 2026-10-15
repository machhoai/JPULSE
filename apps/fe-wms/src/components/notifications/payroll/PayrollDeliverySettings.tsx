"use client";
import type { PayrollComposer, PayrollDeliveryOptions } from "@bduck/shared-types";
import { useEffect, useRef, useState } from "react";

import type { PayrollText } from "@/lib/i18n/payrollEmailTranslations";

const inputClass = "h-8 w-full rounded-lg border border-border-subtle bg-surface-input px-3 text-sm text-text-primary outline-none focus:border-border-focus focus:ring-2 focus:ring-brand-primary-muted disabled:opacity-50";

function CopyInput({ label, values, change, disabled }: { label: string; values: string[]; change: (values: string[]) => void; disabled: boolean }) {
    const [value, setValue] = useState(values.join(", "));
    const emitted = useRef(JSON.stringify(values));
    const serialized = JSON.stringify(values);
    useEffect(() => {
        if (serialized !== emitted.current) { setValue((JSON.parse(serialized) as string[]).join(", ")); emitted.current = serialized; }
    }, [serialized]);
    return <label className="block min-w-0 space-y-1 text-xs font-semibold text-text-secondary">{label}
        <input className={inputClass} disabled={disabled} value={value} onChange={event => {
            const raw = event.target.value;
            const next = raw.split(/[,;\n]/).map(address => address.trim()).filter(Boolean);
            emitted.current = JSON.stringify(next); setValue(raw); change(next);
        }} /></label>;
}

export default function PayrollDeliverySettings({ composer, change, text, disabled }: {
    composer: PayrollComposer; change: (composer: PayrollComposer) => void; text: PayrollText; disabled: boolean;
}) {
    return <fieldset className="space-y-2" disabled={disabled}>
        <label className="block space-y-1 text-xs font-semibold text-text-secondary">{text.replyTo}
            <input className={inputClass} type="email" value={composer.reply_to ?? ""} onChange={event => change({ ...composer, reply_to: event.target.value })} /></label>
        <div className="grid gap-2 sm:grid-cols-2">
            <CopyInput label={text.copyCc} values={composer.cc ?? []} change={cc => change({ ...composer, cc })} disabled={disabled} />
            <CopyInput label={text.copyBcc} values={composer.bcc ?? []} change={bcc => change({ ...composer, bcc })} disabled={disabled} />
        </div>
        <p className="text-xs text-text-muted">{text.deliveryHint}</p>
        {!!(composer.cc?.length || composer.bcc?.length) && <p role="note" className="rounded-lg bg-warning-bg p-2 text-xs text-warning-text">{text.copyWarning}</p>}
    </fieldset>;
}

export function PayrollDeliverySummary({ options, text }: { options: PayrollDeliveryOptions; text: PayrollText }) {
    return <dl className="space-y-1 break-all text-xs text-text-secondary">
        {options.reply_to && <div><dt className="inline font-medium">{text.replyTo}: </dt><dd className="inline">{options.reply_to}</dd></div>}
        {!!options.cc?.length && <div><dt className="inline font-medium">{text.copyCc}: </dt><dd className="inline">{options.cc.join(", ")}</dd></div>}
        {!!options.bcc?.length && <div><dt className="inline font-medium">{text.copyBcc}: </dt><dd className="inline">{options.bcc.join(", ")}</dd></div>}
    </dl>;
}
