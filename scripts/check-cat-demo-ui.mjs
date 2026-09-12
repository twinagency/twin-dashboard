// Browser verification for the explicit, presentation-only Cat revenue mode.
// The fixture renders production UI components but serves only deterministic
// local data. It never opens a production session or talks to a database.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright";
import {
  CAT_DEMO_ACTIVE_USERS_30D,
  CAT_DEMO_BUYERS_30D,
  CAT_DEMO_KIND,
  CAT_DEMO_LIFETIME_STARS,
  catDemoData,
  catDemoInsight,
} from "../lib/cat-demo-data.ts";
import { CAT_DEMO_CLONE_ID } from "../lib/cat-demo-policy.ts";

const root = process.cwd();
const outputDirectory = path.join(root, "test-results", "cat-demo");
mkdirSync(outputDirectory, { recursive: true });

const navigationStub = `
  import { useSyncExternalStore } from "react";
  const subscribe = (listener) => {
    addEventListener("popstate", listener);
    return () => removeEventListener("popstate", listener);
  };
  export const usePathname = () => useSyncExternalStore(subscribe, () => location.pathname, () => "/revenue");
  export const useSearchParams = () => new URLSearchParams(location.search);
  export const useRouter = () => ({
    refresh() {},
    push(destination) {
      history.pushState({}, "", destination);
      dispatchEvent(new PopStateEvent("popstate"));
    },
  });
`;

const linkStub = `
  import React from "react";
  export default function Link({ children, href, onClick, ...props }) {
    return <a href={href} {...props} onClick={(event) => {
      onClick?.(event);
      event.preventDefault();
    }}>{children}</a>;
  }
`;

const cloneScopeStub = `export async function setCloneScope() {}`;
const loginActionsStub = `export async function logout() {}`;
const fixture = `
  import React from "react";
  import { createRoot } from "react-dom/client";
  import DashboardAccessProvider from "./components/DashboardAccessProvider";
  import CurrencyProvider from "./components/CurrencyProvider";
  import BlurProvider from "./components/BlurProvider";
  import TopBar from "./components/TopBar";
  import RevenueDashboard from "./components/RevenueDashboard";
  import RevenueTooltipFix from "./components/RevenueTooltipFix";
  import { CAT_DEMO_CLONE_ID, CAT_DEMO_LIFETIME_STARS } from "./lib/cat-demo-policy";

  const creators = [{
    id: CAT_DEMO_CLONE_ID,
    name: "Cat",
    color: "#2f6fed",
  }];

  createRoot(document.getElementById("root")).render(
    <DashboardAccessProvider audience="admin">
      <CurrencyProvider>
        <BlurProvider>
          <div className="flex h-dvh min-w-0 flex-col overflow-hidden">
            <TopBar clones={creators} activeCloneId={CAT_DEMO_CLONE_ID} allTimeStars={CAT_DEMO_LIFETIME_STARS} />
            <main className="dashboard-main min-h-0 min-w-0 flex-1 overflow-y-auto p-4 pb-28 sm:p-6 lg:p-8">
              <RevenueTooltipFix />
              <RevenueDashboard cloneId={CAT_DEMO_CLONE_ID} demoMode="cat" />
            </main>
          </div>
        </BlurProvider>
      </CurrencyProvider>
    </DashboardAccessProvider>,
  );
`;

const bundle = await build({
  stdin: {
    contents: fixture,
    resolveDir: root,
    sourcefile: "cat-demo-fixture.tsx",
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  alias: { "@": root },
  define: { "process.env.NODE_ENV": '"production"' },
  banner: {
    js: 'var process={env:{NODE_ENV:"production",NEXT_PUBLIC_REPORT_TIMEZONE:"Australia/Sydney"},browser:true};',
  },
  plugins: [{
    name: "cat-demo-fixture-stubs",
    setup(builder) {
      builder.onResolve(
        { filter: /^(next\/link|next\/navigation|@\/app\/actions\/clone-scope|@\/app\/login\/actions)$/ },
        (args) => ({ path: args.path, namespace: "fixture" }),
      );
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
        loader: "jsx",
        resolveDir: root,
        contents: args.path === "next/link"
          ? linkStub
          : args.path === "next/navigation"
            ? navigationStub
            : args.path.includes("clone-scope")
              ? cloneScopeStub
              : loginActionsStub,
      }));
    },
  }],
});

const css = await postcss([tailwind()]).process('@import "./app/globals.css";', {
  from: path.join(root, "cat-demo-verification.css"),
});

const apiRequests = [];
const dashboardResponses = [];
const fixedNow = Date.parse("2026-09-12T03:00:00Z");
const server = createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/styles.css") {
    response.setHeader("content-type", "text/css");
    response.end(css.css);
    return;
  }
  if (url.pathname === "/bundle.js") {
    response.setHeader("content-type", "application/javascript");
    response.end(bundle.outputFiles[0].text);
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    apiRequests.push(url.pathname + url.search);
    response.setHeader("content-type", "application/json");
    response.setHeader("x-data-mode", "synthetic-sample");
    if (url.pathname === "/api/fx") {
      response.end(JSON.stringify({ usd_to_aud: 1.4, synthetic: true }));
      return;
    }
    if (url.pathname === "/api/dashboard") {
      assert.equal(url.searchParams.get("view"), "cat", "every Cat dashboard request must retain explicit presentation mode");
      assert.equal(url.searchParams.get("clone"), CAT_DEMO_CLONE_ID, "every Cat dashboard request must retain exact clone scope");
      const range = url.searchParams.has("startDate") && url.searchParams.has("endDate")
        ? {
            startMs: Date.parse(`${url.searchParams.get("startDate")}T00:00:00Z`),
            endMs: Date.parse(`${url.searchParams.get("endDate")}T23:59:59.999Z`),
          }
        : undefined;
      const data = catDemoData(url.searchParams.get("period") || "1M", range, fixedNow);
      dashboardResponses.push(data);
      response.end(JSON.stringify(data));
      return;
    }
    if (url.pathname === "/api/dashboard/day-insight") {
      assert.equal(url.searchParams.get("view"), "cat", "every Cat daily comparison request must retain explicit presentation mode");
      response.end(JSON.stringify(catDemoInsight(url.searchParams.get("date"), fixedNow)));
      return;
    }
    response.statusCode = 403;
    response.end(JSON.stringify({ error: "No live service is allowed in the Cat demo UI check" }));
    return;
  }
  response.setHeader("content-type", "text/html");
  response.end(`<!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="stylesheet" href="/styles.css" />
        <style>html{--font-sans:Arial;--font-display:Arial}body{margin:0;font-family:Arial}</style>
      </head>
      <body><div id="root"></div><script src="/bundle.js"></script></body>
    </html>`);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
if (process.argv.includes("--preview")) {
  console.log(`CAT_PRESENTATION_PREVIEW_URL=${origin}/revenue`);
  await new Promise((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
  await new Promise((resolve) => server.close(resolve));
  process.exit(0);
}
const localBrowser = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const browser = await chromium.launch({
  headless: true,
  ...(localBrowser ? { executablePath: localBrowser } : {}),
});

const evidence = [];
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: "light" });
    const runtimeErrors = [];
    page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error}`));
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`);
    });
    await page.addInitScript(() => {
      localStorage.setItem("currency", "AUD");
      localStorage.setItem("blurMedia", "false");
    });

    try {
      await page.goto(`${origin}/revenue?view=cat`, { waitUntil: "networkidle" });
      await page.locator(".recharts-wrapper").first().waitFor();

      const disclosure = page.locator('[data-cat-sample="true"]');
      await disclosure.waitFor();
      const disclosureText = await disclosure.innerText();
      assert.match(disclosureText, /Sample figures/i);
      assert.match(disclosureText, /First 30 days/i);

      const headline = page.locator(".money-value-primary").first();
      assert.equal((await headline.innerText()).trim(), "A$129,384.00", "the default 1M headline must be exact and stable");
      assert.equal(dashboardResponses.at(-1).demoKind, CAT_DEMO_KIND);
      assert.match(await page.locator("body").innerText(), /First-month users[\s\S]{0,24}12,124/i);
      assert.equal(await page.getByRole("button", { name: "1Y", exact: true }).count(), 0, "pre-launch periods stay hidden");
      assert.equal(await page.getByRole("button", { name: "Custom", exact: true }).count(), 0, "the first-month view cannot select pre-launch dates");
      const bodyText = await page.locator("body").innerText();
      assert.doesNotMatch(bodyText, /\bdemo\b/i, "the presentation UI uses sample wording instead of demo wording");
      assert.doesNotMatch(bodyText, /latter vs earlier half/i, "first-month growth does not show a half-over-half comparison");
      assert.doesNotMatch(bodyText, /(?:^|\s)[−-]\d+(?:\.\d+)?%/m, "the first-month view does not show negative percentage metrics");
      assert.doesNotMatch(bodyText, /A\$-/i, "the first-month chart never renders a negative currency tick");
      const renderedSeries = dashboardResponses.at(-1).series.map(row => row[CAT_DEMO_CLONE_ID]);
      assert.equal(renderedSeries[0], 0, "the first-month chart starts at zero");
      assert.ok(renderedSeries.slice(1).some((value, index) => value < renderedSeries[index]), "the first-month chart includes natural pull-backs");

      await page.getByRole("button", { name: /Full revenue report/i }).click();
      await page.locator('[data-slot="card-title"]', { hasText: /^Revenue report$/i }).waitFor();

      const payingCustomers = page.locator("details").filter({ hasText: "Paying customers" });
      await payingCustomers.locator("summary").click();
      const conversionText = await payingCustomers.innerText();
      assert.match(conversionText, /Did people who messaged buy\?[\sⒾ]*17%/i);
      const renderedCounts = conversionText.match(/([\d,]+) of ([\d,]+) people who messaged also bought/i);
      assert.ok(renderedCounts, "the user-to-buyer denominator must be visible beside the conversion");
      const buyers = Number(renderedCounts[1].replaceAll(",", ""));
      const users = Number(renderedCounts[2].replaceAll(",", ""));
      assert.equal(buyers, CAT_DEMO_BUYERS_30D);
      assert.equal(users, CAT_DEMO_ACTIVE_USERS_30D);
      assert.ok(buyers / users >= 0.17, "the rendered user-to-buyer conversion must be at least 17%");

      const visibleNames = page.locator(".creator-name:visible");
      assert.ok(await visibleNames.count() >= 3, "Cat must be privacy-tagged in the top bar and chart");
      assert.ok((await visibleNames.allInnerTexts()).some((name) => name.includes("Cat")), "Cat must be among the tagged creator names");
      await page.getByTitle("Blur all media").click();
      assert.equal(await page.locator("html").evaluate((element) => element.classList.contains("blur-media")), true);
      const privacyResults = await visibleNames.evaluateAll((elements) => elements.map((element) => ({
        text: element.textContent?.trim(),
        filter: getComputedStyle(element).filter,
      })));
      assert.ok(privacyResults.every(({ filter }) => filter !== "none" && /blur\(/.test(filter)), "every visible creator-name element must blur");
      assert.ok(privacyResults.some(({ text, filter }) => text?.includes("Cat") && /blur\(/.test(filter)), "Cat must blur with the shared privacy toggle");

      const unmaskedCatText = await page.locator("body").evaluate((body) => {
        const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
        const leaks = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const parent = node.parentElement;
          if (!parent || !/\bCat(?:'s|’s)?\b/.test(node.textContent || "")) continue;
          const style = getComputedStyle(parent);
          if (style.display === "none" || style.visibility === "hidden") continue;
          if (!parent.closest(".creator-name")) leaks.push(node.textContent.trim());
        }
        return leaks;
      });
      assert.deepEqual(unmaskedCatText, [], `visible Cat text escaped the privacy class: ${unmaskedCatText.join(" | ")}`);

      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, "the page must not overflow horizontally");
      assert.deepEqual(runtimeErrors, [], "the production components must render without runtime errors");
      assert.ok(apiRequests.every((request) => {
        const url = new URL(request, origin);
        if (url.pathname === "/api/fx") return true;
        return (url.pathname === "/api/dashboard" || url.pathname === "/api/dashboard/day-insight")
          && url.searchParams.get("view") === "cat";
      }), "the fixture must never request avatars, media, Telegram or any non-synthetic financial endpoint");

      await page.screenshot({
        path: path.join(outputDirectory, `cat-${width}-blurred.png`),
        fullPage: true,
      });
      evidence.push({
        width,
        headline: "A$129,384.00",
        activeUserBuyerConversion: buyers / users,
        disclosure: true,
        creatorNamesBlurred: privacyResults.length,
        syntheticRequestsOnly: true,
        noHorizontalOverflow: true,
        noRuntimeErrors: true,
      });
    } catch (error) {
      await page.screenshot({ path: path.join(outputDirectory, `failure-${width}.png`), fullPage: true });
      writeFileSync(path.join(outputDirectory, `failure-${width}.json`), JSON.stringify({
        error: String(error),
        runtimeErrors,
        requests: apiRequests,
        text: await page.locator("body").innerText(),
      }, null, 2));
      throw error;
    } finally {
      await page.close();
    }
  }

  writeFileSync(path.join(outputDirectory, "results.json"), JSON.stringify(evidence, null, 2));
  console.log("CAT DEMO UI PASSED", JSON.stringify(evidence));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
