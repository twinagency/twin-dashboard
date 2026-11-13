import { build } from "esbuild";
import { mkdir, writeFile, copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
const root = path.resolve(import.meta.dirname, "../..");
// In-repo defaults so a plain checkout builds; check-engine-journey.mjs reads the same default.
const out = path.resolve(root, process.env.ENGINE_BROWSER_OUTPUT ?? "test-results/engine-browser/dist");
await mkdir(out, { recursive: true });
await build({ absWorkingDir: root, entryPoints: ["tests/browser/engine-journey.tsx"], bundle: true,
  outfile: path.join(out, "app.js"), format: "esm", platform: "browser", jsx: "automatic", minify: true,
  define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "synthetic-next", setup(b) {
    b.onResolve({ filter: /^next\/(navigation|link)$|^@\/app\/actions\/clone-scope$/ }, () => ({ path: path.join(root, "preview/onlyfans-ui/next-shim.tsx") }));
  }}] });
// base.css: a prebuilt file if given, else compiled from app/globals.css exactly as preview/onlyfans-ui/build.mjs does.
if (process.env.ENGINE_BROWSER_BASE_CSS) await copyFile(process.env.ENGINE_BROWSER_BASE_CSS, path.join(out, "base.css"));
else {
  const globals = path.join(root, "app/globals.css");
  const css = await postcss([tailwind({ base: root, optimize: true })]).process(await readFile(globals, "utf8"), { from: globals });
  await writeFile(path.join(out, "base.css"), css.css);
}
await writeFile(path.join(out, "index.html"), '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
