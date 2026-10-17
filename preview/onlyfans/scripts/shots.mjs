// Captures the OF-D0 review screenshots from the running preview.
//
// This is a verification artifact, not part of the product. It drives the
// preview the way a reviewer does: through the real shell's own navigation and
// the developer panel's presets, then captures. It never touches a provider, a
// database or any account.
//
//   node node_modules/next/dist/bin/next dev preview/onlyfans -p 3017
//   node preview/onlyfans/scripts/shots.mjs

import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchPreviewBrowser, PREVIEW_BASE } from "./chromium.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "shots");

const DESKTOP = { width: 1440, height: 1150 };
const MOBILE = { width: 390, height: 844 };

/** Wait until the fixture reads have run, which only happens after hydration. */
async function waitForHydration(page) {
  await page.locator("[data-of-account-chip]").first().waitFor({ state: "attached", timeout: 20000 });
}

/** The developer controls start collapsed, so a shot of them must open them. */
async function openControls(page) {
  const toggle = page.locator("[data-of-preview-controls] button[aria-expanded]").first();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if ((await toggle.getAttribute("aria-expanded")) === "true") {
      await page.locator("[data-of-preset='healthy']").waitFor({ state: "visible" });
      return;
    }
    await toggle.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(200);
  }
  throw new Error("the developer preview controls never opened");
}

async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
}

async function open(browser, viewport, path) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(PREVIEW_BASE + path, { waitUntil: "domcontentloaded" });
  await settle(page);
  return { context, page };
}

async function shot(page, name) {
  await settle(page);
  await page.screenshot({ path: join(out, name + ".png"), fullPage: false });
  console.log("captured " + name + ".png");
}

const browser = await launchPreviewBrowser();
await mkdir(out, { recursive: true });

// Desktop: the real shell, the OnlyFans channel, controls collapsed.
{
  const { context, page } = await open(browser, DESKTOP, "/onlyfans/inbox");
  await waitForHydration(page);
  await shot(page, "desktop-01-inbox");

  // Accounts shows every creator this session may read when no creator is
  // requested, and one creator's accounts when the URL names one. Both are
  // captured, because the scoped one is the case the page is designed around
  // and the unscoped one is what a bare sidebar click lands on.
  await page.goto(PREVIEW_BASE + "/onlyfans/accounts?creator=creator-ava-0001", {
    waitUntil: "domcontentloaded",
  });
  await page.locator("[data-of-surface='onlyfans-accounts']").waitFor();
  // The Accounts surface has cards, not the inbox's account chips, so the
  // resolved read is what proves hydration here.
  await page.locator("[data-of-account-id]").first().waitFor();
  await shot(page, "desktop-02-accounts");

  await page.goto(PREVIEW_BASE + "/onlyfans/accounts", { waitUntil: "domcontentloaded" });
  await page.locator("[data-of-account-id]").first().waitFor();
  await shot(page, "desktop-11-accounts-all-creators");

  await page.locator("[data-channel-link='of-inbox']").click();
  await waitForHydration(page);
  await openControls(page);

  await page.locator("[data-of-preset='unknown']").click();
  await page.locator("[data-of-incident]").first().waitFor();
  await shot(page, "desktop-03-unknown-delivery");

  await page.locator("[data-of-preset='readonly']").click();
  await page.locator("[data-of-readonly]").waitFor();
  await shot(page, "desktop-04-read-only");

  await page.locator("[data-of-preset='stale']").click();
  await page.locator("[data-of-state='warn']").first().waitFor();
  await shot(page, "desktop-05-stale");

  await page.locator("[data-of-preset='expired']").click();
  await page.locator("[data-channel-link='of-accounts']").click();
  await page.locator("[data-of-surface='onlyfans-accounts']").waitFor();
  await shot(page, "desktop-06-session-expired");

  // The channel switch, in the top bar, driving the real routes.
  await page.locator("[data-channel-switch] a[href='/overview']").click();
  await page.locator("[data-of-surface='combined-overview']").waitFor();
  await shot(page, "desktop-07-all-channels");

  await page.locator("[data-channel-switch] a[href='/telegram']").click();
  await page.locator("[data-of-surface='existing']").waitFor();
  await shot(page, "desktop-08-telegram-fans");

  // OnlyFans again: a second account under the same creator brings its own list
  // and thread, and the cursor path loads the rest.
  await page.locator("[data-channel-switch] a[href='/onlyfans/inbox']").click();
  await waitForHydration(page);
  await page.locator("[data-of-account-chip='of-acc-ava-005']").click();
  await page.locator("[data-of-conversation-id='of-conv-ava2-1101']").click();
  await shot(page, "desktop-09-second-account");

  await page.locator("[data-of-account-chip='of-acc-ava-001']").click();
  await page.locator("[data-of-load-more]").click();
  await page.getByRole("button", { name: "Load more conversations" }).waitFor({ state: "hidden" });
  await shot(page, "desktop-10-paginated");

  await context.close();
}

// Mobile: the same two surfaces, with the channel switch and the channel nav in
// the drawer the sidebar collapses into.
{
  const { context, page } = await open(browser, MOBILE, "/onlyfans/inbox");
  await waitForHydration(page);
  await shot(page, "mobile-01-inbox");

  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.locator("#mobile-sidebar").waitFor();
  await shot(page, "mobile-02-drawer");

  // Scoped to the drawer: the desktop sidebar is still in the DOM (hidden), so
  // an unscoped selector matches its copy of the same link too.
  await page.locator("#mobile-sidebar [data-channel-link='of-accounts']").click();
  await page.locator("[data-of-surface='onlyfans-accounts']").waitFor();
  await shot(page, "mobile-03-accounts");

  await context.close();
}

await browser.close();
console.log("screenshots in " + out);
