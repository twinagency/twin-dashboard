import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
/** Real native components with synthetic BFF responses. This is not integrated/live acceptance. */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  require = createRequire(path.join(root, "package.json"));
const { build } = require("esbuild"),
  { chromium } = require("playwright"),
  work = fs.mkdtempSync(path.join(os.tmpdir(), "native-launch-browser-"));
let checks = 0;
const ok = (v, msg) => {
  assert(v, msg);
  checks++;
};
const stamp = "2026-10-23T05:00:00Z",
  hash = "a".repeat(64),
  binding = "binding-b";
const empty = {
  version: "of-personality.v1",
  state: "empty",
  revision: 0,
  bindingId: binding,
  document: null,
};
const draft = {
  version: "of-personality.v1",
  state: "draft",
  revision: 1,
  bindingId: binding,
  document: {
    source: "canonical_history",
    review: {},
    draft: {
      creatorFacts: [],
      writingStyle: [],
      operationalInstructions: [],
      suggestedPersona: {
        text: "Short, warm replies.",
        attribution: "unknown",
        evidenceIds: [],
        selected: false,
        requiresReview: true,
        basis: "observed_account_style",
        warning: "Account authorship may be mixed.",
      },
      evidence: [],
      coverage: {
        inputMessages: 20,
        uniqueMessages: 20,
        sampledMessages: 20,
        authorship: { creator: 0, agency: 0, unknown: 20, automation: 0 },
        method: "bounded sample",
        limitations: ["Not full provider history."],
      },
    },
  },
  configurationRevision: 3,
  configurationCurrent: true,
  configurationFingerprint: hash,
  conflicts: [],
  requiresFactResolution: [],
  factComparisons: [],
  readiness: {
    ready: false,
    reviewRequired: true,
    blockers: ["credential_missing"],
    model: {
      state: "ready",
      modelId: "deepseek-chat",
      provider: "deepseek",
      reasoningEffort: { state: "default", saved: null, resolved: null },
    },
    credential: {
      state: "missing",
      configured: false,
      metadataAvailable: true,
    },
    budget: { state: "ready", dailyCostCapCents: 100 },
    tone: { state: "ready", conflicts: [], reviewRequired: true },
  },
  createdAt: stamp,
  actor: "op:1",
  commandKey: hash,
};
const readiness = {
  readinessVersion: "of-launch-readiness.v1",
  observedAt: stamp,
  schemaRevision: "0091_launch_operations",
  readyToEnable: false,
  checks: [
    {
      key: "schema",
      status: "ready",
      blocking: true,
      observedAt: stamp,
      blocker: null,
      action: null,
    },
    {
      key: "ledger",
      status: "blocked",
      blocking: true,
      observedAt: stamp,
      blocker: "ledger_held_or_stale",
      action: "ledger",
    },
  ],
  accountControl: {
    enabled: false,
    bindingId: binding,
    revision: 0,
    unresolvedOutgoing: 1,
    fingerprint: hash,
  },
  coverage: {
    storedMessages: 120,
    processedMessages: 100,
    providerTotalMessages: null,
    archiveComplete: false,
    pendingArchiveConversations: 2,
  },
  catalogue: { usableInspectedItems: 1, inspectedItems: 2, hasMore: false },
  autonomy: {
    accountEnabled: false,
    deliveryEnabled: false,
    existingAutomatedConversations: 0,
    automateNewConversations: false,
    engagementEnabled: false,
    workerCapabilities: { engagement: false },
  },
  limits: [
    "English-pattern historical facts and lexical source retrieval.",
    "Provider history total remains unknown.",
  ],
};
const ledger = {
  ledgerVersion: "of-ledger.v1",
  observedAt: stamp,
  bindingCurrent: true,
  status: "running",
  windowStart: stamp,
  windowEnd: stamp,
  pageOffset: 40,
  lastCompleteAt: null,
  lastFullAt: null,
  leaseUntil: stamp,
  activeLease: false,
  nextPollAt: stamp,
  lastError: "invalid_page",
  updatedAt: stamp,
  fresh: false,
  unresolvedTransactions: 1,
  conflictingEvidence: 1,
  commerceHold: true,
  fingerprint: hash,
  evidence: [
    {
      evidenceHash: hash,
      providerTransactionId: "provider-tx",
      fanId: "9007199254740993",
      transactionId: "12",
      messageId: "4",
      amountCents: 1999,
      currency: "USD",
      status: "cleared",
      outcome: "conflict",
      resolved: false,
      recordedAt: stamp,
      supportedAction: "reconcile_evidence",
      blocker: null,
    },
  ],
  nextCursor: null,
};
const canonicalLedger = {
  schemaVersion: "of-ledger.v1", accountId: "acc-b", status: "held",
  windowStart: stamp, windowEnd: stamp, pageOffset: 40, lastCompleteAt: null,
  lastFullAt: null, nextPollAt: stamp, lastError: "ledger_read_failed",
  leaseActive: false, connectionCurrent: true, connectionRevision: 4,
  conflictCount: 1, unlinkedPaidCount: 1, requiresInvestigation: true,
  commerceHeld: true, scanFingerprint: hash,
};
const state = {
  delayA: 1000,
  manage: false,
  deny: false,
  personality: structuredClone(empty),
  posts: [],
  lost: false,
  commands: new Set(),
};
const env = (accountId, data) => ({
  schemaVersion: "of-launch.v1",
  ok: true,
  accountId,
  data,
});
async function main() {
  fs.writeFileSync(
    path.join(work, "entry.tsx"),
    'import{createRoot}from"react-dom/client";import{StrictMode}from"react";import AbcWorkspace from"@/components/onlyfans-launch/AbcWorkspace";createRoot(document.getElementById("root")!).render(<StrictMode><AbcWorkspace/></StrictMode>);',
  );
  fs.writeFileSync(
    path.join(work, "nav.ts"),
    'export const useRouter=()=>({refresh(){},push(){},replace(){}});export const usePathname=()=>"/";export const useSearchParams=()=>new URLSearchParams();',
  );
  await build({
    entryPoints: [path.join(work, "entry.tsx")],
    bundle: true,
    outfile: path.join(work, "app.js"),
    jsx: "automatic",
    format: "iife",
    define: { "process.env.NODE_ENV": '"development"' },
    logLevel: "error",
    nodePaths: [path.join(root, "node_modules")],
    absWorkingDir: root,
    alias: { "@": root, "next/navigation": path.join(work, "nav.ts") },
    loader: { ".css": "empty" },
  });
  let css = "";
  try {
    const postcss = require("postcss"),
      tailwind = require("@tailwindcss/postcss");
    css = (
      await postcss([tailwind({ base: root })]).process(
        fs.readFileSync(path.join(root, "app/globals.css"), "utf8"),
        { from: path.join(root, "app/globals.css") },
      )
    ).css;
  } catch (e) {
    console.warn("CSS unavailable", e.message);
  }
  fs.writeFileSync(path.join(work, "app.css"), css);
  const server = http.createServer((req, res) => {
    if (req.url === "/app.js" || req.url === "/app.css") {
      res.setHeader(
        "content-type",
        req.url.endsWith("js") ? "text/javascript" : "text/css",
      );
      return res.end(fs.readFileSync(path.join(work, req.url.slice(1))));
    }
    res.end(
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>',
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    ...(process.env.PREVIEW_CHROME
      ? { executablePath: process.env.PREVIEW_CHROME }
      : {}),
  });
  try {
    const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
      }),
      external = [],
      errors = [];
    await context.route("**/*", async (route) => {
      const u = new URL(route.request().url());
      if (!u.href.startsWith(origin)) {
        external.push(u.href);
        return route.abort();
      }
      if (!u.pathname.startsWith("/api/")) return route.continue();
      const json = (body, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      if (u.pathname === "/api/onlyfans/accounts")
        return json({
          accounts: ["acc-a", "acc-b"].map((accountId) => ({
            accountId,
            binding: { creatorName: accountId, handle: accountId },
            health: "connected",
            automationMode: "paused",
          })),
        });
      const m = u.pathname.match(
        /^\/api\/onlyfans-launch\/abc\/accounts\/([^/]+)\/(.+)$/,
      );
      if (!m)
        return json(
          {
            ok: false,
            error:
              "Configuration not available in this synthetic transport test.",
          },
          503,
        );
      const [, account, resource] = m;
      if (state.deny) return json({ ok: false, error: "Session denied" }, 401);
      if (resource === "access")
        return json(env(account, { canManage: state.manage }));
      if (account === "acc-a") {
        await new Promise((r) => setTimeout(r, state.delayA));
        return json(
          {
            ok: false,
            outcome: "unavailable",
            error: "Account backend unavailable",
          },
          503,
        );
      }
      if (route.request().method() === "POST") {
        const command = route.request().postDataJSON();
        state.posts.push(command);
        const commandKey = JSON.stringify(command),
          replay = state.commands.has(commandKey);
        if (!replay) {
          if (command.path === "personality/import")
            state.personality = {
              ...structuredClone(draft),
              revision: state.personality.revision + 1,
            };
          if (command.path === "personality/review")
            state.personality = {
              ...state.personality,
              revision: state.personality.revision + 1,
              document: {
                ...state.personality.document,
                review: command.body.review,
              },
            };
          if (command.path === "personality/approve")
            state.personality = {
              ...state.personality,
              revision: state.personality.revision + 1,
              state: "approved",
              document: { ...state.personality.document, approval: { acknowledgements: command.body.acknowledgements, configurationCommandKey: hash, appliedConfigurationRevision: 4 } },
            };
          if (command.path === "ledger/resolve")
            ledger.evidence[0].resolved = true;
          state.commands.add(commandKey);
        }
        if (state.lost) {
          state.lost = false;
          return json(
            {
              ok: false,
              outcome: "unconfirmed",
              error: "Lost acknowledgement, read current state.",
            },
            502,
          );
        }
        return json(env(account, {}));
      }
      if (resource === "personality/history")
        return json(
          env(account, {
            revisions: state.personality.revision
              ? [
                  {
                    revision: state.personality.revision,
                    state: state.personality.state,
                    actor: "op:1",
                    createdAt: stamp,
                  },
                ]
              : [],
            nextBefore: null,
          }),
        );
      if (resource.startsWith("personality/revisions/"))
        return json(env(account, state.personality));
      return json(
        env(
          account,
          resource === "readiness"
            ? readiness
            : resource === "purchases"
              ? canonicalLedger
              : resource === "purchases/evidence" ? ledger : state.personality,
        ),
      );
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const shots =
      process.env.ONLYFANS_LAUNCH_A_ARTIFACT_DIR ??
      path.join(root, "test-results", "onlyfans-native-a");
    fs.mkdirSync(shots, { recursive: true });
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.locator("#launch-account").waitFor();
    await page.locator("#launch-account").selectOption("acc-b");
    await page.locator('[data-blocker="schema"]').waitFor();
    await page.waitForTimeout(1200);
    ok(
      (await page.locator('[data-blocker="schema"]').count()) === 1,
      "stale account response ignored",
    );
    ok(
      (await page
        .getByText("Provider history total", { exact: true })
        .count()) === 1,
      "provider total remains separate",
    );
    ok(
      (await page.getByText("Account runtime", { exact: true }).count()) === 1,
      "actual runtime state visible",
    );
    await page.locator("#launch-account").selectOption("acc-a");
    await page.getByRole("alert").first().waitFor();
    ok(
      (await page.locator("[data-launch-fixture]").count()) === 0,
      "unavailable backend has no sample fallback",
    );
    state.delayA = 0;
    state.manage = true;
    await page.locator("#launch-account").selectOption("acc-b");
    await page.getByRole("tab", { name: /A\. Readiness/ }).focus();
    await page.keyboard.press("ArrowRight");
    await page
      .getByText("Purchase ledger and recovery", { exact: true })
      .waitFor();
    ok(
      (await page.getByText("19.99 USD", { exact: true }).count()) === 1,
      "exact cents retained",
    );
    await page
      .getByLabel("Investigation reason")
      .fill("Verified provider transaction matches canonical message");
    await page
      .getByRole("button", { name: "Reconcile verified transaction evidence" })
      .click();
    await page.getByText(/provider-tx.*reconciled/).waitFor();
    ok(
      state.posts.at(-1).path === "ledger/resolve" &&
        !("resolution" in state.posts.at(-1).body),
      "no arbitrary ownership write",
    );
    await page.getByRole("tab", { name: /C\. Personality/ }).click();
    await page
      .getByRole("button", { name: "Import a review draft from history" })
      .waitFor();
    await page
      .getByRole("button", { name: "Import a review draft from history" })
      .click();
    await page.getByLabel("Reviewed tone", { exact: true }).waitFor();
    await page
      .getByLabel("Reviewed tone", { exact: true })
      .fill("Warm, concise replies, grounded in approved facts.");
    await page
      .getByRole("button", { name: "Save complete review as a new draft" })
      .click();
    await page
      .getByRole("button", { name: "Approve saved personality revision 2" })
      .waitFor();
    ok(
      await page
        .getByRole("button", { name: "Approve saved personality revision 2" })
        .isDisabled(),
      "approval requires acknowledgements",
    );
    await page.getByLabel(/I reviewed mixed and unknown authorship/).check();
    await page.getByLabel(/I reviewed the tone/).check();
    await page.getByLabel(/I verified the creator facts/).check();
    await page
      .getByRole("button", { name: "Approve saved personality revision 2" })
      .click();
    await page.getByText(/Personality revision 3: approved/).waitFor();
    ok(
      state.posts.at(-1).body.expectedRevision === 2,
      "personality revision, not configuration revision",
    );
    ok(
      (await page.getByText(/This document ready: no/).count()) === 1,
      "approval does not imply launch ready",
    );
    await page.getByRole("button", { name: "Revision 3, approved" }).click();
    await page.getByText("Historical revision 3", { exact: true }).waitFor();
    ok(true, "native audit revision detail view");
    state.lost = true;
    await page
      .getByRole("button", { name: "Create a new import draft" })
      .click();
    await page
      .getByRole("button", { name: "Retry identical personality command" })
      .waitFor();
    await page.getByText(/Personality revision 4: draft/).waitFor();
    ok(
      await page
        .getByRole("button", { name: "Save complete review as a new draft" })
        .isDisabled(),
      "uncertain command blocks a new conflicting personality write",
    );
    const uncertain = JSON.stringify(state.posts.at(-1));
    await page
      .getByRole("button", { name: "Retry identical personality command" })
      .click();
    await page.getByText(/Command recorded. Current personality/).waitFor();
    ok(
      JSON.stringify(state.posts.at(-1)) === uncertain &&
        state.personality.revision === 4,
      "lost acknowledgement retries exact command without replacing newer current state",
    );
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const tab of [/A\. Readiness/, /B\. Purchases/, /C\. Personality/]) {
        await page.getByRole("tab", { name: tab }).click();
        await page.waitForTimeout(150);
        ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `screen fits ${width}`,
        );
      }
      await page.screenshot({
        path: path.join(shots, `native-launch-${width}.png`),
        fullPage: true,
      });
    }
    state.deny = true;
    await page.getByRole("tab", { name: /B\. Purchases/ }).click();
    await page.locator('[data-launch-state="denied"]').first().waitFor();
    ok(
      (await page.getByText("provider-tx", { exact: true }).count()) === 0,
      "session denial removes private ledger data",
    );
    ok(external.length === 0, "no external requests");
    ok(errors.length === 0, errors.join(" | "));
    await context.close();
    console.log(`Native launch A synthetic browser: ${checks} passed,0 failed`);
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
    fs.rmSync(work, { recursive: true, force: true });
  }
}
/** Invoked by the real paired Next/API disposable rehearsal, with no route interception. */
export async function checkNativeLaunchA(page, context, origin) {
  const errors = [];
  const watch = (e) => errors.push(String(e));
  page.on("pageerror", watch);
  const get = async (path) => {
    const r = await context.request.get(origin + path);
    assert.equal(r.status(), 200, path);
    const j = await r.json();
    assert.equal(j.ok, true, path);
    return j;
  };
  const base = "/api/onlyfans-launch/abc/accounts/acc-a";
  const ready = await get(`${base}/readiness`);
  assert.equal(ready.data.readinessVersion, "of-launch-readiness.v1");
  assert.equal(ready.data.coverage.providerTotalMessages, null);
  await page.goto(origin + "/onlyfans/launch", {
    waitUntil: "domcontentloaded",
  });
  await page.locator("#launch-account").waitFor();
  await page.locator("#launch-account").selectOption("acc-a");
  await page.locator('[data-blocker="schema"]').waitFor();
  await page.getByRole("tab", { name: /B\. Purchases/ }).click();
  await page
    .getByText("Purchase ledger and recovery", { exact: true })
    .waitFor();
  assert.equal((await get(`${base}/purchases`)).data.schemaVersion, "of-ledger.v1");
  assert.equal((await get(`${base}/purchases/evidence`)).data.ledgerVersion, "of-ledger.v1");
  await page.getByRole("tab", { name: /C\. Personality/ }).click();
  const current = await get(`${base}/personality`),
    revision = current.data.revision;
  const importButton = page.getByRole("button", {
    name: /Import a review draft from history|Create a new import draft/,
  });
  await importButton.waitFor();
  await importButton.click();
  await page
    .getByText(new RegExp(`Personality revision ${revision + 1}: draft`))
    .waitFor();
  await page.getByLabel("Reviewed tone", { exact: true }).waitFor();
  await page
    .getByLabel("Reviewed tone", { exact: true })
    .fill(
      "Approved synthetic creator. Warm, concise replies with honest AI disclosure when asked.",
    );
  await page
    .getByRole("button", { name: "Save complete review as a new draft" })
    .click();
  const expected = revision + 2;
  await page
    .getByRole("button", {
      name: `Approve saved personality revision ${expected}`,
    })
    .waitFor();
  await page.getByLabel(/I reviewed mixed and unknown authorship/).check();
  await page.getByLabel(/I reviewed the tone/).check();
  await page.getByLabel(/I verified the creator facts/).check();
  await page
    .getByRole("button", {
      name: `Approve saved personality revision ${expected}`,
    })
    .click();
  await page
    .getByText(new RegExp(`Personality revision ${revision + 3}: approved`))
    .waitFor();
  const approved = await get(`${base}/personality`);
  assert.equal(approved.data.state, "approved");
  assert.equal(approved.data.revision, revision + 3);
  await get(`${base}/personality/history`);
  await get(`${base}/personality/revisions/${approved.data.revision}`);
  assert.equal(errors.length, 0, errors.join(" | "));
  page.off("pageerror", watch);
  return {
    checks: 12,
    scope: "actual paired dashboard+backend on disposable acc-a",
    personalityRevision: approved.data.revision,
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
