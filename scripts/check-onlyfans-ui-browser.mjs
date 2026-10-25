/** Shared production presentation with synthetic data only; real API acceptance is separate. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, ".."), dist = path.join(root, "preview/onlyfans-ui/dist");
const shots = process.env.ONLYFANS_UI_ARTIFACT_DIR || path.join(root, "test-results/onlyfans-ui");
await fs.mkdir(shots, { recursive: true });
let checks = 0;
const check = (condition, message) => { assert(condition, message); checks++; };
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost"), candidate = path.resolve(dist, "." + decodeURIComponent(url.pathname));
    if (candidate !== dist && !candidate.startsWith(dist + path.sep)) throw new Error("path");
    const stat = await fs.stat(candidate), file = stat.isDirectory() ? path.join(candidate, "index.html") : candidate;
    response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(await fs.readFile(file));
  } catch { response.writeHead(404); response.end("Not found"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PREVIEW_CHROME ? { executablePath: process.env.PREVIEW_CHROME } : {}), args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage(), errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  const pages = ["overview", "accounts", "inbox", "campaigns", "content", "sales", "settings", "operations"];
  for (const width of [390, 430, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const section of pages) {
      await page.goto(`${origin}/onlyfans/${section}/`, { waitUntil: "load" });
      await page.getByRole("heading", { name: section[0].toUpperCase() + section.slice(1), exact: true }).first().waitFor();
      if (section === "accounts") await page.locator("[data-of-account-id]").first().waitFor();
      if (section === "inbox") await page.locator("[data-of-conversation-id]").first().waitFor();
      if (section === "settings") await page.locator("[data-of-edit-persona]").waitFor();
      const sizing = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth, main: document.querySelector("main")?.scrollWidth }));
      check(sizing.page <= sizing.viewport + 1, `${section} overflows at ${width}px: ${JSON.stringify(sizing)}`);
      if (section === "inbox" && width >= 1024) {
        const chat = await page.locator(".users-panel-chat").boundingBox();
        const fan = await page.locator(".users-panel-profile").boundingBox();
        const composer = await page.locator("[data-of-composer]").boundingBox();
        check(!!chat && !!fan && fan.x >= chat.x + chat.width - 1 && Math.abs(fan.y - chat.y) < 1, `Fan sidebar remains beside the conversation at ${width}px`);
        check(!!composer && composer.y + composer.height <= 1000, `Reply box stays inside the viewport at ${width}px`);
        check(await page.locator("[data-of-action=request_takeover]").isVisible(), `Manual takeover remains visible at ${width}px`);
        check(await page.locator("[data-of-action=pause_automation]").isVisible(), `Pause AI remains visible at ${width}px`);
      }
      await page.screenshot({ path: path.join(shots, `${width}-${section}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + "/onlyfans/inbox/", {waitUntil:"load"});
  await page.locator("[data-of-conversation-id]").first().waitFor();
  check(!await page.locator(".dashboard-sidebar").isVisible(), "Wide sidebar is replaced inside the inbox");
  check(await page.locator(".of-creator-rail").isVisible(), "Creator rail is visible");
  const rail=await page.locator(".of-creator-rail").boundingBox();
  check(rail.width===56 && rail.x===0, "Creator rail uses the reference width");
  check(await page.locator(".users-panel-list [data-of-account-chip]").count()===0, "Account cards no longer duplicate the rail inside the inbox");
  const account=page.locator("[data-of-account-chip]").nth(1);
  const label=await account.getAttribute("aria-label");
  await account.click();
  const handle=label.match(/@(.+)$/)[1];
  await page.locator(".of-inbox-active-creator small").filter({hasText:"@"+handle}).waitFor();
  check(await page.locator(".of-inbox-active-creator small").innerText()==="@"+handle, "Header follows the selected account");
  await page.getByRole("heading",{name:"Notes",exact:true}).waitFor();
  check(await page.getByRole("heading",{name:"Recent purchases",exact:true}).isVisible(), "Fan panel keeps notes and purchase sections");
  await page.getByLabel("Workspace navigation",{exact:true}).click();
  check(await page.getByRole("navigation",{name:"OnlyFans workspace",exact:true}).getByRole("link",{name:"Content",exact:true}).isVisible(), "Full workspace navigation remains reachable");
  await page.getByLabel("Workspace navigation",{exact:true}).click();
  await page.setViewportSize({width:390,height:1000});
  await page.locator("[data-of-mobile-panel=controls]").click();
  check(await page.locator(".users-panel-profile").isVisible(), "Mobile fan panel remains reachable");
  await page.locator("[data-of-mobile-panel=chat]").click();
  check(await page.locator("[data-of-composer]").isVisible(), "Mobile composer remains reachable");
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(`${origin}/onlyfans/settings/`, { waitUntil: "load" });
  await page.locator("[data-of-edit-persona]").fill("Retained unsaved synthetic persona");
  await page.getByRole("tab", { name: "Reply settings", exact: true }).click();
  await page.locator("[data-of-edit-budget]").fill("125");
  await page.locator("[data-of-edit-reasoning]").selectOption("medium");
  await page.getByRole("tab", { name: "Account", exact: true }).click();
  await page.getByRole("tab", { name: "Personality", exact: true }).click();
  check(await page.locator("[data-of-edit-persona]").inputValue() === "Retained unsaved synthetic persona", "Persona edits survive presentation tabs");
  await page.getByRole("tab", { name: "Reply settings", exact: true }).click();
  check(await page.locator("[data-of-edit-budget]").inputValue() === "125", "Native budget edit survives presentation tabs");
  check(await page.locator("[data-of-edit-reasoning]").inputValue() === "medium", "Native reasoning edit survives presentation tabs");
  await page.getByRole("tab", { name: "Reply settings", exact: true }).focus(); await page.keyboard.press("Home");
  check(await page.getByRole("tab", { name: "Personality", exact: true }).getAttribute("aria-selected") === "true", "Keyboard Home selects and focuses the first tab");
  check(await page.getByRole("link", { name: "Launch control", exact: true }).count() > 0, "Native launch controls remain directly reachable");
  await page.goto(`${origin}/onlyfans/sales/`, { waitUntil: "load" });
  await page.getByRole("tab", { name: "Open offers (1)", exact: true }).click();
  check(await page.locator("[data-of-open-offers]").isVisible(), "Open offers remain separate from payments");
  await page.getByRole("tab", { name: "Transactions", exact: true }).click();
  check(await page.getByText("Pending", { exact: true }).first().isVisible(), "Pending payments keep their actual state");
  const refused = await page.evaluate(async () => (await fetch("/api/onlyfans-configuration/accounts/synthetic", { method: "POST", body: "{}" })).status);
  check(refused === 403, "Synthetic review refuses every external mutation");
  check(errors.length === 0, `Browser errors: ${errors.join("; ")}`);
  console.log(`OnlyFans UI synthetic browser: ${checks} assertions passed, 0 failed; 48 page/viewport cases. No live-account or provider acceptance.`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
