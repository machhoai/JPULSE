"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  invoiceApi,
  type InvoiceDraftSourceChange,
  type InvoiceDraftSourceContent,
} from "@/api/invoiceApi";

import { invoiceErrorToast } from "./invoiceErrorPresentation";

const money = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const amount = (value: number | null) =>
  value === null ? "—" : money.format(value);

function InvoiceContent({
  content,
  lang,
}: {
  content: InvoiceDraftSourceContent;
  lang: "vi" | "zh";
}) {
  return (
    <div className="min-w-0 space-y-1 text-xs">
      <p>
        {lang === "vi" ? "Ngày thanh toán" : "付款日期"}:{" "}
        {content.payment_date ?? "—"} · {content.payment_method_name}
      </p>
      <ul className="space-y-2">
        {content.items.map((item, index) => (
          <li key={`${item.source_item_id ?? item.item_code}-${index}`}>
            <p className="font-medium">
              {item.item_name} · {item.item_code ?? "—"}
            </p>
            <p>
              {item.quantity} {item.unit_name} × {amount(item.unit_price)} ·{" "}
              {lang === "vi" ? "Giảm giá" : "折扣"}: {amount(item.discount)}
            </p>
            <p>
              {lang === "vi" ? "Trước thuế" : "税前"}:{" "}
              {amount(item.amount_without_vat)} · VAT {item.vat_rate_name}:{" "}
              {amount(item.vat_amount)} · {lang === "vi" ? "Tổng" : "合计"}:{" "}
              {amount(item.total_amount)}
            </p>
          </li>
        ))}
      </ul>
      <p>
        {lang === "vi"
          ? "Tổng trước thuế / VAT / thanh toán"
          : "税前总额 / VAT / 应付"}
        : {amount(content.total_amount_without_vat)} /{" "}
        {amount(content.total_vat_amount)} / {amount(content.total_amount)}
      </p>
    </div>
  );
}

export function InvoiceSourceUpdateReview({
  warehouseId,
  dates,
  refreshToken,
  canPrepare,
  lang,
  onChanged,
}: {
  warehouseId: string;
  dates: string[];
  refreshToken: number;
  canPrepare: boolean;
  lang: "vi" | "zh";
  onChanged: () => Promise<void>;
}) {
  const [changes, setChanges] = useState<InvoiceDraftSourceChange[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const generation = useRef(0);
  const datesKey = dates.join(",");
  const vi = lang === "vi";

  const load = useCallback(async () => {
    const requestGeneration = ++generation.current;
    setSelected([]);
    setChanges([]);
    setError(null);
    if (!warehouseId || !datesKey) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const results = await Promise.allSettled(
        datesKey
          .split(",")
          .map((date) => invoiceApi.listDraftSourceChanges(warehouseId, date)),
      );
      if (generation.current !== requestGeneration) return;
      setChanges(
        results.flatMap((entry) =>
          entry.status === "fulfilled" ? entry.value : [],
        ),
      );
      const failed = results.find((entry) => entry.status === "rejected");
      if (failed?.status === "rejected") {
        setError(
          invoiceErrorToast(
            failed.reason,
            "LOAD",
            vi ? "Chưa tải đủ danh sách cần kiểm tra" : "检查列表未完全加载",
          ).description,
        );
      }
    } finally {
      if (generation.current === requestGeneration) setLoading(false);
    }
  }, [warehouseId, datesKey, vi]);

  useEffect(() => {
    setResult(null);
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load, refreshToken]);

  const updateSelected = async () => {
    if (updating || !canPrepare) return;
    const requestGeneration = generation.current;
    const selectedIds = new Set(selected);
    const groups = new Map<string, InvoiceDraftSourceChange[]>();
    changes
      .filter((item) => selectedIds.has(item.source_order_document_id))
      .forEach((item) => {
        const key = `${item.warehouse_id}:${item.business_date}`;
        const group = groups.get(key) ?? [];
        group.push(item);
        groups.set(key, group);
      });
    setUpdating(true);
    setError(null);
    let updated = 0;
    let pending = 0;
    try {
      for (const group of groups.values()) {
        for (let cursor = 0; cursor < group.length; cursor += 500) {
          if (generation.current !== requestGeneration) return;
          const chunk = group.slice(cursor, cursor + 500);
          const response = await invoiceApi.bulkRebaseSourceOrders(
            chunk[0].warehouse_id,
            chunk[0].business_date,
            chunk.map((item) => item.source_order_document_id),
            chunk,
          );
          updated += response.rebased_count;
          pending += response.failed_count + response.skipped_count;
        }
      }
      if (generation.current !== requestGeneration) return;
      const reloadGeneration = generation.current + 1;
      await load();
      if (generation.current !== reloadGeneration) return;
      setResult(
        vi
          ? `Đã cập nhật ${updated} hóa đơn, giữ nguyên thông tin người mua. ${pending} hóa đơn chưa cập nhật; hãy kiểm tra danh sách mới.`
          : `已更新 ${updated} 张发票并保留买方信息。${pending} 张未更新，请检查最新列表。`,
      );
      await onChanged();
    } catch (updateError) {
      if (generation.current === requestGeneration) {
        const reloadGeneration = generation.current + 1;
        await load();
        if (generation.current !== reloadGeneration) return;
        setError(
          `${vi ? `Đã cập nhật ${updated} hóa đơn. ` : `已更新 ${updated} 张发票。`}${invoiceErrorToast(updateError, "UPDATE", vi ? "Cập nhật chưa hoàn tất" : "更新未完成").description}`,
        );
        await onChanged();
      }
    } finally {
      setUpdating(false);
    }
  };

  if (!loading && changes.length === 0 && !error && !result) return null;
  const allSelected = changes.length > 0 && selected.length === changes.length;
  return (
    <section
      aria-label={vi ? "Kiểm tra thay đổi dữ liệu hóa đơn" : "检查发票数据变化"}
      className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">
            {vi ? "Cần kiểm tra thay đổi" : "需要检查变化"} ({changes.length})
          </h2>
          <p className="text-xs text-slate-600">
            {vi
              ? "Các hóa đơn có thay đổi nội dung hoặc đã được chỉnh sửa. Kiểm tra trước/sau rồi chọn những đơn đồng ý cập nhật. Thông tin người mua được giữ nguyên."
              : "这些发票内容已变化或经过编辑。请比较更新前后并选择同意更新的订单。买方信息将被保留。"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || updating}
          className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
        >
          {vi ? "Tải lại danh sách" : "重新加载列表"}
        </button>
      </div>
      {loading && (
        <p role="status" className="text-xs">
          {vi ? "Đang kiểm tra dữ liệu…" : "正在检查数据…"}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-rose-700">
          {error}
        </p>
      )}
      {result && (
        <p role="status" className="text-xs">
          {result}
        </p>
      )}
      {changes.length > 0 && (
        <>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={allSelected}
              disabled={!canPrepare || updating || loading}
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? changes.map((item) => item.source_order_document_id)
                    : [],
                )
              }
            />
            {vi
              ? "Chọn tất cả các đơn trong danh sách kiểm tra"
              : "选择检查列表中的全部订单"}
          </label>
          <div className="max-h-[32rem] overflow-y-auto space-y-2">
            {changes.map((item) => (
              <div
                key={item.source_order_document_id}
                className="rounded-lg border border-amber-200 bg-white p-3"
              >
                <label className="flex items-start gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.includes(item.source_order_document_id)}
                    disabled={!canPrepare || updating || loading}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, item.source_order_document_id]
                          : current.filter(
                              (id) => id !== item.source_order_document_id,
                            ),
                      )
                    }
                  />
                  <span>
                    {item.order_number} · {item.buyer_name}
                    <span className="block text-xs font-normal text-slate-600">
                      {item.business_date} ·{" "}
                      {item.reason === "CONTENT_CHANGED"
                        ? vi
                          ? "Nội dung hóa đơn thay đổi"
                          : "发票内容变化"
                        : vi
                          ? "Bản nháp đã được chỉnh sửa, cần xác nhận cập nhật"
                          : "草稿已编辑，需要确认更新"}
                    </span>
                  </span>
                </label>
                <p className="mt-2 text-xs">
                  {vi ? "Tổng tiền" : "总金额"}:{" "}
                  {amount(item.before.total_amount)} →{" "}
                  {amount(item.after.total_amount)} · VAT:{" "}
                  {amount(item.before.total_vat_amount)} →{" "}
                  {amount(item.after.total_vat_amount)}
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium">
                    {vi
                      ? "Xem nội dung trước và sau cập nhật"
                      : "查看更新前后的内容"}
                  </summary>
                  {(item.before.meinvoice_account_id !==
                    item.after.meinvoice_account_id ||
                    item.before.legal_entity_id !==
                      item.after.legal_entity_id) && (
                    <p className="mt-2 text-xs text-amber-800">
                      {vi
                        ? "Tài khoản hoặc pháp nhân phát hành đã thay đổi; hãy kiểm tra cấu hình cửa hàng."
                        : "开票账户或法人已变化，请检查门店配置。"}
                    </p>
                  )}
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    <div>
                      <h3 className="mb-1 text-xs font-semibold">
                        {vi ? "Bản nháp hiện tại" : "当前草稿"}
                      </h3>
                      <InvoiceContent content={item.before} lang={lang} />
                    </div>
                    <div>
                      <h3 className="mb-1 text-xs font-semibold">
                        {vi ? "Dữ liệu mới" : "最新数据"}
                      </h3>
                      <InvoiceContent content={item.after} lang={lang} />
                    </div>
                  </div>
                </details>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void updateSelected()}
            disabled={
              !canPrepare || updating || loading || selected.length === 0
            }
            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {updating
              ? vi
                ? "Đang cập nhật…"
                : "正在更新…"
              : vi
                ? `Đồng ý cập nhật ${selected.length} hóa đơn đã chọn`
                : `同意更新所选 ${selected.length} 张发票`}
          </button>
        </>
      )}
    </section>
  );
}
