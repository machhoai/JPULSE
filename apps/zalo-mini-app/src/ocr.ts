import { createWorker, OEM, PSM, type Worker as OcrWorker } from "tesseract.js";
import workerUrl from "tesseract.js/dist/worker.min.js?url";
import packagedWorkerUrl from "./ocr-worker.js?url&no-inline";
import coreUrl from "tesseract.js-core/tesseract-core-lstm.js?url";
import wasmUrl from "tesseract.js-core/tesseract-core-lstm.wasm?url";

function extractCode(text: string) {
  const candidates = text.toUpperCase().match(/[A-Z0-9]{6,40}/g) ?? [];
  return (
    candidates.find((value) => /[A-Z]/.test(value) && /\d{3,}$/.test(value)) ??
    candidates.find((value) => /^\d{8,}$/.test(value)) ??
    null
  );
}

async function loadImage(file: Blob) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Region = readonly [
  left: number,
  top: number,
  right: number,
  bottom: number,
];

function makeScanRegion(
  image: HTMLImageElement,
  [left, top, right, bottom]: Region,
  isolateInk: boolean,
) {
  const canvas = document.createElement("canvas");
  const width = Math.round(image.naturalWidth * (right - left));
  const height = Math.round(image.naturalHeight * (bottom - top));
  const scale = Math.min(1, 1800 / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    image,
    image.naturalWidth * left,
    image.naturalHeight * top,
    width,
    height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  if (isolateInk) {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const value =
        Math.max(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]) < 100
          ? 0
          : 255;
      pixels.data[i] = value;
      pixels.data[i + 1] = value;
      pixels.data[i + 2] = value;
    }
    context.putImageData(pixels, 0, 0);
  }
  return canvas;
}

export async function scanCardCode(file: File, signal: AbortSignal) {
  const image = await loadImage(file);
  return scanImageCode(image, signal);
}

export async function scanImageCode(
  image: HTMLImageElement,
  signal: AbortSignal,
) {
  signal.throwIfAborted();

  let worker: OcrWorker | undefined;
  let stop: (() => void) | undefined;
  try {
    const recognize = async () => {
      // Emscripten resolves the binary relative to the worker script.
      const core = new URL(coreUrl, window.location.href);
      const workerScript = new URL(
        import.meta.env.DEV ? "/ocr-dev/worker.min.js" : packagedWorkerUrl,
        window.location.href,
      );
      const wasm = new URL(wasmUrl, window.location.href);
      if (
        import.meta.env.PROD &&
        (new URL("tesseract-core-lstm.wasm", workerScript).href !== wasm.href ||
          new URL("worker.min.js", workerScript).href !==
            new URL(workerUrl, window.location.href).href)
      ) {
        throw new Error(
          "OCR loader and WebAssembly binary must be served together",
        );
      }
      const activeWorker = await createWorker("eng", OEM.LSTM_ONLY, {
        corePath: core.href,
        workerPath: workerScript.href,
        langPath: new URL(".", workerScript).href,
        workerBlobURL: false,
        cacheMethod: "none",
        errorHandler: () => {},
      });
      if (signal.aborted) {
        await activeWorker.terminate();
        signal.throwIfAborted();
      }
      worker = activeWorker;
      const attempts = [
        {
          region: [0.2, 0.69, 0.92, 0.87],
          mode: PSM.SINGLE_LINE,
          isolateInk: false,
        },
        {
          region: [0.53, 0.678, 0.84, 0.73],
          mode: PSM.SINGLE_LINE,
          isolateInk: false,
        },
        {
          region: [0.12, 0.64, 0.94, 0.88],
          mode: PSM.SINGLE_LINE,
          isolateInk: true,
        },
        {
          region: [0.5, 0.66, 0.93, 0.74],
          mode: PSM.SINGLE_LINE,
          isolateInk: true,
        },
        { region: [0, 0.5, 1, 1], mode: PSM.SPARSE_TEXT, isolateInk: false },
        { region: [0, 0, 1, 1], mode: PSM.SPARSE_TEXT, isolateInk: false },
      ] as const;
      let best: { code: string; confidence: number } | null = null;
      for (const { region, mode, isolateInk } of attempts) {
        await activeWorker.setParameters({
          tessedit_pageseg_mode: mode,
        });
        const result = await activeWorker.recognize(
          makeScanRegion(image, region, isolateInk),
        );
        const code = extractCode(result.data.text);
        if (!code) continue;
        const confidence = result.data.confidence;
        if (confidence >= 55) return code;
        if (
          !best ||
          confidence > best.confidence ||
          (confidence === best.confidence && code.length > best.code.length)
        ) {
          best = { code, confidence };
        }
      }
      return best?.code ?? null;
    };

    const aborted = new Promise<never>((_resolve, reject) => {
      stop = () => reject(signal.reason);
      signal.addEventListener("abort", stop, { once: true });
    });
    return await Promise.race([recognize(), aborted]);
  } finally {
    if (stop) signal.removeEventListener("abort", stop);
    await worker?.terminate();
  }
}
