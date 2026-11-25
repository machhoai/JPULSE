import { ChevronLeft, ChevronRight } from "lucide-react";

export const INVOICE_PAGE_SIZE = 10;

export function InvoicePagination({
  page,
  total,
  lang,
  onPageChange,
}: {
  page: number;
  total: number;
  lang: "vi" | "zh";
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / INVOICE_PAGE_SIZE));
  if (!total) return null;
  const buttonClass =
    "inline-flex size-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-400 sm:size-8";
  return (
    <nav
      aria-label={lang === "vi" ? "Phân trang hóa đơn" : "发票分页"}
      className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-2 text-xs text-slate-600"
    >
      <span aria-live="polite" className="tabular-nums">
        {(page - 1) * INVOICE_PAGE_SIZE + 1}–
        {Math.min(total, page * INVOICE_PAGE_SIZE)} / {total}{" "}
        {lang === "vi" ? "đơn" : "笔"}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label={lang === "vi" ? "Trang trước" : "上一页"}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span className="tabular-nums">
          {lang === "vi" ? "Trang" : "页"} {page} / {pages}
        </span>
        <button
          type="button"
          className={buttonClass}
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          aria-label={lang === "vi" ? "Trang sau" : "下一页"}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
