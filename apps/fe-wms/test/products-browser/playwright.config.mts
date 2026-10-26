import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.mjs",
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4410",
    browserName: "chromium",
    headless: true,
  },
  reporter: "list",
  outputDir: "../../../../.tmp/products-browser-artifacts",
  webServer: {
    command: "pnpm exec vite --config test/products-browser/vite.config.mts",
    url: "http://127.0.0.1:4410",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
