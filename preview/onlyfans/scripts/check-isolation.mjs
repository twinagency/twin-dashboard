// Browser-level checks for the OF-D0 preview.
//
// The pure selection checks in scripts/check-onlyfans-preview.ts prove the state
// transitions. These prove the rendered surface behaves, in a real browser,
// against the **real** dashboard shell:
//
//   * the shell         - the product's own sidebar, top bar and channel switch
//   * channel scoping   - the sidebar and the switch agree about the channel
//   * account isolation - switching accounts shows a different list and thread
//   * conversation draft - a half-written reply cannot follow you across
//   * unknown delivery  - no blind resend, an evidence path instead
//   * read-only viewer  - no mutation is reachable
//   * simulated send    - the send never claims a delivery
//   * empty reads       - an empty list or scope takes the stale thread with it
//   * mobile layout     - the drawer carries the switch and the channel nav
//   * preview logout    - the sign-out control is inert and reaches no action
//
// Every wait is on a real condition rather than a timeout, and every interaction
// waits for hydration first: the fixture reads run in an effect, so clicking
// server-rendered markup is silently a no-op that looks exactly like a broken
// control.
//
//   node node_modules/next/dist/bin/next dev preview/onlyfans -p 3017
//   node preview/onlyfans/scripts/check-isolation.mjs

import { launchPreviewBrowser, PREVIEW_BASE } from "./chromium.mjs";

const TIMEOUT = 20000;

let checks = 0;
let failures = 0;

function check(name, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log("  ok   " + name);
  } else {
    failures += 1;
    console.log("  FAIL " + name + (detail ? "\n       " + detail : ""));
  }
}

const browser = await launchPreviewBrowser();
const context = await browser.newContext({ viewport: { width: 1440, height: 1150 } });
const page = await context.newPage();

const composer = () => page.locator("[data-of-composer]");
const conversation = (id) => page.locator("[data-of-conversation-id='" + id + "']");
const accountChip = (id) => page.locator("[data-of-account-chip='" + id + "']");
const action = (name) => page.locator("[data-of-action='" + name + "']");
const controlsToggle = () => page.locator("[data-of-preview-controls] button[aria-expanded]").first();
const sidebar = () => page.locator("aside.dashboard-sidebar");
const channelLink = (key) => page.locator("[data-channel-link='" + key + "']");

/** The fixture reads run in an effect, so their output proves hydration. */
async function waitForHydration(target = page) {
  await target.locator("[data-of-account-chip]").first().waitFor({ state: "attached", timeout: TIMEOUT });
}

/** The controls start collapsed, so the presets are not in the DOM until opened. */
async function ensureControlsOpen() {
  const toggle = controlsToggle();
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if ((await toggle.getAttribute("aria-expanded")) === "true") {
      await page.locator("[data-of-preset='healthy']").waitFor({ state: "visible", timeout: TIMEOUT });
      return;
    }
    await toggle.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(200);
  }
  throw new Error("the developer preview controls never opened");
}

async function waitForConversation(id) {
  await conversation(id).waitFor({ state: "visible", timeout: TIMEOUT });
}

async function waitForComposerValue(expected) {
  await page.waitForFunction(
    (value) => document.querySelector("[data-of-composer]")?.value === value,
    expected,
    { timeout: TIMEOUT },
  );
}

async function waitForCount(selector, expected) {
  await page.waitForFunction(
    ([sel, count]) => document.querySelectorAll(sel).length === count,
    [selector, expected],
    { timeout: TIMEOUT },
  );
}

async function waitForSendDisabled(disabled) {
  await page.waitForFunction(
    (want) => document.querySelector("[data-of-send]")?.disabled === want,
    disabled,
    { timeout: TIMEOUT },
  );
}

await page.goto(PREVIEW_BASE + "/onlyfans/inbox", { waitUntil: "domcontentloaded" });
await waitForHydration();

console.log("\nThe real dashboard shell");
check("the product's own sidebar is rendered", await sidebar().isVisible());
check("the top bar carries the channel switch", (await page.locator("[data-channel-switch]").count()) === 1);
check(
  "and it marks OnlyFans as the current channel",
  (await page.locator("[data-channel-switch]").getAttribute("data-channel-switch")) === "onlyfans",
);
const topBarText = await page.locator(".dashboard-topbar").innerText();
check(
  "the Telegram Stars pill is withheld on the OnlyFans channel",
  !topBarText.includes("\u{1F4B5}"),
  topBarText.replace(/\s+/g, " ").slice(0, 160),
);
check(
  "the sidebar is scoped to the OnlyFans channel",
  (await channelLink("of-inbox").count()) === 1 &&
    (await channelLink("of-accounts").count()) === 1 &&
    // Scoped to <nav>: the wordmark above it also links to the dashboard root.
    (await sidebar().locator("nav a[href='/revenue']").count()) === 0,
);
check(
  "a planned channel entry is inert text, not a control",
  (await page.locator("[data-channel-link='of-content']").count()) === 0,
);

console.log("\nDeveloper controls");
check(
  "the developer preview controls start collapsed",
  (await controlsToggle().getAttribute("aria-expanded")) === "false",
);
check(
  "so the preset buttons are not in the page until it is opened",
  (await page.locator("[data-of-preset='healthy']").count()) === 0,
);
await ensureControlsOpen();
check("opening the panel reveals the presets", (await page.locator("[data-of-preset='healthy']").count()) === 1);

console.log("\nAccount isolation");
await waitForConversation("of-conv-ava-1001");
check("the first account lists its own conversations", true);

await accountChip("of-acc-ava-005").click();
await waitForConversation("of-conv-ava2-1101");
check("switching accounts loads the second account's list", true);
check("the first account's conversation is gone from the list", (await conversation("of-conv-ava-1001").count()) === 0);

console.log("\nDraft isolation");
await conversation("of-conv-ava2-1101").click();
await composer().waitFor({ timeout: TIMEOUT });
await composer().fill("a draft that must not travel");
await waitForComposerValue("a draft that must not travel");
check("the draft is in the composer", true);

await conversation("of-conv-ava2-1102").click();
await waitForComposerValue("");
check("switching conversation clears the draft", true);

await accountChip("of-acc-ava-001").click();
await waitForConversation("of-conv-ava-1001");
await waitForComposerValue("");
check("switching account clears the draft", true);

console.log("\nUnknown delivery holds the send");
await ensureControlsOpen();
await page.locator("[data-of-preset='unknown']").click();
await page.locator("[data-of-incident]").first().waitFor({ timeout: TIMEOUT });
await waitForSendDisabled(true);
check("the send control is disabled while delivery is unresolved", true);
await waitForCount("[data-of-action='resolve_delivery_evidence']", 1);
check("the evidence path is offered instead", true);
check("no resend control exists", (await action("send_manual_message").count()) === 0);
check(
  "and the withholdings are named",
  // innerText reflects CSS text-transform, and the heading is uppercased.
  (await page.locator("body").innerText()).toLowerCase().includes("not available here"),
);

console.log("\nRead-only viewer");
await page.locator("[data-of-preset='readonly']").click();
await page.locator("[data-of-readonly]").waitFor({ timeout: TIMEOUT });
await waitForSendDisabled(true);
check("the read-only banner is shown", (await page.locator("[data-of-readonly]").count()) === 1);
check("the composer is disabled", await composer().isDisabled());
await waitForCount("[data-of-action]", 0);
check("no action control is offered", true);
check(
  "the read-only reason is stated",
  (await page.locator("body").innerText()).toLowerCase().includes("read only view"),
);

console.log("\nSimulated send");
await page.locator("[data-of-preset='healthy']").click();
await waitForConversation("of-conv-ava-1001");
await composer().waitFor({ state: "visible", timeout: TIMEOUT });

// The typed text is part of the modelled command now, so an empty composer is
// refused rather than silently sending nothing.
await page.locator("[data-of-send]").click();
await page.locator("[data-of-command-accepted='false']").waitFor({ state: "visible", timeout: TIMEOUT });
const refusedText = (await page.locator("[data-of-command-result]").innerText()).replace(/\s+/g, " ");
check("an empty message is refused before submission", /refused before submission/i.test(refusedText), refusedText.slice(0, 200));
check("and the refusal names the missing text", /needs some text/i.test(refusedText), refusedText.slice(0, 200));

const deliveriesBefore = await page
  .locator("[data-of-message-delivery]")
  .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-of-message-delivery")));
await composer().fill("A preview reply that must not be sent");
await waitForComposerValue("A preview reply that must not be sent");
await page.locator("[data-of-send]").click();
await page.locator("[data-of-command-accepted='true']").waitFor({ state: "visible", timeout: TIMEOUT });
const resultText = (await page.locator("[data-of-command-result]").innerText()).replace(/\s+/g, " ");
check("the send reports that nothing was performed", /modelled, not performed/i.test(resultText), resultText.slice(0, 160));
check("the result says nothing was sent", /no message was sent/i.test(resultText), resultText.slice(0, 160));
check("the result still names the account it was scoped to", resultText.includes("of-acc-ava-001"), resultText.slice(0, 200));
const deliveriesAfter = await page
  .locator("[data-of-message-delivery]")
  .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-of-message-delivery")));
check(
  "no message's delivery state changes",
  JSON.stringify(deliveriesBefore) === JSON.stringify(deliveriesAfter),
  deliveriesBefore.join(",") + " -> " + deliveriesAfter.join(","),
);
const ledgerIds = await page
  .locator("[data-of-delivery-row]")
  .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-of-delivery-row")));
const bubbleIds = await page
  .locator("[data-of-thread] [data-of-message-id]")
  .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-of-message-id")));
check(
  "every outbound bubble has its own receipt in the delivery list",
  ledgerIds.length > 0 && ledgerIds.every((id) => bubbleIds.includes(id)),
  ledgerIds.join(",") + " vs " + bubbleIds.join(","),
);

console.log("\nAn empty read clears what it cannot vouch for");
await page.locator("[data-of-preset='healthy']").click();
await waitForConversation("of-conv-ava-1001");
await composer().waitFor({ state: "visible", timeout: TIMEOUT });
check("a conversation is open with a composer", true);

await page.locator("[data-of-preset='empty']").click();
await composer().waitFor({ state: "detached", timeout: TIMEOUT });
check("an empty inbox takes the old thread's composer with it", true);
await waitForCount("[data-of-conversation-id]", 0);
check("and leaves no conversation selectable", true);
await waitForCount("[data-of-action]", 0);
check("and leaves no action control behind", true);

await page.locator("[data-of-preset='healthy']").click();
await waitForConversation("of-conv-ava-1001");
await composer().waitFor({ state: "visible", timeout: TIMEOUT });
await ensureControlsOpen();
await page.locator("select[data-of-control='accountsRead']").selectOption("empty");
await composer().waitFor({ state: "detached", timeout: TIMEOUT });
check("an empty account scope takes the thread and its composer with it", true);
await waitForCount("[data-of-account-chip]", 0);
check("and leaves no account to select", true);

await ensureControlsOpen();
await page.locator("select[data-of-control='accountsRead']").selectOption("live");
await waitForConversation("of-conv-ava-1001");
check("and the surface comes back when the scope returns", true);

console.log("\nChannel navigation");
await channelLink("of-accounts").click();
await page.locator("[data-of-surface='onlyfans-accounts']").waitFor({ state: "visible", timeout: TIMEOUT });
check("the sidebar opens OnlyFans Accounts", true);
check(
  "the breadcrumb follows the route",
  (await page.locator(".dashboard-topbar h1").innerText()).includes("Accounts"),
);
check(
  "and the page uses the dashboard's own header and cards",
  (await page.locator("[data-of-surface='onlyfans-accounts'] h1").innerText()) === "Accounts" &&
    (await page.locator("[data-of-surface='onlyfans-accounts'] [data-slot='card']").count()) > 3,
);

await page.locator("[data-channel-switch] a[href='/overview']").click();
await page.locator("[data-of-surface='combined-overview']").waitFor({ state: "visible", timeout: TIMEOUT });
check("the channel switch opens All channels", true);
check(
  "and the sidebar returns to the operator navigation",
  (await sidebar().locator("nav a[href='/revenue']").count()) === 1 &&
    (await channelLink("of-inbox").count()) === 0,
);

await page.locator("[data-channel-switch] a[href='/telegram']").click();
await page.locator("[data-of-surface='existing']").waitFor({ state: "visible", timeout: TIMEOUT });
check(
  "the Telegram channel points at the existing Fans and Messages screen",
  (await page.locator("body").innerText()).includes("/users"),
);
check(
  "the Stars pill is back where Stars are real money",
  (await page.locator(".dashboard-topbar").innerText()).includes("\u{1F4B5}"),
);

await page.locator("[data-channel-switch] a[href='/onlyfans/inbox']").click();
await waitForHydration();
check("and OnlyFans opens its own inbox again", (await page.locator("[data-of-surface='onlyfans-inbox']").count()) === 1);

console.log("\nAccount scope in the URL");
{
  // The selected account is a request carried in the URL, so a link can open a
  // specific account and a reload lands back on it.
  const SECOND = "of-acc-ava-005";
  await page.locator("[data-of-account-chip='" + SECOND + "']").click();
  await page.waitForFunction(
    (id) => window.location.search.includes("account=" + id),
    SECOND,
    { timeout: TIMEOUT },
  );
  check("selecting an account writes it into the URL", page.url().includes("account=" + SECOND));
  check(
    "and the chip is the one marked selected",
    (await page.locator("[data-of-account-chip='" + SECOND + "']").getAttribute("aria-pressed")) === "true",
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForHydration();
  check(
    "reloading that URL reopens the same account",
    (await page.locator("[data-of-account-chip='" + SECOND + "']").getAttribute("aria-pressed")) === "true",
  );
  check(
    "and the inbox shows that account's own conversations",
    (await page.locator("[data-of-conversation-id]").count()) > 0,
  );

  // Accounts -> inbox carries the scope, so the link opens the account it names.
  await page.locator("[data-channel-link='of-accounts']").first().click();
  await page.locator("[data-of-surface='onlyfans-accounts']").waitFor({ state: "visible", timeout: TIMEOUT });
  const openInbox = page.locator("[data-of-open-inbox='" + SECOND + "']");
  check("the Accounts card offers an inbox for that account", (await openInbox.count()) === 1);
  const href = await openInbox.getAttribute("href");
  check(
    "and the link carries both the creator and the account",
    typeof href === "string" && href.includes("account=" + SECOND) && href.includes("creator="),
    String(href),
  );
  await openInbox.click();
  await page.locator("[data-of-surface='onlyfans-inbox']").waitFor({ state: "visible", timeout: TIMEOUT });
  await waitForHydration();
  check(
    "following it opens that account rather than the default one",
    (await page.locator("[data-of-account-chip='" + SECOND + "']").getAttribute("aria-pressed")) === "true",
  );

  // An id the read did not return selects nothing, and the URL is corrected
  // rather than left claiming to show an account it is not showing.
  await page.goto(PREVIEW_BASE + "/onlyfans/inbox?account=of-acc-does-not-exist&creator=creator-ava-0001", {
    waitUntil: "domcontentloaded",
  });
  await waitForHydration();
  await page.waitForFunction(() => !window.location.search.includes("does-not-exist"), null, {
    timeout: TIMEOUT,
  });
  check(
    "an account that was not authorized is dropped from the URL",
    !page.url().includes("does-not-exist"),
    page.url(),
  );
  check(
    "and the surface opens an account it was actually given",
    (await page.locator("[data-of-account-chip][aria-pressed='true']").count()) === 1,
  );

  // A creator scope the read returned nothing for shows an empty scope, not
  // another creator's accounts.
  await page.goto(PREVIEW_BASE + "/onlyfans/inbox?creator=creator-does-not-exist", {
    waitUntil: "domcontentloaded",
  });
  // No account arrives for that creator, so hydration is proven by the empty
  // state replacing the loading one rather than by an account chip appearing.
  await page.locator("[data-of-state='neutral']").first().waitFor({ state: "visible", timeout: TIMEOUT });
  check(
    "a creator with no authorized account has no account chips",
    (await page.locator("[data-of-account-chip]").count()) === 0,
  );
  check(
    "and the surface says the scope is empty rather than failed",
    (await page.locator("[data-of-state='crit']").count()) === 0,
  );
}

console.log("\nPreview logout isolation");
{
  // The preview mounts the real top bar, so it renders the real sign-out
  // control's markup. It must not be able to reach the action behind it: a
  // fixture surface that cleared a real session would be the worst kind of
  // pretend control.
  const signOut = page.locator("[data-of-signout='simulated']");
  check("the preview renders the sign-out control", (await signOut.count()) === 1);
  check(
    "and it is the simulated one, not the live one",
    (await page.locator("[data-of-signout='live']").count()) === 0,
  );
  check("it is disabled, so it cannot submit", await signOut.isDisabled());
  check(
    "no form in the preview posts to a logout route",
    (await page.locator("form[action*='logout']").count()) === 0,
  );
  check(
    "and the top bar carries no other enabled submit",
    (await page.locator(".dashboard-topbar form button[type='submit']:not([disabled])").count()) === 0,
  );

  const before = page.url();
  await signOut.click({ force: true, timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  check("clicking it does not navigate anywhere", page.url() === before, page.url());
  check(
    "and the preview is still on the same surface, signed in as an operator",
    (await page.locator("[data-of-surface='onlyfans-inbox']").count()) === 1,
  );
}

console.log("\nMobile layout");
const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mobile = await mobileContext.newPage();
await mobile.goto(PREVIEW_BASE + "/onlyfans/inbox", { waitUntil: "domcontentloaded" });
await waitForHydration(mobile);
check(
  "the desktop sidebar is not rendered at 390px",
  (await mobile.locator("aside.dashboard-sidebar").isVisible()) === false,
);

await mobile.getByRole("button", { name: "Open navigation" }).click();
await mobile.locator("#mobile-sidebar").waitFor({ state: "visible", timeout: TIMEOUT });
check("the hamburger opens the product's own navigation drawer", true);
check(
  "the drawer carries the channel switch",
  (await mobile.locator("#mobile-sidebar [data-channel-switch]").count()) === 1,
);
check(
  "and the channel's own navigation, which only the sidebar used to own",
  (await mobile.locator("#mobile-sidebar [data-channel-link='of-accounts']").count()) === 1,
);

await mobile.locator("#mobile-sidebar [data-channel-link='of-accounts']").click();
await mobile.locator("[data-of-surface='onlyfans-accounts']").waitFor({ state: "visible", timeout: TIMEOUT });
check("and opens Accounts on a phone", true);

const overflow = await mobile.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
check("nothing overflows the 390px viewport horizontally", overflow <= 1, "overflow " + overflow + "px");

const badge = await mobile.evaluate(() => {
  const node = document.querySelector("[data-of-preview-badge]");
  if (!node) return "missing";
  const rect = node.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return "hidden";
  const right = document.documentElement.clientWidth;
  return rect.left >= -1 && rect.right <= right + 1 ? "inside" : "outside " + Math.round(rect.right) + " > " + right;
});
check("the sample-data badge stays inside the phone viewport", badge === "inside", badge);
await mobileContext.close();

await context.close();
await browser.close();

console.log("\n" + (checks - failures) + "/" + checks + " browser checks passed");
if (failures > 0) {
  console.error("\n" + failures + " browser check(s) failed.");
  process.exit(1);
}
console.log("OF-D0 browser checks passed.");
