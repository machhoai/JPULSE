import {
  heading,
  eyebrow,
  lede,
  primaryButton,
  secondaryButton,
  textButton,
  panel,
  panelHeading,
  sectionHeading,
  featureIcon,
  form,
  field,
  label,
  fieldControl,
  message,
  errorMessage,
  demoOptions,
  demoSummary,
} from "./uiClasses";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ChevronDown,
  CreditCard,
  ScanLine,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  demoCardExamples,
  linkDemoCard,
  normalizeCardCode,
  type DemoCard,
} from "./demo";
import { captureZaloCard, isZaloTesting } from "./zaloTesting";

export function LinkCardScreen({
  onBack,
  onLink,
}: {
  onBack: () => void;
  onLink: (card: DemoCard) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [scanning, setScanning] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const activeScan = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      activeScan.current?.abort();
      activeScan.current = null;
    },
    [],
  );

  async function readPhoto(source: File | "camera") {
    if (activeScan.current) return;
    if (
      source !== "camera" &&
      (!source.type.startsWith("image/") || source.size > 15 * 1024 * 1024)
    ) {
      setScanMessage("Chọn tệp ảnh có dung lượng tối đa 15 MB.");
      return;
    }
    const controller = new AbortController();
    activeScan.current = controller;
    setScanning(true);
    let timeout: number | undefined;
    try {
      const photo = source === "camera" ? await captureZaloCard() : source;
      if (!photo || activeScan.current !== controller) return;
      setScanMessage("Đang đọc mã trên ảnh…");
      timeout = window.setTimeout(() => controller.abort(), 20_000);
      const { scanCardCode, scanImageCode } = await import("./ocr");
      const result =
        photo instanceof File
          ? await scanCardCode(photo, controller.signal)
          : await scanImageCode(photo, controller.signal);
      if (activeScan.current !== controller) return;
      if (result) {
        setCode(result);
        setError("");
        setScanMessage("Đã đọc mã. Hãy đối chiếu với thẻ trước khi liên kết.");
        input.current?.focus();
      } else {
        setScanMessage(
          "Chưa đọc được mã. Hãy chọn ảnh rõ hơn hoặc nhập mã thủ công.",
        );
      }
    } catch {
      if (activeScan.current === controller) {
        setScanMessage(
          "Chưa xử lý được ảnh. Hãy chọn lại ảnh hoặc nhập mã thủ công.",
        );
      }
    } finally {
      window.clearTimeout(timeout);
      if (activeScan.current === controller) {
        activeScan.current = null;
        setScanning(false);
      }
    }
  }

  function editCode(value: string) {
    if (activeScan.current) {
      activeScan.current.abort();
      activeScan.current = null;
      setScanning(false);
    }
    setCode(value);
    setError("");
    setScanMessage("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = normalizeCardCode(code);
    const result = linkDemoCard(normalizedCode);
    editCode(normalizedCode);
    if ("error" in result) {
      setError(result.error);
      input.current?.focus();
      return;
    }
    onLink(result.card);
  }

  return (
    <>
      <section>
        <button
          type="button"
          className={`${textButton} -ml-2 mb-5 max-[701px]:mb-3`}
          onClick={onBack}
        >
          <ArrowLeft size={18} aria-hidden="true" /> Quay lại
        </button>
        <p className={`${eyebrow} [display:flex]`}>
          <CreditCard size={16} aria-hidden="true" /> Thẻ thành viên
        </p>
        <h1 className={heading}>
          Liên kết
          <br />
          <span className="text-brand">thẻ của bạn</span>
        </h1>
        <p className={lede}>
          Chụp rõ dòng chữ và số in ở mép dưới thẻ. Bạn có thể kiểm tra và sửa
          mã trước khi xác nhận.
        </p>
      </section>
      <section className={panel} aria-labelledby="link-heading">
        <div className={panelHeading}>
          <h2 className={sectionHeading} id="link-heading">
            Mã in trên thẻ
          </h2>
          <span className={featureIcon}>
            <ScanLine size={22} aria-hidden="true" />
          </span>
        </div>
        <input
          ref={picker}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void readPhoto(file);
          }}
        />
        <button
          type="button"
          className={`${secondaryButton} w-full`}
          onClick={() => {
            if (isZaloTesting) void readPhoto("camera");
            else picker.current?.click();
          }}
          disabled={scanning}
        >
          <Camera size={20} aria-hidden="true" />
          {scanning
            ? "Đang xử lý ảnh…"
            : isZaloTesting
              ? "Chụp thẻ"
              : "Chọn ảnh thẻ"}
        </button>
        {scanMessage && (
          <p className={`${message} mt-2`} role="status">
            {scanMessage}
          </p>
        )}
        <form className={`${form} mt-[18px]`} onSubmit={submit} noValidate>
          <div className={field}>
            <label className={label} htmlFor="card-code">
              Nhập hoặc kiểm tra mã thẻ
            </label>
            <input
              className={fieldControl}
              ref={input}
              id="card-code"
              value={code}
              onChange={(event) => editCode(event.target.value)}
              placeholder="Ví dụ BD01PAYDUCK000123"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={64}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "card-error" : undefined}
            />
            {error && (
              <p className={errorMessage} id="card-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <button type="submit" className={primaryButton}>
            Liên kết thẻ <ArrowRight size={19} aria-hidden="true" />
          </button>
        </form>
        <details className={`${demoOptions} mt-3`}>
          <summary className={demoSummary}>
            Mã thẻ dùng thử <ChevronDown size={17} aria-hidden="true" />
          </summary>
          <ul className="m-0 list-none p-0">
            {demoCardExamples.map(([value, label]) => (
              <li key={value}>
                <button
                  type="button"
                  className="flex min-h-11 w-full cursor-pointer flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line bg-transparent px-1 py-1.5 text-left hover:bg-lavender focus-visible:outline-[3px] focus-visible:outline-[#7a37b9] [&>code]:text-[0.77rem] [&>code]:wrap-anywhere"
                  onClick={() => {
                    editCode(value);
                    input.current?.focus();
                  }}
                >
                  <span>{label}</span>
                  <code>{value}</code>
                </button>
              </li>
            ))}
          </ul>
        </details>
      </section>
    </>
  );
}
