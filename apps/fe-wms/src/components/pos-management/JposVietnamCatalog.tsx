"use client";

import type { InvoiceVatRateName, PosHkCatalogProduct, PosVietnamProductSettings } from "@bduck/shared-types";
import {
  ArrowDownUp, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, CreditCard,
  FolderOpen, Gift, Info, ListFilter, Package, RefreshCw, Search, Tags, Ticket, X,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { posManagementApi } from "@/api/posManagementApi";
import { useTranslation } from "@/lib/i18n";
import { JposProductDetailOverlay } from "./JposProductDetailOverlay";
import { PosProductVisibilityPanel } from "./PosProductVisibilityPanel";

const labels = {
  vi: {
    catalog: "Danh mục HK và giá Việt Nam", visibility: "Hiển thị tại quầy",
    search: "Tìm theo tên, mã SKU hoặc nhóm", refresh: "Tải lại danh mục",
    item: "Sản phẩm", group: "Nhóm HK", hkPrice: "Giá HK trước thuế", hkGross: "Giá HK sau thuế",
    hkTax: "Thuế HK", status: "Trạng thái HK", updated: "Lần đồng bộ",
    available: "Đang bán", unavailable: "Ngừng bán", vietnam: "Giá Việt Nam",
    missing: "Chưa cấu hình", edit: "Cấu hình", view: "Xem", loading: "Đang tải danh mục…",
    failed: "Không thể tải danh mục.", empty: "Không tìm thấy sản phẩm.",
    draft: "Cấu hình chuẩn bị. JPOS tại quầy chưa áp dụng các giá và tùy chọn này.",
    price: "Giá bán đã gồm VAT (VND)", vat: "VAT Việt Nam", date: "Ngày hiệu lực dự kiến",
    importHk: "Cập nhật SKU từ HK", sendHk: "Gửi giao dịch bán sang HK",
    chooseVat: "Chọn VAT", save: "Lưu cấu hình", saving: "Đang lưu…", close: "Đóng",
    saved: "Đã lưu cấu hình.", invalid: "Nhập giá VND nguyên, VAT và ngày hiệu lực cùng nhau.",
    version: "Phiên bản", fixedTax: "cố định", reference: "Dữ liệu HK",
    pricing: "Giá và VAT Việt Nam", syncPolicy: "Chính sách đồng bộ",
    count: "sản phẩm", resetFilters: "Xóa bộ lọc", otherGroup: "Chưa phân nhóm",
    importHint: "Kiểm soát việc nhận cập nhật SKU từ danh mục HK.",
    sendHint: "Kiểm soát việc gửi đơn bán có SKU này sang HK.",
  },
  zh: {
    catalog: "HK 商品与越南售价", visibility: "收银台商品显示",
    search: "搜索名称、SKU 或分组", refresh: "刷新目录",
    item: "商品", group: "HK 分组", hkPrice: "HK 未税价", hkGross: "HK 含税价",
    hkTax: "HK 税额", status: "HK 状态", updated: "同步时间",
    available: "在售", unavailable: "停售", vietnam: "越南售价",
    missing: "未配置", edit: "配置", view: "查看", loading: "正在加载目录…",
    failed: "无法加载目录。", empty: "未找到商品。",
    draft: "这些配置用于准备。JPOS 收银端尚未应用售价和同步选项。",
    price: "含税售价（VND）", vat: "越南增值税", date: "预计生效日期",
    importHk: "从 HK 更新商品", sendHk: "发送销售交易到 HK",
    chooseVat: "选择增值税", save: "保存配置", saving: "正在保存…", close: "关闭",
    saved: "已保存配置。", invalid: "请同时填写整数售价、增值税和生效日期。",
    version: "版本", fixedTax: "固定金额", reference: "HK 参考数据",
    pricing: "越南售价与增值税", syncPolicy: "同步策略",
    count: "件商品", resetFilters: "清除筛选", otherGroup: "未分组",
    importHint: "控制是否从 HK 商品目录接收该 SKU 的更新。",
    sendHint: "控制是否将包含该 SKU 的订单发送至 HK。",
  },
};

const vatOptions = ["0%", "5%", "8%", "10%", "KCT", "KKKNT"] as const;
const fieldClass = "min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-xs outline-none focus-visible:border-amber-600 focus-visible:ring-2 focus-visible:ring-amber-200 disabled:bg-slate-50 disabled:text-slate-600";
const secondaryButton = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-xs transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:cursor-default disabled:opacity-50";

const catalogCategories: Record<number, { vi: string; zh: string }> = {
  1: { vi: "Gói xu", zh: "代币套餐" },
  2: { vi: "Gói điểm", zh: "积分套餐" },
  4: { vi: "Vé và combo", zh: "门票及组合" },
  6: { vi: "Nạp thẻ", zh: "卡片充值" },
  10: { vi: "Hàng lưu niệm", zh: "纪念商品" },
};

function groupCatalog(products: PosHkCatalogProduct[], lang: "vi" | "zh") {
  const groups = new Map<string, {
    id: string; name: string; category: string; categoryOrder: number; products: PosHkCatalogProduct[];
  }>();
  for (const product of products) {
    const groupName = product.group_name.trim();
    const id = JSON.stringify([product.category, groupName]);
    const group = groups.get(id);
    if (group) {
      group.products.push(product);
    } else {
      const category = catalogCategories[product.category]?.[lang] ?? "";
      groups.set(id, {
        id,
        name: groupName || category || labels[lang].otherGroup,
        category: groupName && groupName !== category ? category : "",
        categoryOrder: category ? product.category : Number.POSITIVE_INFINITY,
        products: [product],
      });
    }
  }
  return [...groups.values()].sort((a, b) =>
    (a.categoryOrder - b.categoryOrder) || a.name.localeCompare(b.name, lang),
  );
}

function formatCatalogValues(lang: "vi" | "zh") {
  const number = new Intl.NumberFormat(lang);
  const date = new Intl.DateTimeFormat(lang, {
    dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
  });
  return {
    amount: (value: number | null) => value === null ? "—" : number.format(value),
    syncTime: (value: string | null) => value && !Number.isNaN(Date.parse(value))
      ? date.format(new Date(value)) : "—",
  };
}

function hkTax(item: PosHkCatalogProduct, amount: (value: number | null) => string, fixed: string) {
  if (item.hk_tax_rate === null) return "—";
  const suffix = item.hk_tax_type === 1 ? "%" : item.hk_tax_type === 2 ? ` ${fixed}` : "";
  return amount(item.hk_tax_rate) + suffix;
}

function CatalogProductCard({ item, canManage, onSelect, format }: {
  item: PosHkCatalogProduct;
  canManage: boolean;
  onSelect: () => void;
  format: ReturnType<typeof formatCatalogValues>;
}) {
  const { lang } = useTranslation();
  const t = labels[lang];
  const price = item.vietnam_settings?.selling_price_vnd;
  const Icon = item.category === 4 ? Ticket : item.category === 6 ? CreditCard : Gift;
  const cover = item.category === 4
    ? "bg-amber-200 text-amber-950"
    : item.category === 1 || item.category === 2
      ? "bg-sky-200 text-sky-950"
      : "bg-violet-200 text-violet-950";

  return (
    <article className="h-full min-w-0 rounded-2xl border border-slate-200 bg-white shadow-xs transition-shadow hover:shadow-md motion-reduce:transition-none">
      <button type="button" onClick={onSelect} aria-haspopup="dialog"
        aria-label={`${canManage ? t.edit : t.view} ${item.goods_name}`}
        className="group/sku flex h-full w-full cursor-pointer flex-col rounded-2xl p-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">
        <span className={`relative grid h-24 w-full place-items-center overflow-hidden rounded-xl sm:h-28 ${cover}`}>
          <span aria-hidden className="absolute -right-7 -top-8 size-28 rounded-full bg-white/30" />
          <span aria-hidden className="absolute -bottom-9 -left-6 size-24 rounded-full bg-white/25" />
          <span className="relative grid size-12 -rotate-6 place-items-center rounded-2xl bg-white/60 shadow-sm">
            <Icon size={26} strokeWidth={1.8} aria-hidden />
          </span>
          <span aria-hidden className="absolute right-2 top-2 grid size-7 place-items-center rounded-lg bg-white/75">
            <ChevronRight size={17} />
          </span>
        </span>
        <span className="flex w-full flex-1 flex-col justify-between gap-2 px-1 pb-1 pt-3">
          <span className="line-clamp-2 break-words text-sm font-bold leading-snug text-slate-900">{item.goods_name}</span>
          <span>
            <span className="block text-xs font-medium text-slate-600">{t.vietnam}</span>
            <span className={`mt-0.5 block break-words font-bold tabular-nums ${price == null ? "text-sm text-slate-600" : "text-lg tracking-tight text-amber-950"}`}>
              {price == null ? t.missing : `${format.amount(price)} ₫`}
            </span>
          </span>
        </span>
      </button>
    </article>
  );
}

function ProductEditor({ product, warehouseId, canManage, onSaved, onClose }: {
  product: PosHkCatalogProduct;
  warehouseId: string;
  canManage: boolean;
  onSaved: (value: PosVietnamProductSettings) => void;
  onClose: () => void;
}) {
  const { lang } = useTranslation();
  const t = labels[lang];
  const current = product.vietnam_settings;
  const [price, setPrice] = useState(current?.selling_price_vnd?.toString() ?? "");
  const [vat, setVat] = useState<InvoiceVatRateName | "">(current?.vat_rate ?? "");
  const [date, setDate] = useState(current?.effective_date ?? "");
  const [importHk, setImportHk] = useState(current?.import_from_hk ?? true);
  const [sendHk, setSendHk] = useState(current?.send_sale_to_hk ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { amount, syncTime } = formatCatalogValues(lang);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || saving) return;
    const value = price === "" ? null : Number(price);
    if ((value === null && (vat || date)) ||
        (value !== null && (!/^[0-9]+$/.test(price) || value > 999_999_999_999 || !vat || !date))) {
      setError(t.invalid);
      return;
    }
    setError("");
    setSaving(true);
    try {
      onSaved(await posManagementApi.saveVietnamProductSettings(warehouseId, product.goods_id, {
        expected_version: current?.version ?? 0,
        selling_price_vnd: value,
        vat_rate: vat || null,
        effective_date: date || null,
        import_from_hk: importHk,
        send_sale_to_hk: sendHk,
      }, lang));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.failed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <JposProductDetailOverlay title={product.goods_name} closeLabel={t.close} saving={saving} onClose={onClose}>
      <form onSubmit={submit}>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="flex items-start gap-3 border-b border-slate-200 px-4 py-5 sm:px-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-800"><Tags size={20} aria-hidden /></span>
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-slate-900">{product.goods_id}{product.group_name && ` · ${product.group_name}`}</p>
          <p className="mt-1 text-sm text-slate-600">{product.hk_available ? t.available : t.unavailable}{current && ` · ${t.version} ${current.version}`}</p>
        </div>
      </header>
      <div className="grid gap-4 bg-slate-50 px-4 py-4 sm:px-6 lg:grid-cols-[12rem_1fr]">
        <div>
          <p className="text-sm font-semibold text-slate-800">{t.reference}</p>
          <p className="mt-1 text-xs text-slate-600">{t.updated} · {syncTime(product.hk_updated_at)}</p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-3">
          {[[t.hkPrice, amount(product.hk_price)], [t.hkGross, amount(product.hk_after_tax_price)], [t.hkTax, hkTax(product, amount, t.fixedTax)]].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-slate-600">{label}</dt>
              <dd className="mt-1 font-semibold tabular-nums text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <fieldset disabled={saving || !canManage} className="min-w-0 border-t border-slate-200 px-4 py-5 sm:px-6">
        <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><Tags size={16} className="text-amber-700" aria-hidden />{t.pricing}</h4>
        <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor="vietnam-price" className="text-sm font-medium">{t.price}</label>
          <input id="vietnam-price" className={fieldClass} value={price} inputMode="numeric" maxLength={12} onChange={(event) => setPrice(event.target.value)} />
        </div>
        <div className="space-y-1">
          <label htmlFor="vietnam-vat" className="text-sm font-medium">{t.vat}</label>
          <select id="vietnam-vat" className={fieldClass} value={vat} onChange={(event) => {
            setVat(vatOptions.find((option) => option === event.target.value) ?? "");
          }}>
            <option value="">{t.chooseVat}</option>
            {vatOptions.map((option) => <option key={option}>{option}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="vietnam-effective-date" className="text-sm font-medium">{t.date}</label>
          <input id="vietnam-effective-date" type="date" className={fieldClass} value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
        </div>
        <h4 className="mb-3 mt-6 flex items-center gap-2 text-sm font-semibold text-slate-900"><ArrowDownUp size={16} className="text-amber-700" aria-hidden />{t.syncPolicy}</h4>
        <div className="grid gap-2 lg:grid-cols-2">
          {[
            { label: t.importHk, hint: t.importHint, checked: importHk, onChange: setImportHk },
            { label: t.sendHk, hint: t.sendHint, checked: sendHk, onChange: setSendHk },
          ].map(({ label, hint, checked, onChange }) => (
            <label key={label} className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 has-enabled:cursor-pointer">
              <span>
                <span className="block text-sm font-medium text-slate-900">{label}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">{hint}</span>
              </span>
              <span className="relative shrink-0">
                <input type="checkbox" aria-label={label} className="peer sr-only" checked={checked}
                  onChange={(event) => onChange(event.target.checked)} />
                <span aria-hidden className="block h-6 w-11 rounded-full bg-slate-300 ring-offset-2 transition-colors peer-checked:bg-amber-600 peer-focus-visible:ring-2 peer-focus-visible:ring-amber-700 peer-disabled:opacity-50 motion-reduce:transition-none" />
                <span aria-hidden className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5 motion-reduce:transition-none" />
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p role="alert" className="mx-4 mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 sm:mx-6">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
        <button type="button" disabled={saving} onClick={onClose} className={secondaryButton}>{t.close}</button>
        {canManage && <button disabled={saving} className="min-h-11 cursor-pointer rounded-lg bg-amber-500 px-4 text-sm font-semibold text-slate-950 hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:opacity-50">{saving ? t.saving : t.save}</button>}
      </div>
      </div>
      </form>
    </JposProductDetailOverlay>
  );
}

function VietnamCatalog({ warehouseId, canManage }: { warehouseId: string; canManage: boolean }) {
  const { lang } = useTranslation();
  const t = labels[lang];
  const [products, setProducts] = useState<PosHkCatalogProduct[]>([]);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [status, setStatus] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void posManagementApi.listVietnamProductSettings(warehouseId, controller.signal, lang)
      .then((data) => { if (!controller.signal.aborted) setProducts(data); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : t.failed);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [lang, reload, t.failed, warehouseId]);

  const query = search.trim().toLocaleLowerCase(lang);
  const groups = groupCatalog(products, lang);
  const visibleGroups = groups
    .filter(({ id }) => !group || group === id)
    .map((entry) => ({
      ...entry,
      products: entry.products.filter((item) =>
        [item.goods_id, item.goods_name, entry.name, entry.category]
          .some((value) => value.toLocaleLowerCase(lang).includes(query)) &&
        (!status || (status === "available") === item.hk_available),
      ),
    }))
    .filter((entry) => entry.products.length > 0);
  const visibleCount = visibleGroups.reduce((count, entry) => count + entry.products.length, 0);
  const selected = products.find((item) => item.goods_id === editing);
  const format = formatCatalogValues(lang);
  const hasFilters = Boolean(search || group || status);
  const resetCollapsedGroups = () => setCollapsedGroups(new Set());
  const clearFilters = () => { setSearch(""); setGroup(""); setStatus(""); resetCollapsedGroups(); };

  return (
    <section className="space-y-4" aria-labelledby="jpos-hk-catalog-title">
      <h2 id="jpos-hk-catalog-title" className="sr-only">{t.catalog}</h2>
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm leading-relaxed text-amber-950">
        <Info size={17} aria-hidden className="mt-0.5 shrink-0 text-amber-800" />
        <p>{t.draft}</p>
      </div>
      {message && <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800"><CheckCircle2 size={17} aria-hidden />{message}</p>}
      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p aria-live="polite" className="text-sm font-semibold text-slate-800">
              {loading ? t.loading : `${visibleCount}${hasFilters ? `/${products.length}` : ""} ${t.count}`}
            </p>
            {hasFilters && <button type="button" onClick={clearFilters} className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded px-1 text-xs font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-amber-700"><X size={14} aria-hidden />{t.resetFilters}</button>}
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(11rem,1fr)_minmax(8rem,0.45fr)_minmax(8rem,0.4fr)_auto]">
            <div className="relative col-span-2 min-w-0 lg:col-span-1">
              <Search size={17} aria-hidden className="pointer-events-none absolute left-3 top-3.5 text-slate-500" />
              <input type="search" aria-label={t.search} placeholder={t.search} value={search}
                onChange={(event) => { setSearch(event.target.value); resetCollapsedGroups(); }} className={`${fieldClass} pl-9`} />
            </div>
            <select aria-label={t.group} className={`${fieldClass} min-w-0 truncate`} value={group}
              onChange={(event) => { setGroup(event.target.value); resetCollapsedGroups(); }}>
              <option value="">{t.group}</option>
              {groups.map((item) => <option key={item.id} value={item.id}>
                {item.name}{item.category && ` · ${item.category}`}
              </option>)}
            </select>
            <select aria-label={t.status} className={`${fieldClass} min-w-0`} value={status}
              onChange={(event) => { setStatus(event.target.value); resetCollapsedGroups(); }}>
              <option value="">{t.status}</option>
              <option value="available">{t.available}</option>
              <option value="unavailable">{t.unavailable}</option>
            </select>
            <button type="button" disabled={loading} onClick={() => { setMessage(""); setReload((count) => count + 1); }}
              className={`${secondaryButton} col-span-2 lg:col-span-1`}>
              <RefreshCw size={16} aria-hidden />{t.refresh}
            </button>
          </div>
      </div>
        {loading ? (
          <div aria-hidden className="space-y-3 p-4 motion-safe:animate-pulse">
            {[0, 1, 2].map((index) => <div key={index} className="h-16 rounded-lg bg-slate-100" />)}
          </div>
        ) : error ? (
          <div role="alert" className="m-3 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800"><CircleAlert size={17} aria-hidden className="shrink-0" />{error}</div>
        ) : visibleCount === 0 ? (
          <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center">
            <span className="grid size-11 place-items-center rounded-lg bg-slate-100 text-slate-600"><ListFilter size={21} aria-hidden /></span>
            <p className="text-sm font-medium text-slate-700">{t.empty}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleGroups.map((entry, index) => {
              const collapsed = collapsedGroups.has(entry.id);
              const panelId = `jpos-catalog-group-${index}`;
              return (
                <section key={entry.id} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  <h3>
                    <button type="button" aria-expanded={!collapsed} aria-controls={panelId}
                      onClick={() => setCollapsedGroups((current) => {
                        const next = new Set(current);
                        if (next.has(entry.id)) next.delete(entry.id);
                        else next.add(entry.id);
                        return next;
                      })}
                      className="flex min-h-14 w-full cursor-pointer items-center gap-3 bg-white px-3.5 py-2.5 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-700 sm:px-4">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-800">
                        <FolderOpen size={18} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-base font-semibold text-slate-900">{entry.name}</span>
                        {entry.category && <span className="block text-xs font-normal text-slate-600">{entry.category}</span>}
                      </span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                        {entry.products.length} {t.count}
                      </span>
                      <ChevronDown size={17} aria-hidden className={`shrink-0 text-slate-600 ${collapsed ? "-rotate-90" : ""}`} />
                    </button>
                  </h3>
                  <ul id={panelId} hidden={collapsed}
                    className={collapsed ? "hidden" : "grid grid-cols-2 gap-2 border-t border-slate-200 p-2.5 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] sm:gap-3 sm:p-4"}>
                    {!collapsed && entry.products.map((item) => (
                      <li key={item.goods_id} className="min-w-0">
                        <CatalogProductCard item={item} format={format} canManage={canManage}
                          onSelect={() => { setEditing(item.goods_id); setMessage(""); }} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      {selected && <ProductEditor key={selected.goods_id} product={selected} warehouseId={warehouseId} canManage={canManage}
        onClose={() => setEditing(null)} onSaved={(value) => {
          setProducts((items) => items.map((item) => item.goods_id === value.goods_id ? { ...item, vietnam_settings: value } : item));
          setEditing(null);
          setMessage(t.saved);
        }} />}
    </section>
  );
}

export function JposVietnamCatalog({ warehouseId, canManage }: { warehouseId: string; canManage: boolean }) {
  const { lang } = useTranslation();
  const t = labels[lang];
  const [view, setView] = useState<"catalog" | "visibility">("catalog");
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1" aria-label={t.item}>
        {(["catalog", "visibility"] as const).map((item) => (
          <button key={item} type="button" aria-pressed={view === item} onClick={() => setView(item)}
            className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 ${view === item ? "bg-white text-slate-900 shadow-xs ring-1 ring-slate-200" : "text-slate-600 hover:bg-white/60 hover:text-slate-900"}`}>
            {item === "catalog" ? <Tags size={16} aria-hidden className="text-amber-700" /> : <Package size={16} aria-hidden />}
            {t[item]}
          </button>
        ))}
      </nav>
      {view === "catalog"
        ? <VietnamCatalog warehouseId={warehouseId} canManage={canManage} />
        : <PosProductVisibilityPanel warehouseId={warehouseId} canManage={canManage} />}
    </div>
  );
}
