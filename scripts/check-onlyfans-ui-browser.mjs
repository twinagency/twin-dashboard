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
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
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
  const page = await browser.newPage({reducedMotion:"reduce"}), errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  const pages = ["overview", "accounts", "inbox", "campaigns", "content", "sales", "settings", "operations"];
  for (const width of [390, 430, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const section of pages) {
      await page.goto(`${origin}/onlyfans/${section}/`, { waitUntil: "load" });
      await page.getByRole("heading", { name: section === "inbox" ? "OnlyFans inbox" : section[0].toUpperCase() + section.slice(1), exact: true }).first().waitFor();
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
  check(await page.locator(".dashboard-sidebar").isVisible(), "Shared sidebar remains visible inside the inbox");
  check(await page.locator(".of-account-switcher").isVisible(), "Creator account names remain visible in the selector");
  check(await page.locator(".of-creator-rail").count()===0, "The fixed icon rail is replaced by the shared dashboard");
  const account=page.locator("[data-of-account-chip]").nth(1);
  const label=await account.getAttribute("aria-label");
  await account.click();
  const handle=label.match(/@(.+)$/)[1];
  check(await account.getAttribute("aria-pressed")==="true", "Account selection follows the requested creator");
  check(await page.locator(".of-account-copy small").filter({hasText:"@"+handle}).isVisible(), "Selected account handle stays visible");
  await page.getByRole("heading",{name:"Notes",exact:true}).waitFor();
  check(await page.getByRole("heading",{name:"Purchased media",exact:true}).isVisible(), "Fan panel keeps notes and purchase sections");
  check(await page.locator(".dashboard-sidebar").getByRole("link",{name:"Content",exact:true}).isVisible(), "Full workspace navigation remains visible");
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

  for(const brand of ["Twin","Moxy"]){
    for(const width of [390,1440]){
      await page.setViewportSize({width,height:1000});
      await page.goto(origin+"/onlyfans/inbox/?brand="+brand,{waitUntil:"load"});
      await page.locator("[data-of-conversation-id]").first().waitFor();
      if(width>=1024){
        check(await page.locator(".dashboard-sidebar").isVisible(),brand+": visible shared navigation");
        check(await page.locator(".dashboard-sidebar [data-channel-option] img").evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0)),brand+": real channel logos load");
        if(brand==="Moxy")check(await page.locator('.dashboard-sidebar img[alt^="Moxy"]').evaluate(img=>img.complete&&img.naturalWidth>0),"Moxy logo loads");
        check(await page.locator("[data-of-action=request_takeover]").isVisible(),brand+": manual takeover remains visible");
        const controlColors=await page.locator("[data-of-action=request_takeover]").evaluate(e=>({background:getComputedStyle(e).backgroundColor,foreground:getComputedStyle(e).color,opacity:getComputedStyle(e).opacity}));
        check(controlColors.background!==controlColors.foreground&&controlColors.background!=="rgba(0, 0, 0, 0)"&&controlColors.opacity==="1",brand+": takeover has visible text and a filled button");
      }
      const navigation = width >= 1024 ? page.locator(".dashboard-sidebar") : page.getByRole("dialog", {name:"Main navigation"});
      if (width < 1024) await page.getByRole("button", {name:"Open navigation",exact:true}).first().click();
      check((await navigation.locator("[data-channel-option]").evaluateAll(items=>items.map(item=>item.getAttribute("data-channel-option")))).join(",")==="all,telegram,onlyfans", brand+": all three channels on desktop and mobile");
      if (brand === "Moxy") {
        check(await navigation.locator('[data-channel-option="telegram"]').getAttribute("href")==="/revenue?workspace=telegram", "Moxy Telegram stays on the agency-scoped creator route");
        check(await navigation.locator('[data-channel-option="all"]').getAttribute("href")==="/revenue", "Moxy All channels stays on agency earnings");
        if (width < 1024) {
          check(await page.locator('.dashboard-mobile-header img[alt^="Moxy"]').getAttribute("src")==="/moxy/moxy-ai-dark.svg", "Moxy mobile bar uses the black wordmark");
          check(await page.locator('.dashboard-mobile-header button').first().evaluate(e=>getComputedStyle(e).color)==="rgb(17, 17, 17)", "Moxy mobile controls use black text");
        }
      }
      if (width < 1024) await navigation.getByRole("button", {name:"Close navigation",exact:true}).click();
      const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
      check(size.scroll<=size.width+1,brand+": no horizontal overflow at "+width);
      await page.screenshot({path:path.join(shots,brand.toLowerCase()+"-inbox-"+width+".png")});
    }
  }
  console.log(`OnlyFans UI synthetic browser: ${checks} assertions passed, 0 failed; 48 page/viewport cases. No live-account or provider acceptance.`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
