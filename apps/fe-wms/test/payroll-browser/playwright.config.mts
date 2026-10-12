import {defineConfig} from "@playwright/test";
export default defineConfig({
 testDir:".",testMatch:"*.spec.mjs",timeout:45000,workers:1,retries:0,
 use:{baseURL:"http://127.0.0.1:4407",browserName:"chromium",headless:true,trace:"retain-on-failure"},
 reporter:[["list"],["json",{outputFile:"../../../../.tmp/payroll-browser-results.json"}]],
 outputDir:"../../../../.tmp/payroll-browser-artifacts",
 webServer:[
  {command:"pnpm exec vite --config test/payroll-browser/vite.config.mts",url:"http://127.0.0.1:4407",reuseExistingServer:false,timeout:120000},
  {command:"pnpm --filter @bduck/be-wms exec node --experimental-test-module-mocks test/payroll/browserApiServer.mjs",url:"http://127.0.0.1:4408/__qa/metrics",reuseExistingServer:false,timeout:120000},
 ],
});
