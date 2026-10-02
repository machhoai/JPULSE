"use client";

import { gooeyToast } from "goey-toast";
import { Pencil } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { createPortal } from "react-dom";

import { externalQueueApi } from "@/api/externalQueueApi";
import { fetchExportVoucherById } from "@/hooks/useExportVoucherApi";
import { fetchImportVoucherById } from "@/hooks/useImportVoucherApi";
import { fetchTransferOrderById } from "@/hooks/useTransferOrderApi";
import { useTranslation } from "@/lib/i18n";
import { useUserStore } from "@/stores/useUserStore";
import { canReviseRejectedVoucher, type RevisionVoucher, type RevisionVoucherType } from "@/utils/voucherRevisionPolicy";

function RevisionLoadingSkeleton() {
  return <div className="fixed inset-4 z-50 animate-pulse rounded-xl bg-white p-6 shadow-xl"><div className="h-8 rounded bg-slate-100" /><div className="mt-4 h-64 rounded bg-slate-100" /></div>;
}

const EditImportVoucherModal = dynamic(() => import("../import-vouchers/EditImportVoucherModal").then(module => module.EditImportVoucherModal), {
  loading: RevisionLoadingSkeleton,
});

const BatchDetailDrawer = dynamic(() => import("../external-queue/BatchDetailDrawer"), {
  loading: RevisionLoadingSkeleton,
});

interface Props {
  type: RevisionVoucherType;
  voucher: RevisionVoucher;
  onSubmitted?: () => void;
}

export default function RejectedVoucherEditButton({ type, voucher, onSubmitted }: Props) {
  const { t } = useTranslation();
  const userId = useUserStore((state) => state.user?.id);
  const hasPermission = useUserStore((state) => state.hasPermission);
  const [isLoading, setIsLoading] = useState(false);
  const [editData, setEditData] = useState<Record<string, unknown> | null>(null);
  const [batchData, setBatchData] = useState<Record<string, unknown> | null>(null);
  const copy = t.voucherRevision;
  const allowed = canReviseRejectedVoucher(type, voucher, userId, hasPermission);

  const handleEdit = async () => {
    if (isLoading || !allowed) return;
    setIsLoading(true);
    try {
      const promise = (async () => {
        const fetchDetail = type === "IMPORT" ? fetchImportVoucherById :
          type === "EXPORT" ? fetchExportVoucherById : fetchTransferOrderById;
        const detail = await fetchDetail(voucher.id) as {
          voucher?: Record<string, unknown>;
          order?: Record<string, unknown>;
          items: Record<string, unknown>[];
        };
        const record = detail.voucher ?? detail.order;
        if (!record || record.status !== "REJECTED") throw new Error(copy.error);
        if (record.reference_type === "EXTERNAL_QUEUE_BATCH") {
          const result = await externalQueueApi.getPendingBatches() as { data: Array<Record<string, unknown>> };
          const batch = result.data.find((item) => item.batch_id === record.reference_id);
          if (!batch || batch.status !== "REVISION_REQUIRED") throw new Error(copy.error);
          setBatchData(batch);
          return;
        }
        setEditData({ ...record, id: voucher.id, type, items: detail.items });
      })();
      gooeyToast.promise(promise, {
        loading: copy.loading, success: copy.loaded, error: copy.error,
        description: { success: copy.loadDescription, error: copy.errorDescription },
        action: { error: { label: t.common.retry, onClick: () => void handleEdit() } },
      });
      await promise;
    } catch (error) {
      console.error("[RejectedVoucherEditButton] load failed:", error);
      gooeyToast.error(copy.error, { description: copy.errorDescription, preset: "snappy" });
    } finally {
      setIsLoading(false);
    }
  };

  if (!allowed) return null;
  return (
    <>
      <button type="button" onClick={() => void handleEdit()} disabled={isLoading}
        className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[var(--color-brand-primary)] px-2 py-1 text-xs font-semibold text-[var(--color-brand-primary)] disabled:opacity-50"
        title={copy.action} aria-label={copy.action}>
        <Pencil className="h-3.5 w-3.5 shrink-0" />
        <span>{copy.action}</span>
      </button>
      {editData && createPortal(
        <EditImportVoucherModal editData={editData} onClose={() => setEditData(null)}
          onSaved={() => { setEditData(null); onSubmitted?.(); }} />,
        document.body,
      )}
      {batchData && createPortal(
        <BatchDetailDrawer batchId={String(batchData.batch_id)} batchData={batchData}
          onClose={() => setBatchData(null)} onSuccess={() => { setBatchData(null); onSubmitted?.(); }} />,
        document.body,
      )}
    </>
  );
}
