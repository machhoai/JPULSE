import { createReadStream, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const require = createRequire(import.meta.url);
const languageModel =
  "@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz";
const devOcrAssets = {
  "/ocr-dev/worker.min.js": [
    "tesseract.js/dist/worker.min.js",
    "text/javascript",
  ],
  "/ocr-dev/tesseract-core-lstm.wasm": [
    "tesseract.js-core/tesseract-core-lstm.wasm",
    "application/wasm",
  ],
  "/ocr-dev/eng.traineddata.gz": [languageModel, "application/octet-stream"],
} as const;

export default defineConfig(({ mode }) => {
  if (mode === "zalo-production") {
    const env = loadEnv(mode, process.cwd(), "VITE_");
    const url = URL.parse(env.VITE_ZALO_MEMBER_API_URL ?? "");
    if (
      !url ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.replace(/\/$/, "").endsWith("/api/zalo-members")
    ) {
      throw new Error(
        "Set VITE_ZALO_MEMBER_API_URL to the HTTPS JPULSE /api/zalo-members endpoint.",
      );
    }
  }
  return {
    base: "./",
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "serve-local-ocr-worker",
        generateBundle(_options, bundle) {
          if (!bundle["assets/ocr/ocr-worker.js"]) return;
          const model = readFileSync(require.resolve(languageModel));
          const midpoint = Math.ceil(model.length / 2);
          for (const [index, part] of [
            model.subarray(0, midpoint),
            model.subarray(midpoint),
          ].entries()) {
            this.emitFile({
              type: "asset",
              fileName: `assets/ocr/eng-model-${index}.json`,
              source: JSON.stringify(part.toString("base64")),
            });
          }
        },
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            const path = request.url?.split("?")[0];
            if (
              path !== "/ocr-dev/worker.min.js" &&
              path !== "/ocr-dev/tesseract-core-lstm.wasm" &&
              path !== "/ocr-dev/eng.traineddata.gz"
            ) {
              next();
              return;
            }
            const [asset, contentType] = devOcrAssets[path];
            response.setHeader("Content-Type", contentType);
            createReadStream(require.resolve(asset)).pipe(response);
          });
        },
      },
    ],
    build: {
      target: "es2018",
      modulePreload: { polyfill: false },
      rollupOptions: {
        output: {
          entryFileNames: "assets/[name].[hash].module.js",
          chunkFileNames: "assets/[name].[hash].module.js",
          assetFileNames: (asset) =>
            asset.names.some((name) =>
              [
                "tesseract-core-lstm.js",
                "tesseract-core-lstm.wasm",
                "worker.min.js",
                "ocr-worker.js",
              ].includes(name),
            )
              ? "assets/ocr/[name][extname]"
              : "assets/[name]-[hash][extname]",
        },
      },
    },
  };
});
