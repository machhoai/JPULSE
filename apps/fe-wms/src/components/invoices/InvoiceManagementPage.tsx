"use client";

import {
  InvoiceDocumentStatus,
  InvoiceOrderSyncPurpose,
  InvoicePreparationStatus,
} from "@bduck/shared-types";
import {
  collection,
  onSnapshot,
  orderBy,
  query as firestoreQuery,
  where,
} from "firebase/firestore";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  FileCheck2,
  Link2,
  LoaderCircle,
  RefreshCw,
  ReceiptText,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  invoiceApi,
  type InvoiceSourceOrderView,
  type InvoiceSyncResult,
} from "@/api/invoiceApi";
import { ActionOtpModal } from "@/components/shared/ActionOtpModal";
import { useInvoiceRetry } from "@/hooks/useInvoiceRetry";
import { useStores } from "@/hooks/useWarehouses";
import { db } from "@/lib/firebase";
import { useTranslation } from "@/lib/i18n";
import { useUserStore } from "@/stores/useUserStore";
import { shortName } from "@/utils/name";
import { showToast } from "@/utils/toast";

import { BottomSheet } from "../ui/BottomSheet";

import {
  InvoiceBulkIssuePanel,
  type InvoiceBulkIssuePanelHandle,
} from "./bulk-issue/InvoiceBulkIssuePanel";
import { InvoiceConfigurationPanel } from "./InvoiceConfigurationPanel";
import { InvoiceDraftWorkflow } from "./InvoiceDraftWorkflow";
import { invoiceErrorToast } from "./invoiceErrorPresentation";
import {
  InvoiceLedgerPanel,
  type InvoiceIssuedStatistics,
} from "./InvoiceLedgerPanel";
import { INVOICE_PAGE_SIZE, InvoicePagination } from "./InvoicePagination";
import { InvoiceSourceUpdateReview } from "./InvoiceSourceUpdateReview";
import {
  canSelectForInvoiceIssue,
  invoiceBusinessStatus,
  invoiceDatesInRange,
  orderBelongsToWorkspaceTab,
  orderMatchesAttentionFilter,
  type InvoiceAttentionFilter,
  type InvoiceBusinessStatus,
  type InvoiceWorkspaceTab,
} from "./invoiceWorkspacePresentation";

const copy = {
  vi: {
    eyebrow: "MISA meInvoice",
    title: "Quản lý hóa đơn",
    subtitle: "Phát hành hóa đơn từ đơn POS Việt Nam đã thanh toán.",
    store: "Cửa hàng",
    date: "Ngày giao dịch",
    sync: "Cập nhật dữ liệu",
    syncing: "Đang cập nhật dữ liệu…",
    issueInvoices: "Phát hành hóa đơn",
    total: "Tổng đơn",
    ready: "Sẵn sàng phát hành",
    tax: "Thiếu cấu hình thuế",
    review: "Cần xử lý",
    search: "Tìm mã đơn hoặc khách hàng",
    all: "Tất cả trạng thái",
    empty: "Chưa có dữ liệu đơn hàng cho ngày này.",
    emptyHint:
      "Bấm Cập nhật dữ liệu để tải đơn JPOS và kiểm tra trạng thái MISA.",
    order: "Đơn hàng",
    payment: "Thanh toán",
    beforeTax: "Trước thuế",
    vat: "VAT",
    totalMoney: "Tổng tiền",
    status: "Preflight",
    detail: "Chi tiết kiểm tra",
    sourceItems: "Dòng hàng hóa",
    issues: "Điểm cần xử lý",
    noIssues: "Không có lỗi preflight.",
    preview: "Xem trước hóa đơn",
    previewing: "Đang tạo link…",
    previewExpires: "Link MISA có hiệu lực 5 phút.",
    close: "Đóng",
    loading: "Đang tải dữ liệu…",
    noStore: "Bạn chưa có cửa hàng phù hợp trong phạm vi quyền.",
    syncDone: "Cập nhật dữ liệu hoàn tất",
    inserted: "Mới",
    updated: "Thay đổi",
    unchanged: "Không đổi",
    retry: "Thử lại",
    syncFailed: "Cập nhật dữ liệu chưa hoàn tất",
    syncDescription:
      "Bản nháp an toàn được cập nhật tự động, giữ thông tin người mua. Những đơn cần xác nhận nằm trong danh sách Cần kiểm tra thay đổi.",
    previewReady: "Đã tạo bản xem trước",
    previewFailed: "Không thể xem trước hóa đơn",
    matchedMisa: "Khớp MISA",
    misaReturned: "MISA trả về",
    notIssued: "Chưa xuất",
    mismatches: "Sai lệch",
    unlinked: "Chưa có mã liên kết",
    syncSummaryTitle: "Kết quả đồng bộ",
    syncDetailsTitle: "Đối chiếu MISA",
    errorTitle: "Lỗi tải dữ liệu",
    dismiss: "Ẩn",
  },
  zh: {
    eyebrow: "MISA meInvoice",
    title: "发票管理",
    subtitle: "为越南 POS 已支付订单开具发票。",
    store: "门店",
    date: "交易日期",
    sync: "更新数据",
    syncing: "正在更新数据…",
    issueInvoices: "开具发票",
    total: "订单总数",
    ready: "可开票",
    tax: "缺少税务配置",
    review: "需要处理",
    search: "搜索订单号或客户",
    all: "全部状态",
    empty: "当天尚无订单数据。",
    emptyHint: "请选择更新数据，加载 JPOS 订单并检查 MISA 状态。",
    order: "订单",
    payment: "付款",
    beforeTax: "税前金额",
    vat: "增值税",
    totalMoney: "总金额",
    status: "预检",
    detail: "检查详情",
    sourceItems: "商品明细",
    issues: "待处理项",
    noIssues: "没有预检错误。",
    preview: "预览发票",
    previewing: "正在生成链接…",
    previewExpires: "MISA 预览链接有效期为 5 分钟。",
    close: "关闭",
    loading: "正在加载…",
    noStore: "您的权限范围内没有可用门店。",
    syncDone: "数据更新完成",
    inserted: "新增",
    updated: "更新",
    unchanged: "未变化",
    retry: "重试",
    syncFailed: "发票同步失败",
    syncDescription:
      "安全草稿已自动更新并保留买方信息。需确认的订单位于需要检查变化列表。",
    previewReady: "预览已生成",
    previewFailed: "无法预览发票",
    matchedMisa: "MISA 匹配",
    misaReturned: "MISA 返回",
    notIssued: "未开票",
    mismatches: "差异/不匹配",
    unlinked: "未关联代码",
    syncSummaryTitle: "同步结果",
    syncDetailsTitle: "MISA 对账",
    errorTitle: "加载数据错误",
    dismiss: "隐藏",
  },
} as const;

const todayInVietnam = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const initialQueryValue = (key: string, fallback = "") => {
  if (typeof window === "undefined") return fallback;
  return new URLSearchParams(window.location.search).get(key) ?? fallback;
};

const money = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const statusStyle = (status: InvoicePreparationStatus) => {
  if (
    status === InvoicePreparationStatus.READY_TO_ISSUE ||
    status === InvoicePreparationStatus.READY_FOR_REVIEW
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === InvoicePreparationStatus.NEEDS_TAX_CONFIGURATION) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-rose-200 bg-rose-50 text-rose-700";
};

const statusLabel = (status: InvoicePreparationStatus, lang: "vi" | "zh") => {
  const values = {
    vi: {
      [InvoicePreparationStatus.READY_FOR_REVIEW]: "Sẵn sàng để xem",
      [InvoicePreparationStatus.READY_TO_ISSUE]: "Sẵn sàng phát hành",
      [InvoicePreparationStatus.NEEDS_TAX_CONFIGURATION]: "Thiếu cấu hình thuế",
      [InvoicePreparationStatus.NEEDS_REVIEW]: "Cần xem lại",
      [InvoicePreparationStatus.NEEDS_CORRECTION]: "Cần chỉnh dữ liệu",
    },
    zh: {
      [InvoicePreparationStatus.READY_FOR_REVIEW]: "可开票",
      [InvoicePreparationStatus.READY_TO_ISSUE]: "可开票",
      [InvoicePreparationStatus.NEEDS_TAX_CONFIGURATION]: "缺少税务配置",
      [InvoicePreparationStatus.NEEDS_REVIEW]: "需要处理",
      [InvoicePreparationStatus.NEEDS_CORRECTION]: "需要修正数据",
    },
  };
  return values[lang][status] ?? status;
};

const businessStatusCopy: Record<
  "vi" | "zh",
  Record<InvoiceBusinessStatus, string>
> = {
  vi: {
    NOT_READY: "Chưa sẵn sàng",
    REVIEW_REQUIRED: "Cần kiểm tra",
    READY: "Sẵn sàng phát hành",
    SENDING: "Đang gửi MISA",
    ISSUED: "Đã phát hành",
    ISSUE_FAILED: "Phát hành thất bại",
    DISCREPANCY: "Có sai lệch",
  },
  zh: {
    NOT_READY: "尚未就绪",
    REVIEW_REQUIRED: "需要检查",
    READY: "可以开票",
    SENDING: "正在发送到 MISA",
    ISSUED: "已开票",
    ISSUE_FAILED: "开票失败",
    DISCREPANCY: "存在差异",
  },
};

const businessStatusStyle: Record<InvoiceBusinessStatus, string> = {
  NOT_READY: "border-slate-200 bg-slate-100 text-slate-700",
  REVIEW_REQUIRED: "border-amber-200 bg-amber-50 text-amber-800",
  READY: "border-emerald-200 bg-emerald-50 text-emerald-700",
  SENDING: "border-sky-200 bg-sky-50 text-sky-700",
  ISSUED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ISSUE_FAILED: "border-rose-200 bg-rose-50 text-rose-700",
  DISCREPANCY: "border-violet-200 bg-violet-50 text-violet-700",
};

export default function InvoiceManagementPage() {
  const { lang } = useTranslation();
  const d = copy[lang];
  const { stores, loading: storesLoading } = useStores();
  const hasPermission = useUserStore((state) => state.hasPermission);
  const [view, setView] = useState<InvoiceWorkspaceTab>(() => {
    const value = initialQueryValue("tab");
    if (value === "ISSUED") return "ISSUED";
    if (value === "READY" || value === "PENDING") return "READY";
    return "ACTION_REQUIRED";
  });
  const [selectedStoreId, setSelectedStoreId] = useState(() =>
    initialQueryValue("store"),
  );
  const activeStoreId = stores.some((store) => store.id === selectedStoreId)
    ? selectedStoreId
    : (stores[0]?.id ?? "");
  const [businessDate, setBusinessDate] = useState(() =>
    initialQueryValue("date", todayInVietnam()),
  );
  const [businessDateTo, setBusinessDateTo] = useState(() =>
    initialQueryValue("date_to", initialQueryValue("date", todayInVietnam())),
  );
  const [orders, setOrders] = useState<InvoiceSourceOrderView[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedOrder, setSelectedOrder] =
    useState<InvoiceSourceOrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<InvoiceSyncResult | null>(null);
  const [ledgerRefresh, setLedgerRefresh] = useState(0);
  const [sourceUpdateRefreshToken, setSourceUpdateRefreshToken] = useState(0);
  const [sourceUpdateSummary, setSourceUpdateSummary] = useState<string | null>(
    null,
  );
  const [selectedIssueIds, setSelectedIssueIds] = useState<string[]>([]);
  const [query, setQuery] = useState(() => initialQueryValue("q"));
  const [listPage, setListPage] = useState(1);
  const [attentionFilter, setAttentionFilter] =
    useState<InvoiceAttentionFilter>("ALL");
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [issuedStatisticsByDate, setIssuedStatisticsByDate] = useState<
    Record<string, InvoiceIssuedStatistics>
  >({});
  const loadGeneration = useRef(0);
  const bulkIssueRef = useRef<InvoiceBulkIssuePanelHandle>(null);
  const selectedDates = useMemo(
    () => invoiceDatesInRange(businessDate, businessDateTo),
    [businessDate, businessDateTo],
  );

  const loadOrders = useCallback(async () => {
    const generation = ++loadGeneration.current;
    if (!activeStoreId || selectedDates.length === 0) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const nextOrders = (
        await Promise.all(
          selectedDates.map((date) =>
            invoiceApi.listSourceOrders(activeStoreId, date),
          ),
        )
      ).flat();
      if (generation === loadGeneration.current) setOrders(nextOrders);
    } catch (loadError) {
      if (generation !== loadGeneration.current) return;
      setOrders([]);
      const presented = invoiceErrorToast(
        loadError,
        "LOAD",
        lang === "vi"
          ? "Không thể tải danh sách hóa đơn."
          : "Unable to load invoices.",
      );
      setError(presented.description);
      showToast.error(presented.title, presented.description);
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [activeStoreId, lang, selectedDates]);

  const refreshInvoiceResults = useCallback(() => {
    setLedgerRefresh((version) => version + 1);
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    void loadOrders();
    return () => {
      loadGeneration.current += 1;
    };
  }, [loadOrders]);

  useEffect(() => {
    if (!activeStoreId || selectedDates.length !== 1) return;

    let receivedInitialSnapshot = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const sourceOrdersQuery = firestoreQuery(
      collection(db, "invoice_source_orders"),
      where("warehouse_id", "==", activeStoreId),
      where("business_date", "==", selectedDates[0]),
      where("is_deleted", "==", false),
      orderBy("source_action_time", "desc"),
    );
    const unsubscribe = onSnapshot(
      sourceOrdersQuery,
      () => {
        if (!receivedInitialSnapshot) {
          receivedInitialSnapshot = true;
          return;
        }
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => void loadOrders(), 250);
      },
      (snapshotError) => {
        console.warn(
          "[InvoiceManagementPage] Realtime source order listener failed:",
          snapshotError,
        );
      },
    );

    return () => {
      unsubscribe();
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [activeStoreId, loadOrders, selectedDates]);

  useEffect(() => {
    setSelectedOrder((current) => {
      if (!current) return null;
      return orders.find((order) => order.id === current.id) ?? current;
    });
  }, [orders]);

  useEffect(() => {
    setSelectedIssueIds([]);
    setSourceUpdateSummary(null);
    setListPage(1);
  }, [activeStoreId, businessDate, businessDateTo]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const setOrDelete = (key: string, value: string, defaultValue = "") => {
      if (!value || value === defaultValue) params.delete(key);
      else params.set(key, value);
    };
    setOrDelete("store", activeStoreId);
    setOrDelete("date", businessDate, todayInVietnam());
    setOrDelete("date_to", businessDateTo, businessDate);
    setOrDelete("q", query.trim());
    setOrDelete("tab", view, "ACTION_REQUIRED");
    const next = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${next ? `?${next}` : ""}`,
    );
  }, [activeStoreId, businessDate, businessDateTo, query, view]);

  const handleSync = async () => {
    if (!activeStoreId || selectedDates.length === 0) return;
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    setSourceUpdateSummary(null);
    try {
      const operation = (async () => {
        let lastResult: InvoiceSyncResult | null = null;
        const draftCounts = { created: 0, updated: 0, legacySkipped: 0 };
        for (const date of selectedDates) {
          lastResult = await invoiceApi.syncSourceOrders(
            activeStoreId,
            date,
            InvoiceOrderSyncPurpose.ISSUE,
            canReconcile,
          );
          draftCounts.created += lastResult.draft_created_count;
          draftCounts.updated += lastResult.draft_rebased_count;
          draftCounts.legacySkipped += lastResult.legacy_skipped_count ?? 0;
        }
        if (!lastResult) throw new Error("INVOICE_DATE_RANGE_EMPTY");
        setSyncResult(selectedDates.length === 1 ? lastResult : null);
        setLedgerRefresh((version) => version + 1);
        await loadOrders();
        const legacySummary =
          draftCounts.legacySkipped > 0
            ? lang === "vi"
              ? ` Có ${draftCounts.legacySkipped} đơn đã liên kết với hồ sơ lịch sử và cần kiểm tra để tránh phát hành trùng.`
              : ` 有 ${draftCounts.legacySkipped} 笔订单关联历史记录，需要核对以避免重复开票。`
            : "";
        setSourceUpdateSummary(
          (lang === "vi"
            ? `Đã tạo ${draftCounts.created} và tự cập nhật ${draftCounts.updated} hóa đơn nháp, giữ thông tin người mua. Các đơn cần xác nhận được gom trong danh sách “Cần kiểm tra thay đổi”.`
            : `已创建 ${draftCounts.created} 并自动更新 ${draftCounts.updated} 张草稿，保留买方信息。需确认的订单已汇总在“需要检查变化”列表。`) +
            legacySummary,
        );
        return lastResult;
      })();
      await showToast.promise(operation, {
        loading: d.syncing,
        success: d.syncDone,
        error: d.syncFailed,
        successDescription: `${canReconcile ? d.syncDescription : lang === "vi" ? "Đơn hàng và bản nháp đã được cập nhật; tài khoản hiện tại không có quyền chạy đối chiếu MISA." : "Orders and drafts were updated; this account cannot run MISA reconciliation."}${
          selectedDates.length > 1
            ? ` ${selectedDates.length} ${lang === "vi" ? "ngày đã được xử lý." : "days processed."}`
            : ""
        }`,
        errorDescription: (toastError) =>
          invoiceErrorToast(toastError, "UPDATE", d.syncFailed).description,
      });
    } catch (syncError) {
      setError(
        invoiceErrorToast(syncError, "UPDATE", d.syncFailed).description,
      );
    } finally {
      setSourceUpdateRefreshToken((current) => current + 1);
      setSyncing(false);
    }
  };

  const stats = useMemo(
    () => ({
      total: orders.length,
      ready: orders.filter((order) =>
        orderBelongsToWorkspaceTab(order, "READY"),
      ).length,
      action: orders.filter((order) =>
        orderBelongsToWorkspaceTab(order, "ACTION_REQUIRED"),
      ).length,
      sending: orders.filter(
        (order) => invoiceBusinessStatus(order) === "SENDING",
      ).length,
    }),
    [orders],
  );

  const handleIssuedStatisticsLoaded = useCallback(
    (
      warehouseId: string,
      date: string,
      statistics: InvoiceIssuedStatistics,
    ) => {
      setIssuedStatisticsByDate((current) => ({
        ...current,
        [`${warehouseId}:${date}`]: statistics,
      }));
    },
    [],
  );

  const issuedStatistics = useMemo(() => {
    const dailyStatistics = selectedDates
      .map((date) => issuedStatisticsByDate[`${activeStoreId}:${date}`])
      .filter((value): value is InvoiceIssuedStatistics => Boolean(value));

    return {
      loading: dailyStatistics.length < selectedDates.length,
      misaIssuedCount: dailyStatistics.reduce(
        (total, item) => total + item.misaIssuedCount,
        0,
      ),
      matchedOrderCount: dailyStatistics.reduce(
        (total, item) => total + item.matchedOrderCount,
        0,
      ),
      matchedRevenue: dailyStatistics.reduce(
        (total, item) => total + item.matchedRevenue,
        0,
      ),
    };
  }, [activeStoreId, issuedStatisticsByDate, selectedDates]);

  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(lang);
    return orders.filter((order) => {
      if (!orderBelongsToWorkspaceTab(order, view)) return false;
      if (
        view === "ACTION_REQUIRED" &&
        !orderMatchesAttentionFilter(order, attentionFilter)
      )
        return false;
      if (!normalizedQuery) return true;
      return [
        order.order_number,
        order.source_order_id,
        order.local_order_id,
        order.customer_name,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase(lang).includes(normalizedQuery),
        );
    });
  }, [attentionFilter, lang, orders, query, view]);

  const canPrepare = hasPermission("invoices.prepare", activeStoreId);
  const canReconcile = hasPermission("invoices.reconcile", activeStoreId);
  const canUpdate = canPrepare;
  const canBulkIssue = hasPermission("invoices.bulk_issue", activeStoreId);
  const canRetryIssue = hasPermission("invoices.retry", activeStoreId);
  const canConfigure = hasPermission("invoices.config", activeStoreId);
  const retry = useInvoiceRetry({
    warehouseId: activeStoreId,
    dates: selectedDates,
    enabled: canRetryIssue,
    orders,
    lang,
    onCompleted: refreshInvoiceResults,
  });
  const retryableIds = new Set(
    retry.candidates.map((item) => item.invoice_document_id),
  );
  const page = Math.min(
    listPage,
    Math.max(1, Math.ceil(filteredOrders.length / INVOICE_PAGE_SIZE)),
  );
  const visibleOrders = filteredOrders.slice(
    (page - 1) * INVOICE_PAGE_SIZE,
    page * INVOICE_PAGE_SIZE,
  );
  const invoiceViews: Array<[InvoiceWorkspaceTab, string, number | null]> = [
    [
      "ACTION_REQUIRED",
      lang === "vi" ? "Cần xử lý" : "Action required",
      stats.action,
    ],
    [
      "READY",
      lang === "vi" ? "Sẵn sàng phát hành" : "Ready to issue",
      stats.ready,
    ],
    ["ISSUED", lang === "vi" ? "Đã phát hành" : "Issued", null],
  ];
  const readyOrders = orders.filter(canSelectForInvoiceIssue);
  const selectedEligibleOrders = readyOrders.filter((order) =>
    selectedIssueIds.includes(order.id),
  );
  const selectedIssueDates = [
    ...new Set(selectedEligibleOrders.map((order) => order.business_date)),
  ];
  const readyDates = [
    ...new Set(readyOrders.map((order) => order.business_date)),
  ];
  const issueBusinessDate =
    selectedIssueDates.length === 1
      ? selectedIssueDates[0]
      : selectedIssueDates.length === 0 && selectedDates.length === 1
        ? selectedDates[0]
        : selectedIssueDates.length === 0 && readyDates.length === 1
          ? readyDates[0]
          : "";
  const issueEligibleOrders = issueBusinessDate
    ? readyOrders.filter((order) => order.business_date === issueBusinessDate)
    : [];
  const pageIssueDate =
    issueBusinessDate ||
    visibleOrders.find(canSelectForInvoiceIssue)?.business_date;
  const selectableIssueIds = visibleOrders
    .filter(
      (order) =>
        canSelectForInvoiceIssue(order) &&
        order.business_date === pageIssueDate,
    )
    .map((order) => order.id);
  const selectedEligibleIds = selectedEligibleOrders.map((order) => order.id);
  const allPageOrdersSelected =
    selectableIssueIds.length > 0 &&
    selectableIssueIds.every((id) => selectedEligibleIds.includes(id));
  const dailyEligibleCount = issueEligibleOrders.length;

  const toggleIssueId = (id: string) => {
    const target = orders.find((order) => order.id === id);
    if (!target) return;
    setSelectedIssueIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      const sameDateIds = current.filter((value) =>
        orders.some(
          (order) =>
            order.id === value && order.business_date === target.business_date,
        ),
      );
      return [...sameDateIds, id];
    });
  };

  if (!storesLoading && stores.length === 0) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] p-6 text-center">
        <ReceiptText
          className="mb-3 text-[var(--color-text-muted)]"
          size={40}
        />
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">
          {d.noStore}
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3 pb-4">
      <header className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)]">
        <div className="border-b border-[var(--color-border-subtle)] bg-[linear-gradient(120deg,#0f172a,#163a5f)] px-3 py-4 text-white sm:px-4">
          <p className="text-xxs font-semibold uppercase tracking-[0.18em] text-sky-200">
            {d.eyebrow}
          </p>
          <h1 className="mt-0.5 text-lg font-bold">{d.title}</h1>
          <p className="mt-0.5 max-w-2xl text-xs text-slate-300">
            {d.subtitle}
          </p>
        </div>
        <div className="grid min-w-0 gap-2 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(160px,1fr)_minmax(250px,1.25fr)_auto] xl:items-end">
          <Field label={d.store}>
            <select
              value={activeStoreId}
              onChange={(event) => setSelectedStoreId(event.target.value)}
              className="h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-white px-2.5 text-sm font-semibold outline-none focus:border-[var(--color-brand-primary)]"
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={lang === "vi" ? "Ngày / khoảng ngày" : "Date / date range"}
          >
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="date"
                value={businessDate}
                max={businessDateTo}
                onChange={(event) => {
                  const value = event.target.value;
                  setBusinessDate(value);
                  if (businessDateTo < value) setBusinessDateTo(value);
                }}
                aria-label={lang === "vi" ? "Từ ngày" : "From date"}
                className="h-11 min-w-0 w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-white px-2 text-xs font-semibold outline-none focus:border-[var(--color-brand-primary)]"
              />
              <input
                type="date"
                value={businessDateTo}
                min={businessDate}
                onChange={(event) => setBusinessDateTo(event.target.value)}
                aria-label={lang === "vi" ? "Đến ngày" : "To date"}
                className="h-11 min-w-0 w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-white px-2 text-xs font-semibold outline-none focus:border-[var(--color-brand-primary)]"
              />
            </div>
            {businessDateTo >= businessDate && selectedDates.length === 0 && (
              <span className="text-xxs font-medium text-rose-600">
                {lang === "vi"
                  ? "Khoảng ngày tối đa 31 ngày."
                  : "The maximum range is 31 days."}
              </span>
            )}
          </Field>
          <div
            className={`grid min-w-0 gap-2 sm:col-span-2 xl:col-span-1 ${canConfigure ? "grid-cols-[44px_minmax(0,1fr)_44px]" : "grid-cols-[44px_minmax(0,1fr)]"}`}
          >
            <button
              type="button"
              aria-label={syncing ? d.syncing : d.sync}
              aria-busy={syncing}
              title={syncing ? d.syncing : d.sync}
              onClick={handleSync}
              disabled={
                !canUpdate ||
                syncing ||
                !activeStoreId ||
                selectedDates.length === 0
              }
              className="inline-flex size-11 items-center justify-center rounded-[var(--radius-md)] border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              {syncing ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="motion-safe:animate-spin"
                  size={17}
                />
              ) : (
                <RefreshCw aria-hidden="true" size={17} />
              )}
            </button>
            <button
              type="button"
              onClick={() =>
                bulkIssueRef.current?.openIssue(
                  selectedEligibleIds.length > 0 ? "SELECTED" : "ALL",
                )
              }
              disabled={
                !canBulkIssue || dailyEligibleCount === 0 || syncing || loading
              }
              title={
                dailyEligibleCount === 0 && readyDates.length > 1
                  ? lang === "vi"
                    ? "Khi xem nhiều ngày, hãy chọn hóa đơn của một ngày trước khi phát hành."
                    : "Select invoices from one day before issuing."
                  : undefined
              }
              className="inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-sky-700 px-2 text-xs font-bold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 sm:px-4 sm:text-sm"
            >
              <Send size={16} />
              {d.issueInvoices}
              {selectedEligibleIds.length > 0
                ? ` (${selectedEligibleIds.length})`
                : ""}
            </button>
            {canConfigure && (
              <button
                type="button"
                onClick={() => setConfigurationOpen(true)}
                className="inline-flex size-11 items-center justify-center rounded-[var(--radius-md)] border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                aria-label={
                  lang === "vi"
                    ? "Mở cấu hình hóa đơn"
                    : "Open invoice configuration"
                }
                title={
                  lang === "vi" ? "Cấu hình hóa đơn" : "Invoice configuration"
                }
              >
                <Settings2 size={17} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </header>

      <nav
        className="grid grid-cols-3 gap-1 rounded-2xl border border-[var(--color-border-subtle)] bg-white p-1 shadow-2xs"
        aria-label="Invoice views"
      >
        {invoiceViews.map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setView(value);
              setAttentionFilter("ALL");
              setListPage(1);
              setSelectedIssueIds([]);
            }}
            className={`flex min-h-11 items-center justify-center gap-1 rounded-xl px-2 py-2 text-center text-[11px] font-semibold leading-tight transition sm:text-xs ${
              view === value
                ? "bg-slate-900 text-white shadow-2xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <span>{label}</span>
            {count !== null && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] ${view === value ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600"}`}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </nav>

      {error && (
        <ErrorNotificationCard
          d={d}
          error={error}
          loading={loading}
          onDismiss={() => setError(null)}
          onRetry={() => void loadOrders()}
        />
      )}
      {syncResult && (
        <details className="rounded-xl border border-slate-200 bg-white p-2 text-xs">
          <summary className="cursor-pointer px-2 py-1 font-semibold text-slate-700">
            {d.syncSummaryTitle}
          </summary>
          <SyncResultCard
            d={d}
            onDismiss={() => setSyncResult(null)}
            syncResult={syncResult}
          />
        </details>
      )}
      {sourceUpdateSummary && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900"
        >
          {sourceUpdateSummary}
        </p>
      )}

      <InvoiceSourceUpdateReview
        warehouseId={activeStoreId}
        dates={selectedDates}
        refreshToken={sourceUpdateRefreshToken}
        canPrepare={canPrepare && !syncing}
        lang={lang}
        onChanged={loadOrders}
      />

      <InvoiceBulkIssuePanel
        key={activeStoreId}
        ref={bulkIssueRef}
        warehouseId={activeStoreId}
        businessDate={issueBusinessDate || businessDate}
        selectedIds={selectedEligibleIds}
        eligibleCount={dailyEligibleCount}
        canIssue={canBulkIssue}
        retryJobIds={retry.jobIds}
        lang={lang}
        onIssued={() => setSelectedIssueIds([])}
        onCompleted={refreshInvoiceResults}
        showLauncher={false}
        showProgress={view !== "ISSUED"}
      />

      {view !== "ISSUED" ? (
        <>
          <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <StatCard
              label={d.total}
              value={stats.total}
              icon={<ReceiptText size={15} />}
            />
            <StatCard
              label={d.ready}
              value={stats.ready}
              icon={<ShieldCheck size={15} />}
              tone="success"
            />
            <StatCard
              label={lang === "vi" ? "Cần xử lý" : "Action required"}
              value={stats.action}
              icon={<AlertTriangle size={15} />}
              tone="danger"
            />
            <StatCard
              label={lang === "vi" ? "Đang gửi MISA" : "Sending to MISA"}
              value={stats.sending}
              icon={<RefreshCw size={15} />}
              tone="warning"
            />
          </section>

          <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)]">
            <div className="flex flex-col gap-2 border-b border-[var(--color-border-subtle)] p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative w-full sm:max-w-xl sm:flex-1">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    size={13}
                  />
                  <input
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setListPage(1);
                      setSelectedIssueIds([]);
                    }}
                    aria-label={d.search}
                    placeholder={d.search}
                    className="h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-white pl-8 pr-2.5 text-base outline-none focus:border-[var(--color-brand-primary)] sm:h-9 sm:text-xs"
                  />
                </div>
                {view === "ACTION_REQUIRED" && canRetryIssue && (
                  <button
                    type="button"
                    disabled={
                      !retry.candidates.length || retry.submitting || syncing
                    }
                    onClick={() => retry.open()}
                    className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-md)] border border-sky-200 bg-sky-50 px-3 text-xs font-bold text-sky-800 hover:bg-sky-100 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500 sm:min-h-9"
                  >
                    <RefreshCw size={14} aria-hidden="true" />
                    {lang === "vi" ? "Gửi lại tất cả" : "全部重发"}
                    <span className="rounded-full bg-white px-1.5 py-0.5 tabular-nums">
                      {retry.candidates.length}
                    </span>
                  </button>
                )}
              </div>
              {view === "ACTION_REQUIRED" && (
                <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {(
                    [
                      ["ALL", lang === "vi" ? "Tất cả" : "All"],
                      [
                        "MISSING_INFORMATION",
                        lang === "vi"
                          ? "Thiếu thông tin"
                          : "Missing information",
                      ],
                      [
                        "FINANCIAL_MISMATCH",
                        lang === "vi" ? "Sai tiền hoặc thuế" : "Amount or tax",
                      ],
                      [
                        "WAITING_MISA",
                        lang === "vi" ? "Chờ MISA" : "Waiting for MISA",
                      ],
                      [
                        "MISA_REJECTED",
                        lang === "vi" ? "MISA từ chối" : "MISA rejected",
                      ],
                      [
                        "MANUAL_REVIEW",
                        lang === "vi" ? "Kiểm tra thủ công" : "Manual review",
                      ],
                    ] as Array<[InvoiceAttentionFilter, string]>
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setAttentionFilter(value);
                        setListPage(1);
                      }}
                      className={`h-8 shrink-0 rounded-full border px-3 text-xs font-semibold transition ${attentionFilter === value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {loading ? (
              <div
                className="p-3 space-y-2 animate-pulse"
                aria-label={d.loading}
              >
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="flex h-12 items-center gap-4 rounded-xl bg-slate-100/70 px-4 border border-slate-200/50"
                  >
                    <div className="h-4 w-32 rounded bg-slate-200" />
                    <div className="h-4 w-24 rounded bg-slate-200" />
                    <div className="h-4 w-16 rounded bg-slate-200" />
                    <div className="ml-auto h-6 w-20 rounded-full bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
                <ReceiptText size={30} className="mb-2.5 text-slate-300" />
                <p className="text-xs font-semibold text-[var(--color-text-primary)]">
                  {d.empty}
                </p>
                <p className="mt-0.5 text-xxs text-[var(--color-text-muted)]">
                  {d.emptyHint}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 p-3">
                {canBulkIssue && view === "READY" && (
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/80 px-3.5 py-2 text-xs font-semibold text-slate-700">
                    <label className="flex min-h-9 items-center gap-2 sm:min-h-0">
                      <input
                        type="checkbox"
                        checked={allPageOrdersSelected}
                        onChange={() => {
                          setSelectedIssueIds((current) =>
                            allPageOrdersSelected
                              ? current.filter(
                                  (id) => !selectableIssueIds.includes(id),
                                )
                              : [
                                  ...new Set([
                                    ...current,
                                    ...selectableIssueIds,
                                  ]),
                                ],
                          );
                        }}
                        disabled={selectableIssueIds.length === 0}
                        className="h-4 w-4 rounded accent-sky-700 cursor-pointer"
                      />
                      <span>
                        {lang === "vi"
                          ? "Chọn các đơn cùng ngày trên trang"
                          : "选择本页同日订单"}
                      </span>
                    </label>
                    <span className="text-slate-500 font-medium">
                      {selectedEligibleIds.length}{" "}
                      {lang === "vi" ? "đã chọn" : "已选择"}
                    </span>
                  </div>
                )}

                <div
                  aria-hidden="true"
                  className="hidden grid-cols-[minmax(0,1fr)_7rem_9rem_7rem] gap-3 px-3 text-[11px] font-semibold text-slate-600 lg:grid"
                >
                  <span>{d.order}</span>
                  <span className="text-right">{d.totalMoney}</span>
                  <span>{lang === "vi" ? "Trạng thái" : "状态"}</span>
                  <span className="text-center">
                    {lang === "vi" ? "Thao tác" : "操作"}
                  </span>
                </div>
                {visibleOrders.map((order) => {
                  const status = invoiceBusinessStatus(order);
                  const documentId = order.invoice_document_id;
                  const canRetryOrder = Boolean(
                    documentId && retryableIds.has(documentId),
                  );
                  const needsInfo =
                    status === "REVIEW_REQUIRED" &&
                    orderMatchesAttentionFilter(order, "MISSING_INFORMATION");
                  const pendingConfirmation =
                    order.invoice_document_status ===
                    InvoiceDocumentStatus.PENDING_CONFIRMATION;
                  const statusLabel = pendingConfirmation
                    ? lang === "vi"
                      ? "Đang xác minh"
                      : "正在核验"
                    : needsInfo
                      ? lang === "vi"
                        ? "Thiếu thông tin"
                        : "缺少信息"
                      : businessStatusCopy[lang][status];
                  const actionLabel = canRetryOrder
                    ? lang === "vi"
                      ? "Gửi lại"
                      : "重发"
                    : needsInfo && canPrepare
                      ? lang === "vi"
                        ? "Sửa thông tin"
                        : "修改信息"
                      : lang === "vi"
                        ? "Xem chi tiết"
                        : "查看详情";
                  const orderNumber =
                    order.order_number ?? order.source_order_id;
                  const selected = selectedEligibleIds.includes(order.id);
                  const payment =
                    order.mapped_payment_method ?? order.payment_method;
                  return (
                    <article
                      key={order.id}
                      className={`grid min-w-0 gap-x-3 gap-y-1 rounded-xl border bg-white px-2.5 py-2 lg:grid-cols-[minmax(0,1fr)_7rem_9rem_7rem] lg:items-center lg:px-3 ${selected ? "border-sky-400 bg-sky-50/30" : "border-slate-200"}`}
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        {canBulkIssue && status === "READY" && (
                          <label className="grid min-h-11 w-8 shrink-0 place-items-center sm:min-h-8">
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={
                                selectedIssueDates.length > 0 &&
                                order.business_date !== issueBusinessDate
                              }
                              onChange={() => toggleIssueId(order.id)}
                              aria-label={`${lang === "vi" ? "Chọn đơn" : "选择订单"} ${orderNumber}`}
                              className="size-4 accent-sky-700"
                            />
                          </label>
                        )}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            <button
                              type="button"
                              onClick={() => setSelectedOrder(order)}
                              className="max-w-full wrap-anywhere text-left text-sm font-bold text-slate-900 hover:text-sky-700 hover:underline"
                            >
                              {orderNumber}
                            </button>
                            {payment && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                                {payment}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-1.5 text-xs text-slate-600">
                            <span title={order.customer_name || undefined}>
                              {shortName(order.customer_name) ||
                                (lang === "vi" ? "Khách lẻ" : "零售客户")}
                            </span>
                            <span>· {order.business_date}</span>
                          </div>
                        </div>
                      </div>
                      <div className="grid min-w-0 grid-cols-[minmax(65px,auto)_minmax(0,1fr)_minmax(74px,5.25rem)] items-center gap-1.5 border-t border-slate-100 pt-1 lg:contents">
                        <strong className="whitespace-nowrap text-xs font-bold tabular-nums text-sky-700 lg:text-right lg:text-sm">
                          <span className="sr-only">{d.totalMoney} </span>
                          {money.format(order.real_money ?? 0)}
                        </strong>
                        <div className="min-w-0 text-center lg:text-left">
                          <span
                            className={`inline-block rounded-full border px-1.5 py-0.5 text-[11px] font-semibold leading-tight lg:px-2 ${businessStatusStyle[status]}`}
                          >
                            {statusLabel}
                          </span>
                        </div>
                        <button
                          type="button"
                          aria-label={`${actionLabel} ${orderNumber}`}
                          onClick={() => {
                            if (canRetryOrder && documentId)
                              retry.open(documentId);
                            else setSelectedOrder(order);
                          }}
                          disabled={
                            canRetryOrder && (retry.submitting || syncing)
                          }
                          className="min-h-11 w-full rounded-lg border border-slate-200 px-1 py-1 text-xs font-semibold text-sky-800 hover:border-sky-200 hover:bg-sky-50 disabled:opacity-40 lg:min-h-8 lg:px-2"
                        >
                          {actionLabel}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            {!loading && (
              <InvoicePagination
                page={page}
                total={filteredOrders.length}
                lang={lang}
                onPageChange={setListPage}
              />
            )}
          </section>

          {view === "ACTION_REQUIRED" &&
            selectedDates.map((date) => (
              <InvoiceLedgerPanel
                key={`exceptions-${date}`}
                warehouseId={activeStoreId}
                businessDate={date}
                mode="EXCEPTIONS"
                refreshToken={String(ledgerRefresh)}
                canDownload={hasPermission("invoices.download", activeStoreId)}
                canResolve={canReconcile}
              />
            ))}

          {selectedOrder && (
            <OrderReviewSheet
              order={selectedOrder}
              lang={lang}
              labels={d}
              canPrepare={hasPermission(
                "invoices.prepare",
                selectedOrder.warehouse_id,
              )}
              onChanged={loadOrders}
              onClose={() => setSelectedOrder(null)}
            />
          )}
        </>
      ) : (
        <div className="grid gap-3">
          <section
            className="grid grid-cols-1 gap-2 sm:grid-cols-3"
            aria-label={
              lang === "vi"
                ? "Thống kê hóa đơn đã phát hành"
                : "Issued invoice statistics"
            }
          >
            <StatCard
              label={
                lang === "vi"
                  ? "Hóa đơn phát hành từ MISA"
                  : "Invoices issued by MISA"
              }
              value={issuedStatistics.misaIssuedCount}
              icon={<FileCheck2 size={17} />}
              loading={issuedStatistics.loading}
            />
            <StatCard
              label={lang === "vi" ? "Đơn hàng đã khớp" : "Matched orders"}
              value={issuedStatistics.matchedOrderCount}
              icon={<Link2 size={17} />}
              tone="success"
              loading={issuedStatistics.loading}
            />
            <StatCard
              label={
                lang === "vi"
                  ? "Doanh thu hóa đơn đã khớp"
                  : "Matched invoice revenue"
              }
              value={money.format(issuedStatistics.matchedRevenue)}
              icon={<CircleDollarSign size={17} />}
              loading={issuedStatistics.loading}
            />
          </section>

          <label className="relative block rounded-xl border border-slate-200 bg-white p-2.5">
            <Search
              size={15}
              aria-hidden="true"
              className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <span className="sr-only">
              {lang === "vi" ? "Tìm hóa đơn đã phát hành" : "搜索已开票记录"}
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                lang === "vi"
                  ? "Tìm mã đơn, số hóa đơn hoặc khách hàng"
                  : "搜索订单号、发票号或客户"
              }
              className="h-11 w-full max-w-xl rounded-[var(--radius-md)] border border-slate-200 pl-8 pr-2.5 text-base sm:h-9 sm:text-xs"
            />
          </label>
          {selectedDates.map((date) => (
            <InvoiceLedgerPanel
              key={`issued-${activeStoreId}-${date}`}
              warehouseId={activeStoreId}
              businessDate={date}
              mode="ISSUED"
              search={query}
              refreshToken={String(ledgerRefresh)}
              canDownload={hasPermission("invoices.download", activeStoreId)}
              canResolve={canReconcile}
              onIssuedStatisticsLoaded={handleIssuedStatisticsLoaded}
            />
          ))}
        </div>
      )}

      {configurationOpen && (
        <ConfigurationDialog
          warehouseId={activeStoreId}
          canConfigure={canConfigure}
          lang={lang}
          onClose={() => setConfigurationOpen(false)}
        />
      )}
      {retry.count > 0 && (
        <ActionOtpModal
          mobileSheet
          title={lang === "vi" ? "Xác nhận gửi lại hóa đơn" : "确认重发发票"}
          description={
            lang === "vi"
              ? `${retry.count} đơn lỗi trong cửa hàng và khoảng ngày đang chọn. Hệ thống sẽ xác minh với MISA trước khi gửi lại.`
              : `${retry.count} 笔错误订单。系统将在重发前向 MISA 核验。`
          }
          isSubmitting={retry.submitting}
          onConfirm={(otp) => void retry.confirm(otp)}
          onCancel={retry.cancel}
        />
      )}
    </div>
  );
}

function ConfigurationDialog({
  warehouseId,
  canConfigure,
  lang,
  onClose,
}: {
  warehouseId: string;
  canConfigure: boolean;
  lang: "vi" | "zh";
  onClose: () => void;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-end justify-center bg-slate-950/45 backdrop-blur-xs sm:items-center sm:p-4">
      <section
        className="flex h-[96dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-slate-50 shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-configuration-title"
      >
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <div>
            <p className="text-micro font-bold uppercase tracking-wider text-sky-700">
              MISA meInvoice
            </p>
            <h2
              id="invoice-configuration-title"
              className="text-base font-bold text-slate-950"
            >
              {lang === "vi"
                ? "Cấu hình hóa đơn cửa hàng"
                : "Store invoice configuration"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            aria-label={lang === "vi" ? "Đóng cấu hình" : "Close configuration"}
          >
            <X size={19} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:p-4">
          <InvoiceConfigurationPanel
            warehouseId={warehouseId}
            canConfigure={canConfigure}
            lang={lang}
          />
        </div>
      </section>
    </div>,
    document.body,
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function OrderReviewSheet({
  order,
  lang,
  labels,
  canPrepare,
  onChanged,
  onClose,
}: {
  order: InvoiceSourceOrderView;
  lang: "vi" | "zh";
  labels: typeof copy.vi | typeof copy.zh;
  canPrepare: boolean;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 1024px)").matches
      : false,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const handleChange = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches);
    };

    setIsDesktop(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!isDesktop) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDesktop, onClose]);

  const content = (
    <div className="pt-2">
      <p className="text-xxs font-semibold uppercase tracking-wider text-slate-400">
        {labels.detail} · {order.payment_time ?? "—"}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <MoneyCell
          label={labels.beforeTax}
          value={
            order.calculation?.total_amount_without_vat ??
            order.amount_before_tax ??
            0
          }
        />
        <MoneyCell
          label={labels.vat}
          value={order.calculation?.total_vat_amount ?? order.tax_money ?? 0}
        />
        <MoneyCell
          label={labels.totalMoney}
          value={order.calculation?.total_amount ?? order.real_money ?? 0}
          strong
        />
      </div>

      <section className="mt-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            {labels.issues}
          </h3>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xxs font-semibold ${statusStyle(order.preflight.status)}`}
          >
            {statusLabel(order.preflight.status, lang)}
          </span>
        </div>
        {order.preflight.issues.length === 0 ? (
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/80 p-3 text-xs font-medium text-emerald-800">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />{" "}
            {labels.noIssues}
          </div>
        ) : (
          <div className="mt-2 grid gap-2">
            {order.preflight.issues.map((item, index) => (
              <div
                key={`${item.code}-${index}`}
                className="rounded-xl border border-amber-200/80 bg-amber-50/80 p-3"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                  <AlertTriangle size={14} className="shrink-0" /> {item.code}
                </div>
                <p className="mt-1 text-xs text-amber-900 leading-snug">
                  {item.message}
                </p>
                <p className="mt-1 font-mono text-[10px] text-amber-700 break-all">
                  {item.path}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          {labels.sourceItems} ({order.normalized_items.length})
        </h3>
        <div className="mt-2 grid gap-2">
          {(order.calculation?.lines ?? order.normalized_items).map(
            (item, index) => (
              <div
                key={`${item.line_number}-${index}`}
                className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs max-w-full"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-900">
                      {item.item_name ?? "—"}
                    </p>
                    <p className="mt-0.5 font-mono text-xxs text-slate-400">
                      {item.item_code ?? item.source_item_id ?? "—"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xxs font-bold text-slate-700">
                    {item.vat_rate_name ?? "VAT ?"}
                  </span>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-slate-600 border-t border-slate-100 pt-2">
                  <span className="font-medium text-slate-500">
                    {item.quantity ?? 0} {item.unit_name ?? "—"} ×{" "}
                    {money.format(item.unit_price ?? 0)}
                  </span>
                  {"total_amount" in item &&
                    typeof item.total_amount === "number" && (
                      <span className="font-bold text-slate-900 tabular-nums">
                        {money.format(item.total_amount)}
                      </span>
                    )}
                </div>
              </div>
            ),
          )}
        </div>
      </section>

      <div className="mt-5 border-t border-slate-200/80 pt-4">
        <InvoiceDraftWorkflow
          order={order}
          lang={lang}
          canPrepare={canPrepare}
          onChanged={onChanged}
        />
      </div>
    </div>
  );

  if (!isDesktop) {
    return (
      <BottomSheet
        isOpen={Boolean(order)}
        onClose={onClose}
        title={order.order_number ?? order.source_order_id}
        defaultSnap="full"
        mobileBreakpoint="lg"
        contentClassName="flex-1 overflow-y-auto px-4 pb-8 space-y-5"
      >
        {content}
      </BottomSheet>
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invoice-order-detail-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-micro font-bold uppercase tracking-wider text-sky-700">
              {labels.detail}
            </p>
            <h2
              id="invoice-order-detail-title"
              className="mt-0.5 truncate text-base font-bold text-slate-950"
            >
              {order.order_number ?? order.source_order_id}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {order.payment_time ?? "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label={labels.close}
          >
            <X size={19} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8">
          {content}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StatCard({
  label,
  value,
  icon,
  tone = "default",
  loading = false,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
  loading?: boolean;
}) {
  const tones = {
    default: "bg-slate-100 text-slate-700",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-rose-100 text-rose-700",
  };
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] p-3">
      <span
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        {loading ? (
          <div className="h-7 w-20 animate-pulse rounded bg-slate-200" />
        ) : (
          <p className="truncate text-xl font-bold tabular-nums text-slate-900">
            {value}
          </p>
        )}
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function MoneyCell({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-3 ${strong ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"}`}
    >
      <p
        className={`text-[11px] ${strong ? "text-slate-300" : "text-slate-500"}`}
      >
        {label}
      </p>
      <p className="mt-1 text-sm font-bold tabular-nums sm:text-base">
        {money.format(value)}
      </p>
    </div>
  );
}

function ErrorNotificationCard({
  error,
  loading,
  onRetry,
  onDismiss,
  d,
}: {
  error: string;
  loading: boolean;
  onRetry: () => void;
  onDismiss?: () => void;
  d: (typeof copy)["vi"] | (typeof copy)["zh"];
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-rose-200/80 bg-gradient-to-r from-rose-50/95 via-rose-50/50 to-white p-3.5 shadow-xs transition-all">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-rose-200/60 bg-rose-100 text-rose-600 shadow-2xs">
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-rose-950">
                {d.errorTitle}
              </h4>
              <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800">
                Error
              </span>
            </div>
            <p className="mt-0.5 text-xs text-rose-700 leading-relaxed">
              {error}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            type="button"
            onClick={onRetry}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-300/80 bg-white px-3 text-xs font-semibold text-rose-900 shadow-2xs transition hover:bg-rose-100/60 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw
              size={13}
              className={
                loading ? "animate-spin text-rose-600" : "text-rose-600"
              }
            />
            <span>{d.retry}</span>
          </button>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="flex size-8 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-100/80 hover:text-rose-800 transition active:scale-95 cursor-pointer"
              title={d.dismiss}
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SyncResultCard({
  syncResult,
  onDismiss,
  d,
}: {
  syncResult: InvoiceSyncResult;
  onDismiss?: () => void;
  d: (typeof copy)["vi"] | (typeof copy)["zh"];
}) {
  const reco = syncResult.reconciliation?.summary;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-200/90 bg-gradient-to-b from-emerald-50/80 via-white to-slate-50/30 p-3.5 shadow-xs space-y-3.5">
      {/* Ambient subtle top line accent */}

      {/* Header: Title, Order counter badge, Dismiss */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-2xs">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-slate-900">{d.syncDone}</h4>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold tabular-nums text-emerald-800">
                {syncResult.order_count} {d.order}
              </span>
            </div>
            <p className="text-xs text-slate-500">{d.syncDescription}</p>
          </div>
        </div>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition active:scale-95 cursor-pointer"
            title={d.dismiss}
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* JPOS sync counters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200/80 bg-emerald-50/60 px-2.5 py-1 text-xs shadow-2xs">
          <span className="size-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-medium text-emerald-900">
            {d.inserted}:
          </span>
          <span className="text-sm font-bold tabular-nums text-emerald-950">
            {syncResult.inserted_count}
          </span>
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-sky-200/80 bg-sky-50/60 px-2.5 py-1 text-xs shadow-2xs">
          <span className="size-2 rounded-full bg-sky-500" />
          <span className="text-xs font-medium text-sky-900">{d.updated}:</span>
          <span className="text-sm font-bold tabular-nums text-sky-950">
            {syncResult.updated_count}
          </span>
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100/70 px-2.5 py-1 text-xs shadow-2xs">
          <span className="size-2 rounded-full bg-slate-400" />
          <span className="text-xs font-medium text-slate-700">
            {d.unchanged}:
          </span>
          <span className="text-sm font-bold tabular-nums text-slate-900">
            {syncResult.unchanged_count}
          </span>
        </div>
      </div>

      {/* MISA Reconciliation Dashboard Matrix */}
      {reco && (
        <div className="rounded-xl border border-slate-200/80 bg-white/90 p-2.5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xxs font-bold uppercase tracking-wider text-slate-600">
              {d.syncDetailsTitle}
            </span>
            <span className="text-xxs font-semibold text-emerald-700">
              MISA meInvoice
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <ReconciliationTile
              label={d.matchedMisa}
              value={reco.matched_count}
              tone="emerald"
            />
            <ReconciliationTile
              label={d.misaReturned}
              value={reco.misa_invoice_count}
              tone="sky"
            />
            <ReconciliationTile
              label={d.notIssued}
              value={reco.source_not_in_misa_count}
              tone="slate"
            />
            <ReconciliationTile
              label={d.mismatches}
              value={reco.mismatch_count + reco.misa_not_in_source_count}
              tone="rose"
            />
            <ReconciliationTile
              label={d.unlinked}
              value={reco.unscoped_misa_count}
              tone="amber"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ReconciliationTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "sky" | "slate" | "rose" | "amber";
}) {
  const toneStyles = {
    emerald: {
      border: "border-emerald-200/80 hover:border-emerald-300",
      bg: "bg-emerald-50/40",
      text: "text-emerald-950",
      num: "text-emerald-700",
      indicator: "bg-emerald-500",
    },
    sky: {
      border: "border-sky-200/80 hover:border-sky-300",
      bg: "bg-sky-50/40",
      text: "text-sky-950",
      num: "text-sky-700",
      indicator: "bg-sky-500",
    },
    slate: {
      border: "border-slate-200/80 hover:border-slate-300",
      bg: "bg-slate-50/60",
      text: "text-slate-800",
      num: "text-slate-700",
      indicator: "bg-slate-400",
    },
    rose: {
      border: "border-rose-200/80 hover:border-rose-300",
      bg: "bg-rose-50/50",
      text: "text-rose-950",
      num: "text-rose-700",
      indicator: "bg-rose-500",
    },
    amber: {
      border: "border-amber-200/80 hover:border-amber-300",
      bg: "bg-amber-50/50",
      text: "text-amber-950",
      num: "text-amber-700",
      indicator: "bg-amber-500",
    },
  };

  const style = toneStyles[tone];

  return (
    <div
      className={`flex flex-col justify-between rounded-lg border p-2 transition-all shadow-2xs ${style.border} ${style.bg}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-xxs font-semibold text-slate-600">
          {label}
        </span>
        <span className={`size-1.5 rounded-full shrink-0 ${style.indicator}`} />
      </div>
      <p className={`mt-1.5 text-base font-bold tabular-nums ${style.num}`}>
        {value}
      </p>
    </div>
  );
}
