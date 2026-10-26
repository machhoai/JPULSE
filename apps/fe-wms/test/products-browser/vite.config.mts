import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const file = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: file("./"),
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4410,
    strictPort: true,
    fs: { allow: [file("../../../../")] },
  },
  resolve: {
    alias: [
      ...[
        "@/hooks/useCategories",
        "@/hooks/useProducts",
        "@/hooks/useProductBOM",
        "@/hooks/useProductPermissions",
        "@/hooks/useProductMovementHistory",
        "@/lib/firebaseStorage",
        "goey-toast",
      ].map((find) => ({ find, replacement: file("./mocks.tsx") })),
      { find: /^\.\/ProductExcelImportTab$/, replacement: file("./mocks.tsx") },
      { find: "@", replacement: file("../../src") },
    ],
  },
});
