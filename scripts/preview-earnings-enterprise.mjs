// Local-only review harness for the production Earnings dashboard.
//
//   npx tsx scripts/preview-earnings-enterprise.mjs
//   npx tsx scripts/preview-earnings-enterprise.mjs --port 4181
//   npx tsx scripts/preview-earnings-enterprise.mjs --check
//
// The real RevenueDashboard component is rendered against generated fixture
// data. The server binds to loopback, blocks unknown API routes and never
// imports credentials, Supabase clients or production data.

import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright";
import { creatorDemoData, creatorDemoInsight } from "../lib/creator-demo-data.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
const portArg = process.argv.findIndex((arg) => arg === "--port");
const inlinePort = process.argv.find((arg) => arg.startsWith("--port="));
const requestedPort = Number(
  inlinePort?.slice("--port=".length) ?? (portArg >= 0 ? process.argv[portArg + 1] : 4181),
);
if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
  throw new Error("--port must be an integer from 1 to 65535");
}

const fleet = [
  { id: "11111111-1111-4111-8111-111111111111", slug: "ava-vale", name: "Ava Vale", color: "#365a7d", share: 0.34 },
  { id: "22222222-2222-4222-8222-222222222222", slug: "zoey-foxx", name: "Zoey Foxx", color: "#718eaa", share: 0.27 },
  { id: "33333333-3333-4333-8333-333333333333", slug: "bri", name: "Bri", color: "#9d7f66", share: 0.22 },
  { id: "44444444-4444-4444-8444-444444444444", slug: "cat", name: "Cat", color: "#71837a", share: 0.17 },
];

function scaledStats(stats, share) {
  return Object.fromEntries(Object.entries(stats).map(([key, value]) => {
    if (typeof value !== "number") return [key, value];
    if (key === "repeatPct") return [key, value];
    return [key, Number.isInteger(value) ? Math.round(value * share) : value * share];
  }));
}

function fleetData(period = "1M", range) {
  const base = creatorDemoData(period, range);
  const originalId = base.clones[0].id;
  const series = base.series.map((row, index) => {
    const total = Number(row[originalId]) || 0;
    let allocated = 0;
    const next = { bucket: row.bucket };
    fleet.forEach((creator, creatorIndex) => {
      const isLast = creatorIndex === fleet.length - 1;
      const variance = 1 + (((index + creatorIndex * 2) % 5) - 2) * 0.035;
      const value = isLast ? total - allocated : Math.max(0, Math.round(total * creator.share * variance));
      next[creator.id] = value;
      allocated += value;
    });
    return next;
  });
  const perClone = Object.fromEntries(fleet.map((creator) => [creator.id, scaledStats(base.totals, creator.share)]));
  const recent = base.recent.map((row, index) => {
    const creator = fleet[index % fleet.length];
    return {
      ...row,
      cloneId: creator.id,
      cloneName: creator.name,
      cloneColor: creator.color,
      telegramId: null,
      buyerName: row.buyerName?.replace(" (demo)", "") ?? row.buyerName,
      mediaName: row.mediaName?.replace(/^Demo /, "Studio ") ?? row.mediaName,
    };
  });
  return {
    ...base,
    clones: fleet.map(({ share: _share, ...creator }) => ({ ...creator, stars: Math.round(base.totals.stars * creator.share) })),
    series,
    perClone,
    recent,
    analytics: {
      ...base.analytics,
      whaleFans: base.analytics.whaleFans.map((fan) => ({ ...fan, name: fan.name.replace(" (demo)", "") })),
      topWeeklySpenders: base.analytics.topWeeklySpenders.map((fan) => ({ ...fan, name: fan.name.replace(" (demo)", "") })),
      clones: fleet.map(({ share, ...creator }) => ({
        ...creator,
        revenueStars: Math.round(base.analytics.totals.revenueStars * share),
        costUsd: 0,
        profitUsd: 0,
        sales: Math.round(base.analytics.totals.sales * share),
        margin: 0,
      })),
    },
  };
}

const linkFixture = `
import React from "react";
const hrefText = (href) => typeof href === "string" ? href : (href?.pathname || "#");
export const useLinkStatus=()=>({pending:false});export default function Link({ children, href, onClick, ...props }) {
  return <a href={hrefText(href)} {...props} onClick={(event) => {
    onClick?.(event);
    event.preventDefault();
  }}>{children}</a>;
}
`;

const browserEntry = `
import React from "react";
import { createRoot } from "react-dom/client";
import CurrencyProvider from "./components/CurrencyProvider";
import DashboardAccessProvider from "./components/DashboardAccessProvider";
import RevenueDashboard from "./components/RevenueDashboard";
import RevenueTooltipFix from "./components/RevenueTooltipFix";

document.documentElement.dataset.localEarningsPreview = "true";

function PreviewApp() {
  return <CurrencyProvider>
    <DashboardAccessProvider>
      <main data-earnings-preview className="mx-auto min-h-screen w-full max-w-[1480px] bg-bg p-4 text-ink sm:p-6 lg:p-8">
        <RevenueTooltipFix />
        <RevenueDashboard />
      </main>
    </DashboardAccessProvider>
  </CurrencyProvider>;
}

createRoot(document.getElementById("root")).render(<PreviewApp />);
`;

const bundle = await build({
  stdin: {
    contents: browserEntry,
    resolveDir: root,
    sourcefile: "local-earnings-enterprise-fixture.tsx",
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  alias: { "@": root },
  define: { "process.env.NODE_ENV": '"production"' },
  banner: { js: 'var process={env:{NODE_ENV:"production",NEXT_PUBLIC_REPORT_TIMEZONE:"Australia/Sydney"},browser:true};' },
  plugins: [{
    name: "local-earnings-fixtures",
    setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({
        path: "next/link",
        namespace: "local-earnings-fixture",
      }));
      builder.onLoad({ filter: /.*/, namespace: "local-earnings-fixture" }, () => ({
        loader: "jsx",
        resolveDir: root,
        contents: linkFixture,
      }));
    },
  }],
});

const stylesheet = await postcss([tailwind()]).process('@import "./app/globals.css";', {
  from: join(root, "local-earnings-enterprise-preview.css"),
});

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:">
    <title>Twin Earnings review</title>
    <link rel="stylesheet" href="/styles.css">
    <style>html{--font-sans:"Segoe UI Variable Text","Segoe UI",Inter,Arial,sans-serif;--font-display:"Segoe UI Variable Display","Segoe UI",Inter,Arial,sans-serif;--font-heading:var(--font-display);--font-mono:"Cascadia Mono","SFMono-Regular",Consolas,monospace}body{margin:0}</style>
  </head>
  <body><div id="root"></div><script src="/bundle.js"></script></body>
</html>`;

const requests = [];
const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  requests.push({ method: request.method ?? "GET", path: url.pathname });
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (url.pathname === "/styles.css") {
    response.setHeader("Content-Type", "text/css; charset=utf-8");
    response.end(stylesheet.css);
    return;
  }
  if (url.pathname === "/bundle.js") {
    response.setHeader("Content-Type", "application/javascript; charset=utf-8");
    response.end(bundle.outputFiles[0].text);
    return;
  }
  if (url.pathname === "/api/fx") {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ usd_to_aud: 1.5 }));
    return;
  }
  if (url.pathname === "/api/dashboard") {
    const period = url.searchParams.get("period") || "1M";
    let range;
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    if (startDate && endDate) {
      range = {
        startMs: Date.parse(`${startDate}T00:00:00+10:00`),
        endMs: Date.parse(`${endDate}T23:59:59+10:00`),
      };
    }
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify(fleetData(period, range)));
    return;
  }
  if (url.pathname === "/api/dashboard/day-insight") {
    const day = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const insight = creatorDemoInsight(day);
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({
      ...insight,
      comparison: { ...insight.comparison, scopeLabel: "Fleet" },
      concentration: {
        ...insight.concentration,
        topBuyer: insight.concentration.topBuyer ? { ...insight.concentration.topBuyer, name: insight.concentration.topBuyer.name.replace(" (demo)", "") } : null,
        largestPayment: insight.concentration.largestPayment ? { ...insight.concentration.largestPayment, name: insight.concentration.largestPayment.name.replace(" (demo)", "") } : null,
      },
      summary: { ...insight.summary, headline: "Revenue movement for the selected day", detail: "Compared with the preceding 30-day operating baseline." },
    }));
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    response.statusCode = 403;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: "Live services are disabled in this local fixture" }));
    return;
  }
  if (url.pathname === "/favicon.ico") {
    response.statusCode = 204;
    response.end();
    return;
  }
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(html);
});

await new Promise((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(checkOnly ? 0 : requestedPort, "127.0.0.1", resolveListen);
});

const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not resolve local preview address");
const origin = `http://127.0.0.1:${address.port}`;

function browserExecutable() {
  return [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe"),
  ].filter(Boolean).find((candidate) => existsSync(candidate));
}

async function runCheck() {
  const executablePath = browserExecutable();
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const externalRequests = [];
  const output = join(root, "test-results", "earnings-enterprise");
  mkdirSync(output, { recursive: true });
  try {
    for (const viewport of [
      { width: 390, height: 900 },
      { width: 1440, height: 1000 },
      { width: 1720, height: 1050 },
    ]) {
      const context = await browser.newContext({ viewport, colorScheme: "light", reducedMotion: "reduce" });
      await context.route("**/*", async (route) => {
        const requestUrl = new URL(route.request().url());
        if (requestUrl.origin !== origin) {
          externalRequests.push(requestUrl.href);
          await route.abort("blockedbyclient");
          return;
        }
        await route.continue();
      });
      const page = await context.newPage();
      const pageErrors = [];
      const consoleErrors = [];
      page.on("pageerror", (error) => pageErrors.push(String(error)));
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });

      await page.goto(origin, { waitUntil: "networkidle" });
      await page.locator("[data-earnings-preview]").waitFor();
      await page.locator(".recharts-wrapper").first().waitFor();
      await page.getByRole("group", { name: "Reporting window", exact: true }).waitFor();
      await page.getByRole("group", { name: "Revenue series", exact: true }).waitFor();
      await page.getByRole("group", { name: "Chart type", exact: true }).waitFor();
      await page.getByRole("img", { name: /All creators, Star revenue, 1M:/i }).first().waitFor();
      const text = await page.locator("body").innerText();
      for (const expected of ["Earnings", "Star revenue", "Creator performance", "Operating metrics", "Recent"]) {
        assert.match(text, new RegExp(expected, "i"), `${viewport.width}px missing ${expected}`);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${viewport.width}px horizontal overflow`);
      const creatorSeries = page.getByRole("button", { name: "By creator", exact: true });
      await creatorSeries.click();
      assert.equal(await creatorSeries.getAttribute("aria-pressed"), "true", `${viewport.width}px creator series did not activate`);
      const totalSeries = page.getByRole("button", { name: "Total", exact: true });
      await totalSeries.click();
      assert.equal(await totalSeries.getAttribute("aria-pressed"), "true", `${viewport.width}px total series did not reactivate`);
      const lineChart = page.getByRole("button", { name: "Line chart", exact: true });
      await lineChart.click();
      assert.equal(await lineChart.getAttribute("aria-pressed"), "true", `${viewport.width}px line chart did not activate`);
      await page.getByRole("button", { name: "Bar chart", exact: true }).click();
      await Promise.all([
        page.waitForResponse((response) => response.url().includes("/api/dashboard?") && response.url().includes("period=1W")),
        page.getByRole("button", { name: "1W", exact: true }).click(),
      ]);
      await Promise.all([
        page.waitForResponse((response) => response.url().includes("/api/dashboard?") && response.url().includes("period=1M")),
        page.getByRole("button", { name: "1M", exact: true }).click(),
      ]);

      if (viewport.width < 640) {
        const mobileSort = page.getByRole("combobox", { name: "Sort ledger by", exact: true });
        for (const key of ["fan", "creator", "type", "amount", "date"]) {
          await mobileSort.selectOption(key);
          assert.equal(await mobileSort.inputValue(), key, `${viewport.width}px mobile ledger did not select ${key}`);
          const reverse = page.getByRole("button", { name: /Reverse ledger sort/i });
          await reverse.click();
          assert.match(await reverse.getAttribute("aria-label"), /currently/i, `${viewport.width}px missing mobile sort direction`);
        }
        await page.getByRole("button", { name: /Reverse ledger sort/i }).click();
      } else {
        const table = page.getByRole("table");
        for (const label of ["Fan", "Creator", "Type", "Amount", "Date"]) {
          const sortButton = table.getByRole("button", { name: new RegExp(`Sort by ${label}`, "i") });
          await sortButton.click();
          const header = sortButton.locator("xpath=..");
          assert.match(await header.getAttribute("aria-sort"), /ascending|descending/, `${viewport.width}px ${label} sort state missing`);
          const firstDirection = await header.getAttribute("aria-sort");
          await sortButton.click();
          assert.notEqual(await header.getAttribute("aria-sort"), firstDirection, `${viewport.width}px ${label} sort did not reverse`);
        }
        await table.getByRole("button", { name: /Sort by Date/i }).click();
      }
      assert.deepEqual(pageErrors, [], `${viewport.width}px page errors`);
      assert.deepEqual(consoleErrors, [], `${viewport.width}px console errors`);
      await page.screenshot({ path: join(output, `earnings-${viewport.width}.png`), fullPage: true });

      const reportTab = page.getByRole("tab", { name: "Full revenue report", exact: true });
      await reportTab.click();
      assert.equal(await reportTab.getAttribute("aria-selected"), "true", `${viewport.width}px report tab did not activate`);
      for (const heading of ["What sells", "Who pays", "Peak hours", "Peak days", "Paid-message paywall", "Buyer breakdown"]) {
        await page.getByRole("heading", { name: new RegExp(`^${heading}`, "i") }).waitFor();
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${viewport.width}px report horizontal overflow`);
      await page.screenshot({ path: join(output, `earnings-${viewport.width}-report.png`), fullPage: true });
      await context.close();
    }

    assert.deepEqual(externalRequests, [], "The preview attempted an external request");
    const unsafe = requests.filter(({ method, path }) =>
      !["GET", "HEAD"].includes(method) || (path.startsWith("/api/") && !["/api/dashboard", "/api/dashboard/day-insight", "/api/fx"].includes(path)),
    );
    assert.deepEqual(unsafe, [], "The preview attempted a write or an unexpected API call");
    console.log(`LOCAL EARNINGS PREVIEW PASSED: ${origin}, mobile + laptop + wide desktop, no runtime errors, no external requests, no writes.`);
  } finally {
    await browser.close();
  }
}

if (checkOnly) {
  try {
    await runCheck();
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
} else {
  console.log(`Twin local Earnings review: ${origin}/`);
  console.log("Fixture-only. Loopback bound. Live services and writes are disabled. Press Ctrl+C to stop.");
  await new Promise((resolveStop) => {
    const stop = () => server.close(resolveStop);
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}
