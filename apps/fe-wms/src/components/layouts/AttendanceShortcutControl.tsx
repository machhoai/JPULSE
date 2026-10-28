"use client";

import { Download, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useTranslation } from "@/lib/i18n";
import { useUserStore } from "@/stores/useUserStore";
import { authenticatedFetch } from "@/utils/authenticatedFetch";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://api.wms.localhost";
interface Connection {
  connected: boolean;
  expires_at: number | null;
  install_url: string | null;
  shortcut_name: string;
}
interface Pairing {
  code: string;
  expires_at: number;
}

async function shortcutApi<T>(path: string, method = "GET"): Promise<T> {
  const response = await authenticatedFetch(
    `${API_BASE}/api/attendance/shortcut/${path}`,
    { method },
  );
  const body = await response.json();
  if (!response.ok || !body.success)
    throw new Error(body.messages?.vi || "Không thể kết nối Shortcut.");
  return body.data as T;
}

export function AttendanceShortcutControl() {
  const { lang } = useTranslation();
  const userId = useUserStore((state) => state.user?.id);
  const dialog = useRef<HTMLDialogElement>(null);
  const requestVersion = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [now, setNow] = useState(0);
  const chinese = lang === "zh";

  useEffect(() => {
    requestVersion.current += 1;
    dialog.current?.close();
    setPairing(null);
    setConnection(null);
    setError("");
    setBusy(false);
    return () => {
      requestVersion.current += 1;
    };
  }, [userId]);

  useEffect(() => {
    if (!pairing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pairing]);

  async function prepare() {
    if (busy || !userId) return;
    const version = ++requestVersion.current;
    dialog.current?.showModal();
    setError("");
    setPairing(null);
    const isAppleMobile =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setUnsupported(!isAppleMobile);
    if (!isAppleMobile) return;
    setBusy(true);
    try {
      const status = await shortcutApi<Connection>("connection");
      if (version !== requestVersion.current) return;
      setConnection(status);
      if (!status.install_url)
        throw new Error(
          "Shortcut mẫu chưa được cấu hình. Vui lòng liên hệ quản trị viên.",
        );
      const nextPairing = await shortcutApi<Pairing>("pairing", "POST");
      if (version !== requestVersion.current) return;
      setPairing(nextPairing);
      setNow(Date.now());
      // The backend records pairing, not actual installation. Keep a reinstall link
      // available when the user has removed/renamed the shortcut or changed phones.
      window.location.href = status.connected
        ? runUrl(status, nextPairing)
        : status.install_url;
    } catch (cause) {
      if (version === requestVersion.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Không thể kết nối Shortcut.",
        );
    } finally {
      if (version === requestVersion.current) setBusy(false);
    }
  }

  function runUrl(status: Connection, code: Pairing) {
    const payload = JSON.stringify({
      version: 1,
      mode: "connect",
      code: code.code,
      api_base: API_BASE,
    });
    return `shortcuts://run-shortcut?name=${encodeURIComponent(status.shortcut_name)}&input=text&text=${encodeURIComponent(payload)}`;
  }

  const expired = pairing && now >= pairing.expires_at;
  const actionClass =
    "inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--color-brand-primary)] px-4 py-2 text-sm font-semibold text-white";

  return (
    <>
      <button
        type="button"
        onClick={() => void prepare()}
        disabled={busy}
        title={
          chinese
            ? "安装或更新考勤快捷指令"
            : "Cài hoặc cập nhật Shortcut chấm công"
        }
        aria-label={
          chinese
            ? "安装或更新考勤快捷指令"
            : "Cài hoặc cập nhật Shortcut chấm công"
        }
        className="relative z-50 flex h-8 items-center gap-1 rounded-full bg-white px-3 text-xs font-semibold text-[var(--color-brand-primary)] shadow-sm disabled:opacity-50 md:hidden"
      >
        {busy ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <Download size={15} />
        )}
        Shortcut
      </button>
      <dialog
        ref={dialog}
        onClose={() => {
          requestVersion.current += 1;
          setBusy(false);
          setPairing(null);
        }}
        aria-labelledby="attendance-shortcut-title"
        className="m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-3xl border-0 bg-white p-6 text-[var(--color-text-primary)] shadow-xl backdrop:bg-black/40"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="attendance-shortcut-title" className="text-lg font-bold">
            {chinese ? "考勤快捷指令" : "Shortcut chấm công"}
          </h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label={chinese ? "关闭" : "Đóng"}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>
        {unsupported ? (
          <p className="text-sm leading-6">
            {chinese
              ? "请使用 iPhone 或 iPad 安装 Apple 快捷指令。"
              : "Hãy mở trang này trên iPhone hoặc iPad để cài Apple Shortcuts."}
          </p>
        ) : (
          <div className="flex flex-col gap-4 text-sm leading-6">
            {busy && (
              <p role="status">
                {chinese ? "正在准备连接…" : "Đang chuẩn bị kết nối…"}
              </p>
            )}
            {error && (
              <p role="alert" className="text-red-600">
                {error}
              </p>
            )}
            {connection?.install_url && (
              <>
                <p>
                  {chinese
                    ? `首次使用：添加“${connection.shortcut_name}”，然后返回此处点击连接。已安装：点击更新连接，无需重装。`
                    : `Lần đầu: thêm “${connection.shortcut_name}”, sau đó quay lại đây bấm Kết nối. Đã cài: bấm Cập nhật kết nối, không cần cài lại.`}
                </p>
                <a
                  href={connection.install_url}
                  className="font-semibold text-[var(--color-brand-primary)] underline"
                >
                  {chinese
                    ? "安装 / 重新安装快捷指令"
                    : "Cài / Cài lại Shortcut"}
                </a>
                {pairing && !expired && (
                  <a href={runUrl(connection, pairing)} className={actionClass}>
                    {connection.connected
                      ? chinese
                        ? "更新连接"
                        : "Cập nhật kết nối"
                      : chinese
                        ? "连接快捷指令"
                        : "Kết nối Shortcut"}
                  </a>
                )}
                {expired && (
                  <p role="status" className="text-amber-700">
                    {chinese
                      ? "连接码已过期，请重新生成。"
                      : "Mã kết nối đã hết hạn. Bấm Tạo lại kết nối để tiếp tục."}
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  {chinese
                    ? "连接码有效期 5 分钟；会话有效期 90 天。每个账户保留一个有效连接，新连接将替换旧连接。"
                    : "Mã kết nối có hạn 5 phút; phiên Shortcut có hạn 90 ngày. Mỗi tài khoản có một kết nối; kết nối mới thay thế kết nối cũ."}
                </p>
                {connection.connected && (
                  <button
                    type="button"
                    disabled={busy}
                    className="text-left text-red-600 underline"
                    onClick={async () => {
                      const version = ++requestVersion.current;
                      setBusy(true);
                      setError("");
                      try {
                        await shortcutApi("connection", "DELETE");
                        if (version !== requestVersion.current) return;
                        setConnection({
                          ...connection,
                          connected: false,
                          expires_at: null,
                        });
                        setPairing(null);
                      } catch (cause) {
                        if (version === requestVersion.current) {
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : "Không thể thu hồi kết nối.",
                          );
                        }
                      } finally {
                        if (version === requestVersion.current) setBusy(false);
                      }
                    }}
                  >
                    {chinese ? "撤销连接" : "Thu hồi kết nối Shortcut"}
                  </button>
                )}
              </>
            )}
            {(!pairing || expired || error) && !busy && (
              <button
                type="button"
                className={actionClass}
                onClick={() => void prepare()}
              >
                {chinese ? "重新连接" : "Tạo lại kết nối"}
              </button>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
