"use client";

import type { Product } from "@bduck/shared-types";
import { Image as ImageIcon } from "lucide-react";

import type { Dictionary } from "@/lib/i18n";
import { formatProductDetailNumber } from "@/utils/productDetailFormat";
import type { ProductStockSummary } from "@/utils/productStockDetail";

function MetricCard({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex min-w-0 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border-soft)] bg-[var(--color-surface-pearl)] p-2 text-center">
            <p className="text-xs font-medium text-[var(--color-text-muted)]">
                {label}
            </p>
            <p className="mt-1 max-w-full break-all text-lg font-bold text-[var(--color-text-primary)]">
                {formatProductDetailNumber(value)}
            </p>
        </div>
    );
}

function MetricCardHighlight({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex min-w-0 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border-soft)] bg-[var(--color-brand-primary)] p-2 text-center">
            <p className="text-xs font-medium text-white">
                {label}
            </p>
            <p className="mt-1 max-w-full break-all text-lg font-bold text-white">
                {formatProductDetailNumber(value)}
            </p>
        </div>
    );
}

export function ProductDetailSummaryPanel({
    product,
    stockSummary,
    labels,
}: {
    product: Product;
    stockSummary: ProductStockSummary;
    labels: Dictionary["productDetail"];
}) {
    const primaryImage = product.product_image_url?.[0] ?? null;
    const images = product.product_image_url ?? [];

    return (
        <div className="grid w-full min-w-0 shrink-0 grid-cols-2 gap-2">
            <div className="min-w-0 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-soft)] bg-[var(--color-surface-card)]">
                <div className="aspect-square">
                    {primaryImage ? (
                        <img
                            src={primaryImage}
                            alt={product.name}
                            className="h-full w-full object-cover"
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center">
                            <ImageIcon
                                size={48}
                                className="text-[var(--color-text-muted)]"
                            />
                        </div>
                    )}
                </div>
            </div>

            {images.length > 1 && (
                <div className="col-span-2 row-start-2 grid min-w-0 grid-cols-4 gap-2">
                    {images.slice(0, 8).map((url, index) => (
                        <img
                            key={`${url}-${index}`}
                            src={url}
                            alt={`${product.name} ${index + 1}`}
                            className="aspect-square w-full min-w-0 rounded-[var(--radius-sm)] border border-[var(--color-border-soft)] object-cover"
                        />
                    ))}
                </div>
            )}

            <div className="col-start-2 row-start-1 grid min-w-0 grid-cols-2 gap-2">
                <MetricCardHighlight label={labels.totalStock} value={stockSummary.total} />
                <MetricCard label={labels.atp} value={stockSummary.atp} />
                <MetricCard label={labels.onHold} value={stockSummary.onHold} />
                <MetricCard label={labels.quarantine} value={stockSummary.quarantine} />
            </div>
        </div>
    );
}
