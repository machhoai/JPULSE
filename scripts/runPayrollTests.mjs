import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const env = { ...process.env, FIRESTORE_EMULATOR_HOST: "127.0.0.1:8485", GOOGLE_CLOUD_PROJECT: "demo-payroll-qa" };
// Never inherit production credentials into test processes; suites install their own mocks.
for (const name of ["FIREBASE_SERVICE_ACCOUNT_BASE64", "TEST_FIREBASE_SERVICE_ACCOUNT_BASE64", "PROD_FIREBASE_SERVICE_ACCOUNT_BASE64", "GOOGLE_APPLICATION_CREDENTIALS", "NODE_OPTIONS"])
  delete env[name];
function run(cwd, args) {
  const result = spawnSync(process.execPath, args, { cwd: root + cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
const mode = process.argv[2];
if (mode === "unit") run("apps/be-wms", ["--experimental-strip-types", "--test", "test/payroll/unit.test.mjs"]);
else if (mode === "emulator") {
  for (const file of ["integration", "api", "dispatcher"])
    run("apps/be-wms", ["--experimental-test-module-mocks", "--test", "test/payroll/" + file + ".test.mjs"]);
  run("apps/fe-wms", ["--test", "src/security/payrollEmailRules.test.mjs"]);
} else throw new Error("Use unit or emulator; browser runner is pnpm test:payroll:browser.");
