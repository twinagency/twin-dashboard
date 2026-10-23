import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

/**
 * Browser check for launch screens A, B and C. The real components are bundled with esbuild and served from a
 * local static server; every /api request is answered by a synthetic backend through page.route, so nothing
 * leaves the machine and no production system is touched. Screenshots go to ./screenshots/.
 * Run: node scripts/check-onlyfans-launch-browser.mjs   (PREVIEW_CHROME overrides the browser binary)
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const { build } = require("esbuild"), { chromium } = require("playwright");
const postcss = require("postcss"), tailwind = require("@tailwindcss/postcss");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "launch-browser-"));
const shots = path.join(root, "screenshots"); fs.mkdirSync(shots, { recursive: true });
let checks = 0; const ok = (cond, msg) => { assert(cond, msg); checks++; };

fs.writeFileSync(path.join(work, "entry.tsx"), `import { createRoot } from "react-dom/client";
import AbcWorkspace from "@/components/onlyfans-launch/AbcWorkspace";
createRoot(document.getElementById("root")!).render(<AbcWorkspace />);`);
fs.writeFileSync(path.join(work, "nav.ts"), `export const useRouter = () => ({ refresh() {}, push() {}, replace() {} }); export const usePathname = () => "/"; export const useSearchParams = () => new URLSearchParams();`);
await build({ entryPoints: [path.join(work, "entry.tsx")], bundle: true, outfile: path.join(work, "app.js"), jsx: "automatic", format: "iife", minify: false,
  define: { "process.env.NODE_ENV": '"development"' }, logLevel: "error", nodePaths: [path.join(root, "node_modules")], absWorkingDir: root,
  alias: { "@": root, "next/navigation": path.join(work, "nav.ts") }, loader: { ".css": "empty" } });
const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
let styles = "";
try { styles = (await postcss([tailwind({ base: root })]).process(css, { from: path.join(root, "app/globals.css") })).css; } catch (e) { console.warn("tailwind unavailable, unstyled run:", e.message); }
fs.writeFileSync(path.join(work, "app.css"), styles);
const server = http.createServer((req, res) => {
  const file = req.url === "/app.js" ? "app.js" : req.url === "/app.css" ? "app.css" : null;
  if (file) { res.setHeader("content-type", file.endsWith("js") ? "text/javascript" : "text/css"); return res.end(fs.readFileSync(path.join(work, file))); }
  res.setHeader("content-type", "text/html");
  res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>`);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const S = "of-launch.v1", ISO = "2026-10-23T05:00:00Z";
const env = (account, data) => ({ schemaVersion: S, ok: true, accountId: account, data });
const state = { delayA: 0, posts: [], accessB: false, deny: false };
const evidence = { id: "e-9", source: "ledger page", ref: "offset 7, row 2", observedAt: ISO };
const purchasesB = { scan: { state: "complete", offset: null, error: null, appliedOwnershipRows: 10, messagesMarkedPaid: 4 }, nextCursor: null, items: [
  { id: "p-9", kind: "unmatched", status: "open", revision: 2, fanId: "77", messageId: null, amountCents: 1999, currency: "USD", reason: "No message matches", evidence: [evidence], audit: [] },
  { id: "p-8", kind: "reversal", status: "open", revision: 1, fanId: "78", messageId: "5", amountCents: 500, currency: "USD", reason: "Reversed", evidence: [], audit: [] }] };
const readinessB = { asOf: ISO, blockers: [{ id: "b1", area: "Catalogue", status: "ok", title: "Catalogue ready", detail: "12 items priced.", evidence: "catalogue read", action: null }] };
const personalityB = { drafts: [{ id: "d-1", revision: 1, field: "Persona", imported: "Imported persona text", edited: null, source: "chat import", approved: false }], configApproved: false, configRevision: 3, model: "m/x", dailyBudgetCents: 300, behaviour: { maxRepliesPerHour: 10, allowSales: false } };

async function mock(route) {
  const url = new URL(route.request().url()), p = url.pathname, method = route.request().method();
  const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (state.deny && p.startsWith("/api/onlyfans-launch/")) return json({ ok: false, error: "Sign in again." }, 401);
  if (p === "/api/onlyfans/accounts") {
    const acct = id => ({ accountId: id, binding: { creatorName: `Creator ${id}`, handle: `@${id}` }, health: id === "acc-a" ? "expired_session" : "connected", healthReason: id === "acc-a" ? "Session expired" : null, automationMode: "paused", capabilities: { sendManualMessage: "available" } });
    const only = url.searchParams.get("account");
    return json({ accounts: only ? [acct(only)] : [acct("acc-a"), acct("acc-b")] });
  }
  const cfg = p.match(/^\/api\/onlyfans-configuration\/accounts\/([^/]+)$/);
  if (cfg) return json({ ok: false, error: "Configuration editing is not configured." }, 503);
  const m = p.match(/^\/api\/onlyfans-launch\/abc\/accounts\/([^/]+)\/(.+)$/);
  if (!m) return route.fulfill({ status: 404, body: "" });
  const [, acc, rest] = m, B = acc === "acc-b";
  if (rest === "access") return json(env(acc, { canManage: B ? state.accessB : true }));
  if (method === "POST") { state.posts.push({ acc, body: route.request().postDataJSON() }); return json(env(acc, null)); }
  if (acc === "acc-a" && state.delayA) await new Promise(r => setTimeout(r, state.delayA));
  if (!B) return json({ schemaVersion: S, ok: false, outcome: "unavailable", error: "The backend contract for this screen is not available yet." }, 503);
  return json(env(acc, rest === "readiness" ? readinessB : rest === "purchases" ? purchasesB : personalityB));
}

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"],
  ...(process.env.PREVIEW_CHROME ? { executablePath: process.env.PREVIEW_CHROME } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const external = [];
  await context.route("**/*", route => { const u = route.request().url(); if (!u.startsWith(origin)) { external.push(u); return route.abort(); } return u.includes("/api/") ? mock(route) : route.continue(); });
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(String(e)));
  const shot = name => page.screenshot({ path: path.join(shots, name), fullPage: true });
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  // Slow first account: the stale-response check starts while acc-a is still loading.
  state.delayA = 1200;
  await page.goto(origin);
  await page.locator("#launch-account").waitFor();
  ok(await page.locator('[data-launch-state="loading"]').count() > 0, "loading state is shown");
  await page.locator("#launch-account").selectOption("acc-b");
  await page.locator('[data-blocker="b1"]').waitFor();
  await page.waitForTimeout(1500);
  ok(await page.locator('[data-blocker="b1"]').count() === 1 && await page.locator('[data-launch-state="pending"]').count() === 0, "late acc-a answer did not overwrite acc-b");
  state.delayA = 0;

  // Screen A on acc-a: live account check is real, full readiness is pending and not claimed.
  await page.locator("#launch-account").selectOption("acc-a");
  await page.locator('[data-launch-state="pending"]').first().waitFor();
  ok(await page.locator('[data-blocker="live-connection"]').count() === 1, "live connection row shows");
  ok((await page.locator('[data-blocker="live-connection"]').innerText()).includes("expired session"), "expired session is a blocker");
  ok(await page.locator("[data-launch-fixture]").count() === 0, "no fixture before the click");
  await shot("A-readiness-pending.png");
  await page.getByRole("button", { name: "Show FIXTURE-ONLY sample" }).click();
  await page.locator("[data-launch-fixture]").waitFor();
  ok(await page.locator('[data-blocker="ledger"]').innerText().then(t => t.includes("offset 40")), "ledger blocker is honest");
  ok(await page.locator('[data-blocker="catalogue"]').count() === 1, "known blockers listed");
  await shot("A-readiness-fixture.png");

  // Keyboard: arrow keys move between tabs.
  await page.getByRole("tab", { name: /A\. Readiness/ }).focus();
  await page.keyboard.press("ArrowRight");
  ok(await page.getByRole("tab", { name: /B\. Purchases/ }).getAttribute("aria-selected") === "true", "arrow key selects next tab");

  // Screen B on acc-a: pending, fixture sample cannot act.
  await page.locator('[data-launch-state="pending"]').first().waitFor();
  await page.getByRole("button", { name: "Show FIXTURE-ONLY sample" }).click();
  await page.locator('[data-purchase="p-1"]').waitFor();
  ok(await page.getByRole("button", { name: "Record resolution" }).first().isDisabled(), "fixture resolution is disabled");
  ok(await page.locator('[data-scan="held"]').count() === 1, "held scan is visible");
  ok(await page.locator('[data-launch-state="no-evidence"]').count() >= 1, "missing evidence is stated");
  await shot("B-purchases-fixture.png");

  // Screen B on acc-b with manage rights: audited resolution, evidence required for ownership.
  state.accessB = true;
  await page.locator("#launch-account").selectOption("acc-b");
  await page.locator('[data-purchase="p-9"]').waitFor();
  const card = page.locator('[data-purchase="p-9"]');
  await card.getByLabel("Resolution").selectOption("confirmed_owned");
  await card.getByLabel(/Reason/).fill("Ledger row matches payment");
  ok(await card.getByRole("button", { name: "Record resolution" }).isDisabled(), "ownership needs evidence");
  await card.getByLabel(/Evidence/).selectOption("e-9");
  await card.getByRole("button", { name: "Record resolution" }).click();
  await page.waitForFunction(() => true); await page.waitForTimeout(300);
  const post = state.posts.at(-1);
  ok(post && post.body.path === "purchases/resolve" && post.body.body.evidenceId === "e-9" && !("actor" in post.body.body) && !("commandKey" in post.body.body), "resolution posts evidence id and no identity");
  const noEv = page.locator('[data-purchase="p-8"]');
  await noEv.getByLabel("Resolution").selectOption("confirmed_owned");
  await noEv.getByLabel(/Reason/).fill("x");
  ok(await noEv.getByRole("button", { name: "Record resolution" }).isDisabled(), "no evidence, no ownership");
  await shot("B-purchases-live-manage.png");

  // Read-only permission on acc-b.
  state.accessB = false;
  await page.locator("#launch-account").selectOption("acc-a"); await page.locator("#launch-account").selectOption("acc-b");
  await page.locator('[data-purchase="p-9"]').waitFor();
  ok(await page.locator('[data-launch-state="readonly"]').count() >= 1, "read-only notice");
  ok(await page.locator('[data-purchase="p-9"]').getByRole("button", { name: "Record resolution" }).isDisabled(), "read-only disables resolution");
  await shot("B-purchases-readonly.png");

  // Screen C.
  await page.getByRole("tab", { name: /C\. Personality/ }).click();
  await page.locator('[data-draft="d-1"]').waitFor();
  ok(await page.locator('[data-draft="d-1"] textarea').isDisabled(), "read-only drafts are not editable");
  state.accessB = true;
  await page.locator("#launch-account").selectOption("acc-a"); await page.locator("#launch-account").selectOption("acc-b");
  await page.locator('[data-draft="d-1"] textarea').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-draft="d-1"] textarea')?.disabled);
  await page.locator('[data-draft="d-1"] textarea').fill("Edited persona");
  await page.getByRole("button", { name: "Save edit" }).click(); await page.waitForTimeout(300);
  ok(state.posts.at(-1).body.path === "personality/draft" && state.posts.at(-1).body.body.edited === "Edited persona", "draft edit posted");
  await page.getByRole("button", { name: "Approve configuration" }).click();
  ok(await page.getByRole("alertdialog").count() === 1, "approval needs confirmation");
  await page.getByRole("button", { name: "Cancel" }).click();
  await shot("C-personality-live.png");
  await page.locator("#launch-account").selectOption("acc-a");
  await page.getByRole("button", { name: "Show FIXTURE-ONLY sample" }).click();
  ok(await page.locator("[data-launch-fixture]").count() >= 1, "personality fixture labelled");
  ok(await page.locator('[data-draft="d-1"] textarea').isDisabled(), "fixture drafts cannot be edited");
  await shot("C-personality-pending-fixture.png");

  // Session loss clears private data.
  state.deny = true; state.accessB = true;
  await page.locator("#launch-account").selectOption("acc-b"); await page.getByRole("tab", { name: /B\. Purchases/ }).click();
  await page.locator('[data-launch-state="denied"]').first().waitFor();
  ok(await page.locator("[data-purchase]").count() === 0, "denied session shows no purchases");
  state.deny = false;

  // Mobile 390px.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: /A\. Readiness/ }).click();
  await page.locator('[data-blocker="b1"]').waitFor();
  ok(await fits(), "readiness fits 390px");
  await shot("mobile-A-readiness.png");
  await page.getByRole("tab", { name: /B\. Purchases/ }).click(); await page.locator('[data-purchase="p-9"]').waitFor();
  ok(await fits(), "purchases fit 390px"); await shot("mobile-B-purchases.png");
  await page.getByRole("tab", { name: /C\. Personality/ }).click(); await page.locator('[data-draft="d-1"]').waitFor();
  ok(await fits(), "personality fits 390px"); await shot("mobile-C-personality.png");

  ok(external.length === 0, "no external requests: " + external.join(","));
  ok(errors.length === 0, "no page errors: " + errors.join(" | "));
  console.log(`check-onlyfans-launch-browser: ${checks} passed, 0 failed (styled: ${styles ? "yes" : "no"})`);
} finally { await browser.close(); server.close(); fs.rmSync(work, { recursive: true, force: true }); }
