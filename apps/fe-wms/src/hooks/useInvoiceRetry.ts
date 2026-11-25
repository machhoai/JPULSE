"use client";

import { InvoiceIssueItemStatus } from "@bduck/shared-types";
import { useEffect, useState } from "react";

import {
  invoiceApi,
  type InvoiceIssueRetryCandidate,
  type InvoiceSourceOrderView,
} from "@/api/invoiceApi";
import { invoiceErrorToast } from "@/components/invoices/invoiceErrorPresentation";
import { showToast } from "@/utils/toast";

type RetryCandidate = InvoiceIssueRetryCandidate & { businessDate: string };

export function useInvoiceRetry({
  warehouseId,
  dates,
  enabled,
  orders,
  lang,
  onCompleted,
}: {
  warehouseId: string;
  dates: string[];
  enabled: boolean;
  orders: InvoiceSourceOrderView[];
  lang: "vi" | "zh";
  onCompleted: () => void;
}) {
  const scope = warehouseId + ":" + dates.join(",");
  const [loaded, setLoaded] = useState<{
    scope: string;
    items: RetryCandidate[];
  }>();
  const [request, setRequest] = useState<{
    scope: string;
    items: RetryCandidate[];
  }>();
  const [jobHistory, setJobHistory] = useState<{
    warehouseId: string;
    ids: string[];
  }>();
  const [submitting, setSubmitting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const activeRequest =
    enabled && request?.scope === scope ? request : undefined;
  const candidates = enabled && loaded?.scope === scope ? loaded.items : [];
  const loadError =
    lang === "vi"
      ? "Không thể tải đơn có thể gửi lại."
      : "无法加载可重发订单。";
  const retryError =
    lang === "vi" ? "Không thể gửi lại hóa đơn." : "无法重发发票。";

  useEffect(() => {
    if (!enabled || !warehouseId) return;
    let current = true;
    if (dates.length === 0) return;
    void Promise.allSettled(
      dates.map(async (businessDate) => {
        const items = await invoiceApi.listIssueRetryCandidates(
          warehouseId,
          businessDate,
        );
        return items
          .filter(
            (item) => item.status === InvoiceIssueItemStatus.RETRYABLE_ERROR,
          )
          .map((item) => ({ ...item, businessDate }));
      }),
    ).then((results) => {
      if (!current) return;
      const items = results.flatMap((result) =>
        result.status === "fulfilled" ? result.value : [],
      );
      setLoaded({ scope, items });
      const failed = results.find((result) => result.status === "rejected");
      if (failed) {
        const error = invoiceErrorToast(failed.reason, "LOAD", loadError);
        showToast.error(error.title, error.description);
      }
    });
    return () => {
      current = false;
    };
  }, [dates, enabled, loadError, orders, refresh, scope, warehouseId]);

  function open(invoiceDocumentId?: string) {
    if (submitting) return;
    const items = invoiceDocumentId
      ? candidates.filter(
          (item) => item.invoice_document_id === invoiceDocumentId,
        )
      : candidates;
    if (items.length) setRequest({ scope, items });
  }

  async function confirm(otp: string) {
    if (!activeRequest || submitting) return;
    setSubmitting(true);
    try {
      const items = activeRequest.items;
      const result = await invoiceApi.retryStuckIssueItems(
        warehouseId,
        {
          business_dates: [...new Set(items.map((item) => item.businessDate))],
          invoice_document_ids: [
            ...new Set(items.map((item) => item.invoice_document_id)),
          ],
        },
        otp,
      );
      setJobHistory((current) => ({
        warehouseId,
        ids: [
          ...new Set([
            ...(current?.warehouseId === warehouseId ? current.ids : []),
            ...result.retried_items.map((item) => item.job_id),
          ]),
        ],
      }));
      setLoaded(undefined);
      setRequest(undefined);
      const sent = result.retried_count;
      const verified = result.already_on_misa_count;
      const unmatched = Math.max(0, items.length - sent - verified);
      const datesFailed = result.failed_dates ?? [];
      const summary =
        lang === "vi"
          ? `${sent} đã gửi vào hàng đợi · ${verified} đã có dấu vết trên MISA · ${unmatched} chưa gửi lại.`
          : `${sent} 笔已排队 · ${verified} 笔已在 MISA 留有记录 · ${unmatched} 笔未重发。`;
      if (datesFailed.length || unmatched) {
        showToast.warning(
          lang === "vi" ? "Kết quả gửi lại" : "重发结果",
          datesFailed.length ? summary + " " + datesFailed.join(", ") : summary,
        );
      } else {
        showToast.success(
          lang === "vi" ? "Đã xử lý yêu cầu gửi lại" : "已处理重发请求",
          summary,
        );
      }
      onCompleted();
    } catch (error) {
      const presented = invoiceErrorToast(error, "RETRY", retryError);
      showToast.error(presented.title, presented.description);
      setRefresh((value) => value + 1);
    } finally {
      setSubmitting(false);
    }
  }

  return {
    candidates,
    count: activeRequest?.items.length ?? 0,
    submitting,
    jobIds: jobHistory?.warehouseId === warehouseId ? jobHistory.ids : [],
    open,
    confirm,
    cancel: () => setRequest(undefined),
  };
}
