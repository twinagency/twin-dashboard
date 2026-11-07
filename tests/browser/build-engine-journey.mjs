import { build } from "esbuild";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const out = process.env.ENGINE_BROWSER_OUTPUT;
if (!out) throw new Error("ENGINE_BROWSER_OUTPUT is required");
await mkdir(out, { recursive: true });
await build({ absWorkingDir: root, entryPoints: ["tests/browser/engine-journey.tsx"], bundle: true,
  outfile: path.join(out, "app.js"), format: "esm", platform: "browser", jsx: "automatic", minify: true,
  define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "synthetic-next", setup(b) {
    b.onResolve({ filter: /^next\/(navigation|link)$|^@\/app\/actions\/clone-scope$/ }, () => ({ path: path.join(root, "preview/onlyfans-ui/next-shim.tsx") }));
  }}] });
await copyFile(process.env.ENGINE_BROWSER_BASE_CSS || "/evidence/browser-preview-offline/base.css", path.join(out, "base.css"));
await writeFile(path.join(out, "index.html"), '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
