import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = process.argv[2] ?? "dist/zalo-testing";
const html = await readFile(resolve(output, "index.html"), "utf8");
const config = JSON.parse(await readFile("app-config.json", "utf8"));

function entryPaths(pattern) {
  return Array.from(html.matchAll(pattern), ([, path]) => {
    if (!path.startsWith("./assets/"))
      throw new Error("Expected a relative Vite asset path");
    return path.slice(2);
  });
}

config.listCSS = entryPaths(
  /<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g,
);
config.listSyncJS = entryPaths(
  /<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/g,
);
if (!config.listCSS.length || !config.listSyncJS.length) {
  throw new Error("Unable to find Vite entry assets for app-config.json");
}

for (const path of [...config.listCSS, ...config.listSyncJS]) {
  await stat(resolve(output, path));
}
await writeFile(
  resolve(output, "app-config.json"),
  JSON.stringify(config, null, 2) + "\n",
);

let total = 0;
for (const path of await readdir(output, { recursive: true })) {
  const file = await stat(resolve(output, path));
  if (!file.isFile()) continue;
  if (file.size > 3_000_000)
    throw new Error(`${path} exceeds Zalo's 3 MB file limit`);
  total += file.size;
}
if (total > 10_000_000)
  throw new Error("Build exceeds Zalo's 10 MB bundle limit");
console.log(
  `Prepared Zalo bundle in ${output} (${total.toLocaleString("en-US")} bytes)`,
);
