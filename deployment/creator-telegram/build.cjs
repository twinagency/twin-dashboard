const fs = require("node:fs/promises");
const path = require("node:path");
const esbuild = require("esbuild");
const postcss = require("postcss");
const tailwind = require("@tailwindcss/postcss");

const checkout = path.resolve(__dirname, "../..");
const dist = path.join(__dirname, "dist");

async function build() {
  await fs.mkdir(dist, { recursive: true });
  const shared = {
    absWorkingDir: checkout,
    bundle: true,
    minify: true,
    legalComments: "none",
    tsconfig: "tsconfig.json",
    define: { "process.env.NODE_ENV": '"production"' },
    nodePaths: [path.join(checkout, "node_modules")],
    alias: { "@": checkout },
    jsx: "automatic",
  };
  await esbuild.build({
    ...shared,
    entryPoints: [path.join(__dirname, "client.tsx")],
    platform: "browser",
    outfile: path.join(dist, "feed.js"),
  });
  await esbuild.build({
    ...shared,
    entryPoints: [path.join(__dirname, "server.ts")],
    platform: "node",
    target: "node22",
    format: "cjs",
    outfile: path.join(dist, "server.cjs"),
    plugins: [{
      name: "server-marker",
      setup(builder) {
        // This entry runs in Node. Next's compile-time assertion is redundant here.
        builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "marker" }));
        builder.onLoad({ filter: /.*/, namespace: "marker" }, () => ({ contents: "", loader: "js" }));
      },
    }],
  });
  const source = '@import "tailwindcss" source(none); @source "./components/CreatorTelegramFeed.tsx";';
  const result = await postcss([tailwind({ base: checkout, optimize: true })])
    .process(source, { from: path.join(checkout, "companion-tailwind.css") });
  const studio = await fs.readFile(path.join(checkout, "components/CreatorStudio.module.css"), "utf8");
  const style = studio.match(/--studio-bg:[\s\S]*?--studio-dark:\s*[^;]+;/)?.[0];
  if (!style) throw new Error("The studio theme tokens were not found.");
  await fs.writeFile(path.join(dist, "feed.css"), result.css + `\n:root{${style}}body{margin:0;background:var(--studio-bg);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--studio-ink)}main{max-width:1160px;margin:0 auto;padding:clamp(16px,4vw,48px)}.back-link{display:inline-flex;align-items:center;min-height:44px;margin-bottom:16px;color:var(--studio-accent-deep);font-size:14px;font-weight:600}.back-link:focus-visible,button:focus-visible{outline:3px solid var(--studio-accent);outline-offset:2px}\n`);
}

build().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
