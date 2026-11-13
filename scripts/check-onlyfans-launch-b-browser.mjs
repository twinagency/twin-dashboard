import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

/**
 * Native launch B component regression. Default: synthetic disposable browser backend,
 * using the real React memory/automation components at desktop and 390px.
 * This mode is UI/contract evidence, not combined-backend or live-account acceptance.
 *
 * Actual disposable dashboard/backend rehearsal: export checkNativeLaunchB(page, context, origin),
 * or set ONLYFANS_TEST_NATIVE_LAUNCH=1, ONLYFANS_TEST_DISPOSABLE=1,
 * ONLYFANS_TEST_WEB_URL=http://127.0.0.1:PORT and ONLYFANS_TEST_COOKIE.
 * Native mode never intercepts or fabricates API responses.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const { chromium } = require("playwright");
const ISO = "2026-10-23T00:00:00Z",
  HASH = "a".repeat(64);
const shot = async (page, name) => {
  if (!process.env.ONLYFANS_TEST_EVIDENCE) return;
  fs.mkdirSync(process.env.ONLYFANS_TEST_EVIDENCE, { recursive: true });
  await page.screenshot({
    path: path.join(process.env.ONLYFANS_TEST_EVIDENCE, name),
    fullPage: true,
  });
};
const fits = (page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
async function launchBrowser() {
  const options = {
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  };
  if (process.env.ONLYFANS_TEST_CHROMIUM_MODULE) {
    const { default: portable } = await import(
      process.env.ONLYFANS_TEST_CHROMIUM_MODULE
    );
    options.executablePath =
      process.env.PREVIEW_CHROME || (await portable.executablePath());
    options.args = [
      ...portable.args.filter((arg) => arg !== "--disable-web-security"),
      "--disable-dev-shm-usage",
    ];
  } else if (process.env.PREVIEW_CHROME)
    options.executablePath = process.env.PREVIEW_CHROME;
  if (process.env.ONLYFANS_TEST_CHROMIUM_LIB_DIR)
    options.env = {
      ...process.env,
      LD_LIBRARY_PATH:
        process.env.ONLYFANS_TEST_CHROMIUM_LIB_DIR +
        ":" +
        (process.env.LD_LIBRARY_PATH ?? ""),
    };
  return chromium.launch(options);
}

/** Real dashboard server + combined backend only. Requires seeded, disposable acc-a, no provider sending. */
export async function checkNativeLaunchB(page, context, origin) {
  assert.equal(
    process.env.ONLYFANS_TEST_DISPOSABLE,
    "1",
    "native launch writes require the disposable rehearsal flag",
  );
  assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin));
  let checks = 0;
  const eq = (a, b, message) => {
    assert.equal(a, b, message);
    checks++;
  };
  const ok = (v, message) => {
    assert(v, message);
    checks++;
  };
  const account = "acc-a",
    memoryBase = `${origin}/api/onlyfans-launch/memory/accounts/${account}`,
    automationBase = `${origin}/api/onlyfans-launch/automation/accounts/${account}`;
  const { request } = require("playwright"),
    anonymous = await request.newContext();
  try {
    for (const url of [
      `${memoryBase}/fans`,
      `${automationBase}/follow-ups`,
      `${automationBase}/settings`,
      `${automationBase}/emergency-stop`,
    ]) {
      const response = await anonymous.get(url, { maxRedirects: 0 });
      ok(
        [301, 302, 303, 307, 308, 401, 403].includes(response.status()),
        "anonymous access must be refused",
      );
    }
  } finally {
    await anonymous.dispose();
  }
  const fans = await context.request.get(`${memoryBase}/fans?limit=50`);
  eq(fans.status(), 200, "native fan list");
  const fanPage = await fans.json();
  eq(fanPage.schemaVersion, "of-launch-b.v1");
  eq(fanPage.memoryVersion, "of-history-memory.v1");
  eq(fanPage.accountId, account);
  ok(
    Array.isArray(fanPage.fans) && fanPage.fans.length > 0,
    "rehearsal must seed canonical fans",
  );
  eq(fanPage.progress.totalMessages, null, "provider total remains unknown");
  const fanId = fanPage.fans[0].fanId;
  ok(typeof fanId === "string" && /^[1-9][0-9]*$/.test(fanId));
  const beforeResponse = await context.request.get(
    `${memoryBase}/fans/${fanId}`,
  );
  eq(beforeResponse.status(), 200);
  const before = await beforeResponse.json();
  ok(/^[a-f0-9]{64}$/.test(before.memory.version));
  eq(before.progress.providerHistoryComplete, null);
  const invalid = await context.request.patch(`${memoryBase}/fans/${fanId}`, {
    data: { factId: "f1", value: "x", expectedRevision: 1 },
    headers: { origin },
  });
  eq(invalid.status(), 400, "obsolete fact-ID contract must fail");
  const noOrigin = await context.request.patch(`${memoryBase}/fans/${fanId}`, {
    data: {
      field: "home_city",
      operation: "set",
      value: "Synthetic launch city",
      expectedVersion: before.memory.version,
      reason: "Disposable launch acceptance",
    },
  });
  eq(noOrigin.status(), 403);
  await page.goto(`${origin}/onlyfans/launch/memory`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.locator("#b-mem-acct").selectOption(account);
  await page.locator(`[data-b-fan="${fanId}"]`).click();
  await page.locator('[data-b-fact="home_city"]').waitFor();
  await page.getByRole("button", { name: "Correct city", exact: true }).click();
  await page.locator("#memory-value-home_city").fill("Synthetic launch city");
  await page
    .locator("#memory-reason-home_city")
    .fill("Disposable launch acceptance");
  const saveRequest = page.waitForRequest(
    (request) =>
      request.method() === "PATCH" &&
      request.url() === `${memoryBase}/fans/${fanId}`,
  );
  const saveResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url() === `${memoryBase}/fans/${fanId}`,
  );
  await page.getByRole("button", { name: "Save value", exact: true }).click();
  const savedCommand = (await saveRequest).postDataJSON();
  const savedResponse = await saveResponse;
  eq(savedResponse.status(), 200, "native memory correction acknowledgement");
  const saved = await savedResponse.json();
  eq(saved.correction.replayed, false, "new correction must be recorded");
  // The controlled textarea also contains the draft text before the PATCH commits.
  // Observe the saved read-only value, then verify the authoritative backend below.
  await page
    .locator('[data-b-fact="home_city"] > p')
    .getByText("Synthetic launch city", { exact: true })
    .waitFor({ timeout: 20000 });
  const after = await (
    await context.request.get(`${memoryBase}/fans/${fanId}`)
  ).json();
  eq(after.memory.facts.home_city.value, "Synthetic launch city");
  ok(
    after.memory.version !== before.memory.version,
    "correction must change authoritative version",
  );
  const identical = savedCommand;
  eq(identical.field, "home_city");
  eq(identical.operation, "set");
  ok(/^[a-f0-9]{64}$/.test(identical.expectedVersion));
  const replay = await context.request.patch(`${memoryBase}/fans/${fanId}`, {
    data: identical,
    headers: { origin },
  });
  eq(replay.status(), 200);
  eq(
    (await replay.json()).correction.replayed,
    true,
    "same actor/body must replay",
  );
  const stale = await context.request.patch(`${memoryBase}/fans/${fanId}`, {
    data: {
      ...identical,
      value: "Stale value",
      reason: "Stale rehearsal command",
    },
    headers: { origin },
  });
  eq(stale.status(), 409);
  await page.getByRole("button", { name: "Correct city", exact: true }).click();
  await page
    .locator("#memory-reason-home_city")
    .fill("Clear during disposable acceptance");
  await page.getByRole("button", { name: "Clear field", exact: true }).click();
  await page
    .locator('[data-b-fact="home_city"]')
    .getByText(/Cleared by an operator/)
    .waitFor();
  const cleared = await (
    await context.request.get(`${memoryBase}/fans/${fanId}`)
  ).json();
  eq(cleared.memory.overrides.home_city.operation, "clear");
  const backfill = await context.request.post(
    `${memoryBase}/fans/${fanId}/backfill`,
    { data: {}, headers: { origin } },
  );
  eq(backfill.status(), 200);
  eq((await backfill.json()).requested, "fan");
  await shot(page, "native-memory-real-backend.png");
  const settings = await context.request.get(`${automationBase}/settings`);
  eq(settings.status(), 200);
  eq((await settings.json()).engagementVersion, "of-engagement.v1");
  const actions = await context.request.get(
    `${automationBase}/follow-ups?limit=50`,
  );
  eq(actions.status(), 200);
  const actionPage = await actions.json();
  eq(actionPage.engagementVersion, "of-engagement.v1");
  ok(Array.isArray(actionPage.actions));
  await page.goto(`${origin}/onlyfans/launch/automation`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.locator("#b-auto-acct").selectOption(account);
  await page
    .getByRole("heading", {
      name: "Proactive engagement settings",
      exact: true,
    })
    .waitFor();
  const controls = await context.request.get(
    `${automationBase}/emergency-stop`,
  );
  eq(controls.status(), 200);
  const ready = await controls.json();
  eq(ready.readiness.readinessVersion, "of-launch-readiness.v1");
  const controlReason = page.getByRole("textbox", {
    name: "Reason",
    exact: true,
  });
  await controlReason.fill("Disposable launch emergency-stop acceptance");
  await page.locator("[data-b-emergency]").click();
  const stopResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url() === `${automationBase}/emergency-stop`,
  );
  await page
    .getByRole("button", { name: "Confirm emergency stop", exact: true })
    .click();
  const stoppedResponse = await stopResponse;
  eq(stoppedResponse.status(), 200, "native emergency-stop acknowledgement");
  eq((await stoppedResponse.json()).command.recorded, true);
  await page
    .locator("[data-b-runtime]")
    .getByText(/Account runtime stopped/)
    .waitFor({ timeout: 20000 });
  const stopped = await (
    await context.request.get(`${automationBase}/emergency-stop`)
  ).json();
  eq(
    stopped.readiness.accountControl.enabled,
    false,
    "stop requires authoritative readback",
  );
  ok(await fits(page), "native automation fits viewport");
  await shot(page, "native-automation-real-backend.png");
  console.log(
    `check-onlyfans-launch-b-browser native combined-backend rehearsal: ${checks} assertions passed, 0 failed, 0 skipped; provider sending not exercised`,
  );
  return checks;
}

const ACCOUNTS = [
  {
    accountId: "acc-a",
    health: "connected",
    automationMode: "automated",
    binding: { handle: "@account_a" },
  },
  {
    accountId: "acc-b",
    health: "expired_session",
    automationMode: "paused",
    binding: { handle: "@account_b" },
  },
];
const policy = {
  enabled: false,
  offers: true,
  follow_ups: true,
  reengagement: false,
  offer_delay_hours: 24,
  follow_up_delay_hours: 24,
  reengage_delay_hours: 168,
  expiry_hours: 24,
  fan_daily_limit: 1,
  fan_weekly_limit: 3,
  account_hourly_limit: 5,
  account_daily_limit: 20,
  unpaid_cooldown_hours: 24,
  repeat_item_days: 7,
  follow_up_text: "Checking in",
  reengage_text: "Hello again",
};
function syntheticBackend() {
  const mk = (acc, n, extra = {}) => ({
    conversationId: `${acc}:${n}`,
    accountId: acc,
    revision: 3,
    fan: {
      fanId: String(n),
      displayName: `Fan ${acc} ${n}`,
      shortRef: `f${n}`,
    },
    automationMode: "automated",
    takeoverState: "none",
    lastActivityAt: ISO,
    requiresAttention: false,
    ...extra,
  });
  const action = (n, status, extra = {}) => ({
    actionId: `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`,
    kind: "follow_up",
    status,
    reason: null,
    fanId: "9001",
    dueAt: ISO,
    expiresAt: "2026-10-24T00:00:00Z",
    intentId: status === "scheduled" ? null : `intent-${n}`,
    cancelRequested: false,
    ...extra,
  });
  const state = {
    convs: {
      "acc-a": [
        mk("acc-a", 1),
        mk("acc-a", 2, { automationMode: "paused" }),
        mk("acc-a", 3, {
          automationMode: "human_controlled",
          takeoverState: "effective",
        }),
      ],
      "acc-b": [mk("acc-b", 1)],
    },
    posts: [],
    denied: false,
    delayA: 0,
    conflictNext: false,
    loseCorrectionAck: false,
    loseSettingsAck: false,
    loseControlAck: false,
    memory: {
      "acc-a": { revision: 2, version: HASH, city: "Brisbane", cleared: false },
      "acc-b": {
        revision: 1,
        version: "b".repeat(64),
        city: "Perth",
        cleared: false,
      },
    },
    commands: new Map(),
    controls: {
      "acc-a": { enabled: true, revision: 1 },
      "acc-b": { enabled: false, revision: 1 },
    },
    actions: [
      action(1, "scheduled"),
      action(2, "unknown", { cancelRequested: true }),
      action(3, "accepted"),
    ],
    settingsRevision: 1,
    policy: { ...policy },
  };
  const progress = (accountId, fanId = null) => ({
    schemaVersion: "of-history-recovery.v1",
    accountId,
    fanId,
    status: "incomplete",
    discoveryComplete: false,
    conversationsDiscovered: 125,
    conversationsComplete: 12,
    conversationsRetrying: 1,
    conversationsDeferredForLiveInput: 2,
    pagesCommitted: 20,
    messagesObserved: 400,
    messagesAdded: 395,
    totalMessages: null,
    percentComplete: null,
    recentRecoveryNeeded: true,
  });
  const row = (fanId, name) => ({
    fanId,
    displayName: name,
    username: null,
    storedMessages: 120,
    processedMessages: 100,
    memoryRevision: 2,
    lastProcessedAt: ISO,
    archive: {
      status: "needed",
      pagesCompleted: 1,
      messagesObserved: 120,
      completedAt: null,
    },
  });
  const readiness = (accountId) => ({
    readinessVersion: "of-launch-readiness.v1",
    observedAt: ISO,
    schemaRevision: "0090_launch",
    readyToEnable: true,
    checks: [],
    accountControl: {
      ...state.controls[accountId],
      bindingId: `binding-${accountId}`,
      unresolvedOutgoing: 1,
      fingerprint: String(state.controls[accountId].revision).padStart(64, "0"),
    },
    coverage: {
      storedMessages: 120,
      processedMessages: 100,
      providerTotalMessages: null,
      archiveComplete: false,
      pendingArchiveConversations: 2,
    },
    catalogue: { usableInspectedItems: 1, inspectedItems: 1, hasMore: false },
    autonomy: {
      accountEnabled: state.controls[accountId].enabled,
      deliveryEnabled: false,
      existingAutomatedConversations: 1,
      automateNewConversations: false,
      engagementEnabled: false,
      workerCapabilities: {},
    },
    limits: ["Synthetic UI regression only"],
  });
  async function handle(route) {
    const req = route.request(),
      url = new URL(req.url()),
      p = decodeURIComponent(url.pathname),
      method = req.method();
    const send = async (body, status = 200) => {
      try {
        await route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(
            p.startsWith("/api/onlyfans-launch/")
              ? { schemaVersion: "of-launch-b.v1", ...body }
              : body,
          ),
        });
      } catch {
        /* account-switch abort */
      }
    };
    if (state.denied) return send({ error: "Sign in again." }, 401);
    if (p === "/api/onlyfans/accounts") return send({ accounts: ACCOUNTS });
    let m = p.match(/^\/api\/onlyfans\/accounts\/([^/]+)\/conversations$/);
    if (m) {
      if (m[1] === "acc-a" && state.delayA)
        await new Promise((r) => setTimeout(r, state.delayA));
      return send({
        accountId: m[1],
        page: { items: state.convs[m[1]], nextCursor: null },
      });
    }
    m = p.match(/^\/api\/onlyfans\/accounts\/([^/]+)\/workspace\/settings$/);
    if (m)
      return send({
        schemaVersion: "of-preview.v2",
        workspace: {
          schemaVersion: "of-workspace.v2",
          section: "settings",
          accountId: m[1],
          asOf: "2026-11-12T10:00:00Z",
          lastCompleteSyncAt: null,
          runtimeEnabled: state.controls[m[1]].enabled,
          historyRecoveryRequired: true,
          providerConnectionVerified: true,
          deliveryPolicy: {
            revision: 1,
            enabled: false,
            mediaEnabled: false,
            usedUnits: 0,
            limitUnits: 100,
          },
          configuration: null,
        },
      });
    m = p.match(
      /^\/api\/onlyfans-controls\/accounts\/([^/]+)\/conversations\/(.+)$/,
    );
    if (m && method === "POST") {
      const body = req.postDataJSON();
      state.posts.push({ account: m[1], ...body });
      if (state.conflictNext) {
        state.conflictNext = false;
        return send({ error: "The conversation changed." }, 409);
      }
      const c = state.convs[m[1]].find((x) => x.conversationId === m[2]);
      Object.assign(
        c,
        {
          pause_automation: { automationMode: "paused" },
          resume_automation: { automationMode: "automated" },
          request_takeover: {
            takeoverState: "effective",
            automationMode: "human_controlled",
          },
          release_takeover: {
            takeoverState: "none",
            automationMode: "automated",
          },
          mark_no_contact: { automationMode: "no_contact" },
        }[body.action],
        { revision: c.revision + 1 },
      );
      return send({
        schemaVersion: "of-controls.v1",
        ok: true,
        applied: true,
        commandKey: HASH,
        accountId: m[1],
        conversationId: m[2],
        action: body.action,
        recordedRevision: body.expectedRevision + 1,
      });
    }
    m = p.match(/^\/api\/onlyfans-launch\/memory\/accounts\/([^/]+)\/fans$/);
    if (m) {
      if (m[1] === "acc-a" && state.delayA)
        await new Promise((r) => setTimeout(r, state.delayA));
      return send({
        ok: true,
        accountId: m[1],
        memoryVersion: "of-history-memory.v1",
        fans:
          m[1] === "acc-b"
            ? [row("9010", "Only B memory")]
            : url.searchParams.has("cursor")
              ? [row("9002", "Second memory fan")]
              : [row("9001", "First memory fan")],
        nextCursor:
          m[1] === "acc-a" && !url.searchParams.has("cursor")
            ? "binding.page-2"
            : null,
        progress: progress(m[1]),
      });
    }
    m = p.match(
      /^\/api\/onlyfans-launch\/memory\/accounts\/([^/]+)\/fans\/([0-9]+)$/,
    );
    if (m) {
      const acc = m[1],
        fanId = m[2],
        mem = state.memory[acc];
      if (method === "PATCH") {
        const body = req.postDataJSON(),
          key = JSON.stringify([acc, fanId, body]);
        state.posts.push({
          account: acc,
          action: "memory_correction",
          ...body,
        });
        if (state.commands.has(key))
          return send({
            ok: true,
            accountId: acc,
            fanId,
            correction: { revision: state.commands.get(key), replayed: true },
          });
        if (body.expectedVersion !== mem.version)
          return send({ error: "Memory changed." }, 409);
        if (body.field === "home_city") {
          mem.city = body.value;
          mem.cleared = body.operation === "clear";
        }
        mem.revision++;
        mem.version = String(mem.revision).padStart(64, "0");
        state.commands.set(key, mem.revision);
        if (state.loseCorrectionAck) {
          state.loseCorrectionAck = false;
          return route.abort();
        }
        return send({
          ok: true,
          accountId: acc,
          fanId,
          correction: { revision: mem.revision, replayed: false },
        });
      }
      return send({
        ok: true,
        accountId: acc,
        fanId,
        memory: {
          schemaVersion: "of-history-memory.v1",
          algorithm: "english-patterns.v1",
          revision: mem.revision,
          version: mem.version,
          canonicalDigest: HASH,
          fingerprint: HASH,
          facts: mem.cleared
            ? {}
            : {
                home_city: {
                  value: mem.city,
                  source: "history",
                  sourceMessageId: "123",
                  sourceAt: ISO,
                  quote: `I live in ${mem.city}`,
                  sourceDigest: HASH,
                },
              },
          summaries: {
            short_bio: "Saved profile information",
            bullet_points: null,
          },
          overrides: mem.cleared
            ? { home_city: { operation: "clear", revision: mem.revision } }
            : {},
          interactions: [
            {
              sourceMessageId: "123",
              sourceAt: ISO,
              direction: "in",
              excerpt: "Stored fan source excerpt",
              sourceDigest: HASH,
            },
          ],
          summaryKind: "saved_profile_and_source_excerpts",
        },
        progress: {
          schemaVersion: "of-history-memory-progress.v1",
          algorithm: "english-patterns.v1",
          storedMessages: 120,
          processedCurrentMessages: 100,
          pendingMessages: 20,
          storedMemoryComplete: false,
          providerHistoryComplete: null,
          revision: mem.revision,
          oldestStoredAt: ISO,
          newestStoredAt: ISO,
          lastProcessedAt: ISO,
        },
        recovery: progress(acc, fanId),
      });
    }
    m = p.match(
      /^\/api\/onlyfans-launch\/memory\/accounts\/([^/]+)(?:\/fans\/([0-9]+))?\/backfill$/,
    );
    if (m && method === "POST") {
      state.posts.push({ action: "backfill", account: m[1] });
      return send({
        ok: true,
        accountId: m[1],
        requested: m[2] ? "fan" : "account",
      });
    }
    m = p.match(
      /^\/api\/onlyfans-launch\/automation\/accounts\/([^/]+)\/(settings|follow-ups|emergency-stop)$/,
    );
    if (m) {
      const acc = m[1],
        rest = m[2];
      if (rest === "settings") {
        if (method === "POST") {
          const body = req.postDataJSON();
          state.posts.push({ account: acc, action: "settings", ...body });
          const key = `settings:${acc}:${JSON.stringify(body)}`;
          if (state.commands.has(key)) return send(state.commands.get(key));
          state.policy = body.settings;
          state.settingsRevision++;
          const ack = {
            ok: true,
            accountId: acc,
            revision: state.settingsRevision,
          };
          state.commands.set(key, ack);
          if (state.loseSettingsAck) {
            state.loseSettingsAck = false;
            return send(
              {
                ok: false,
                outcome: "unconfirmed",
                error: "Synthetic lost settings acknowledgement",
              },
              502,
            );
          }
          return send(ack);
        }
        return send({
          ok: true,
          accountId: acc,
          engagementVersion: "of-engagement.v1",
          revision: state.settingsRevision,
          bindingCurrent: true,
          settings: state.policy,
        });
      }
      if (rest === "emergency-stop") {
        if (method === "POST") {
          const body = req.postDataJSON();
          state.posts.push({ account: acc, ...body });
          const key = `control:${acc}:${JSON.stringify(body)}`;
          if (state.commands.has(key)) return send(state.commands.get(key));
          state.controls[acc].enabled = body.action === "resume";
          state.controls[acc].revision++;
          const ack = {
            ok: true,
            accountId: acc,
            command: { recorded: true, commandKey: HASH },
          };
          state.commands.set(key, ack);
          if (state.loseControlAck) {
            state.loseControlAck = false;
            return send(
              {
                ok: false,
                outcome: "unconfirmed",
                error: "Synthetic lost account acknowledgement",
              },
              502,
            );
          }
          return send(ack);
        }
        return send({ ok: true, accountId: acc, readiness: readiness(acc) });
      }
      if (method === "POST") {
        const body = req.postDataJSON();
        state.posts.push({ account: acc, ...body });
        const row = state.actions.find((x) => x.actionId === body.actionId);
        if (body.action === "cancel") {
          row.cancelRequested = true;
          if (row.status === "scheduled") row.status = "cancelled";
        }
        return send({ ok: true, accountId: acc, action: row });
      }
      return send({
        ok: true,
        accountId: acc,
        engagementVersion: "of-engagement.v1",
        actions: url.searchParams.has("cursor")
          ? state.actions.slice(2)
          : state.actions.slice(0, 2),
        nextCursor: url.searchParams.has("cursor") ? null : "actions.page-2",
      });
    }
    return send({ error: `Unimplemented synthetic route ${method} ${p}` }, 404);
  }
  return { state, handle };
}

async function runSynthetic() {
  const { build } = require("esbuild"),
    postcss = require("postcss"),
    tailwind = require("@tailwindcss/postcss");
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "native-launch-b-"));
  fs.writeFileSync(
    path.join(work, "entry.tsx"),
    `import {createRoot} from 'react-dom/client';import {StrictMode} from 'react';import Memory from '@/components/onlyfans-launch/memory/BMemoryPanel';import Automation from '@/components/onlyfans-launch/automation/BAutomationPanel';const manage=new URLSearchParams(location.search).get('manage')!=='0';createRoot(document.getElementById('root')!).render(<StrictMode>{location.pathname.includes('memory')?<Memory canManage={manage}/>:<Automation canManage={manage}/>}</StrictMode>);`,
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
    alias: { "@": root },
    loader: { ".css": "empty" },
  });
  const css = await postcss([tailwind({ base: root })]).process(
    fs.readFileSync(path.join(root, "app/globals.css"), "utf8"),
    { from: path.join(root, "app/globals.css") },
  );
  fs.writeFileSync(path.join(work, "app.css"), css.css);
  const server = http.createServer((req, res) => {
    const file =
      req.url === "/app.js"
        ? "app.js"
        : req.url === "/app.css"
          ? "app.css"
          : null;
    res.setHeader(
      "content-type",
      file
        ? file.endsWith("js")
          ? "text/javascript"
          : "text/css"
        : "text/html",
    );
    res.end(
      file
        ? fs.readFileSync(path.join(work, file))
        : '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>',
    );
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    let checks = 0;
    const eq = (a, b, message) => {
        assert.equal(a, b, message);
        checks++;
      },
      ok = (v, message) => {
        assert(v, message);
        checks++;
      };
    for (const [label, viewport] of [
      ["desktop", { width: 1280, height: 900 }],
      ["mobile390", { width: 390, height: 844 }],
    ]) {
      browser = await launchBrowser();
      const context = await browser.newContext({ viewport }),
        b = syntheticBackend(),
        external = [],
        errors = [];
      await context.route("**/*", (route) => {
        const url = route.request().url();
        if (!url.startsWith(origin + "/")) {
          external.push(url);
          return route.abort();
        }
        return url.includes("/api/") ? b.handle(route) : route.continue();
      });
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto(`${origin}/automation?manage=1`, {
        waitUntil: "domcontentloaded",
      });
      await page.locator('[data-b-conversation="acc-a:1"]').waitFor();
      const pause = page.locator(
        '[data-b-conversation="acc-a:1"] [data-b-action="pause_automation"]',
      );
      await pause.focus();
      await page.keyboard.press("Enter");
      await page
        .locator('[data-b-conversation="acc-a:1"] [data-b-mode="paused"]')
        .waitFor();
      eq(b.state.posts.at(-1).expectedRevision, 3);
      ok(
        await page
          .locator(
            '[data-b-conversation="acc-a:1"] [data-b-action="resume_automation"]',
          )
          .isEnabled(),
      );
      b.state.conflictNext = true;
      await page
        .locator(
          '[data-b-conversation="acc-a:1"] [data-b-action="resume_automation"]',
        )
        .click();
      await page.getByText(/changed or is on hold/).waitFor();
      eq(
        await page
          .locator('[data-b-conversation="acc-a:1"] [data-b-mode]')
          .getAttribute("data-b-mode"),
        "paused",
      );
      await page
        .locator(
          '[data-b-conversation="acc-a:2"] [data-b-action="request_takeover"]',
        )
        .click();
      await page
        .locator('[data-b-conversation="acc-a:2"]')
        .getByText(/Human has control/)
        .waitFor();
      await page
        .locator(
          '[data-b-conversation="acc-a:3"] [data-b-action="release_takeover"]',
        )
        .click();
      await page
        .locator('[data-b-conversation="acc-a:3"] [data-b-mode="automated"]')
        .waitFor();
      await page
        .locator(
          '[data-b-conversation="acc-a:2"] [data-b-action="mark_no_contact"]',
        )
        .click();
      const beforeCancel = b.state.posts.length;
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      eq(b.state.posts.length, beforeCancel);
      await page
        .locator(
          '[data-b-conversation="acc-a:2"] [data-b-action="mark_no_contact"]',
        )
        .click();
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      await page
        .locator('[data-b-conversation="acc-a:2"] [data-b-mode="no_contact"]')
        .waitFor();
      eq(
        await page
          .locator('[data-b-conversation="acc-a:2"] button:enabled')
          .count(),
        0,
      );
      await page
        .locator('[data-b-followup="unknown"]')
        .getByText(/cancellation requested/)
        .waitFor();
      await page
        .locator('[data-b-followup="scheduled"]')
        .getByRole("button", { name: "Request cancellation" })
        .click();
      await page.locator('[data-b-followup="cancelled"]').waitFor();
      await page
        .getByRole("button", { name: "Older actions", exact: true })
        .click();
      await page
        .locator('[data-b-followup="accepted"]')
        .getByText(/does not establish a purchase/)
        .waitFor();
      eq(
        await page
          .locator('[data-b-followup="accepted"]')
          .getByRole("button", { name: "Request cancellation" })
          .count(),
        0,
      );
      await page
        .getByLabel("follow up text", { exact: true })
        .fill("Updated synthetic check-in");
      b.state.loseSettingsAck = true;
      await page
        .getByRole("button", { name: "Save engagement settings", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Retry identical engagement settings",
          exact: true,
        })
        .waitFor();
      const unknownSettings = JSON.stringify(b.state.posts.at(-1));
      const settingsRevision = b.state.settingsRevision;
      await page
        .getByRole("button", {
          name: "Retry identical engagement settings",
          exact: true,
        })
        .click();
      await page.getByText(/Engagement settings recorded/).waitFor();
      eq(
        JSON.stringify(b.state.posts.at(-1)),
        unknownSettings,
        "identical engagement settings retry",
      );
      eq(
        b.state.settingsRevision,
        settingsRevision,
        "no duplicate settings revision",
      );
      // Pause keeps the identical retry: same body, same key, no extra revision.
      b.state.loseControlAck = true;
      await page
        .getByRole("textbox", { name: "Reason", exact: true })
        .fill("Synthetic pause regression");
      await page.getByRole("button", { name: "Pause account", exact: true }).click();
      await page
        .getByRole("button", { name: "Confirm pause", exact: true })
        .click();
      await page.getByText(/Account runtime stopped/).waitFor();
      await page
        .getByRole("button", {
          name: "Retry identical account command",
          exact: true,
        })
        .waitFor();
      const unknownControl = JSON.stringify(b.state.posts.at(-1)),
        controlRevision = b.state.controls["acc-a"].revision;
      await page
        .getByRole("button", {
          name: "Retry identical account command",
          exact: true,
        })
        .click();
      await page.getByText(/Pause: Account command recorded/).waitFor();
      eq(
        JSON.stringify(b.state.posts.at(-1)),
        unknownControl,
        "identical account command retry",
      );
      eq(
        b.state.controls["acc-a"].revision,
        controlRevision,
        "no duplicate account control revision",
      );
      // A lost emergency STOP is not an identical retry: it offers "Send stop again" and carries no fingerprint.
      b.state.loseControlAck = true;
      await page
        .getByRole("textbox", { name: "Reason", exact: true })
        .fill("Synthetic emergency-stop regression");
      await page.locator("[data-b-emergency]").click();
      await page
        .getByRole("button", { name: "Confirm emergency stop", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Send stop again", exact: true })
        .waitFor();
      eq(
        await page
          .getByRole("button", {
            name: "Retry identical account command",
            exact: true,
          })
          .count(),
        0,
        "STOP never offers an identical retry",
      );
      ok(
        !("expectedFingerprint" in b.state.posts.at(-1)),
        "STOP carries no fingerprint",
      );
      await page
        .getByRole("button", { name: "Send stop again", exact: true })
        .click();
      await page.getByText(/Emergency stop: Account command recorded/).waitFor();
      eq(b.state.controls["acc-a"].enabled, false);
      ok(await fits(page), `${label} automation fits`);
      await shot(page, `synthetic-native-automation-${label}.png`);
      b.state.delayA = 900;
      await page.locator("#b-auto-acct").selectOption("acc-b");
      await page.locator("#b-auto-acct").selectOption("acc-a");
      await page.locator("#b-auto-acct").selectOption("acc-b");
      await page.locator('[data-b-conversation="acc-b:1"]').waitFor();
      await page.waitForTimeout(1100);
      eq(
        await page.locator('[data-b-conversation^="acc-a:"]').count(),
        0,
        "stale account conversation response",
      );
      b.state.delayA = 0;
      await page.goto(`${origin}/automation?manage=0`, {
        waitUntil: "domcontentloaded",
      });
      await page.locator('[data-b-conversation="acc-a:1"]').waitFor();
      eq(await page.locator("[data-b-conversation] button:enabled").count(), 0);
      ok(await page.locator("[data-b-emergency]").isDisabled());
      ok(
        await page
          .getByRole("button", {
            name: "Save engagement settings",
            exact: true,
          })
          .isDisabled(),
      );
      await page.goto(`${origin}/memory?manage=1`, {
        waitUntil: "domcontentloaded",
      });
      await page.locator('[data-b-fan="9001"]').waitFor();
      eq(await page.locator("[data-b-fixture-banner]").count(), 0);
      await page
        .getByRole("button", { name: "Load more fans", exact: true })
        .click();
      await page.locator('[data-b-fan="9002"]').waitFor();
      eq(await page.locator("[data-b-fan]").count(), 2);
      await page.locator('[data-b-fan="9001"]').click();
      await page
        .locator('[data-b-fact="home_city"]')
        .getByText("Brisbane", { exact: true })
        .waitFor();
      await page
        .getByText("Stored fan source excerpt", { exact: true })
        .waitFor();
      ok(
        (await page.locator("[data-b-memory-progress]").innerText()).includes(
          "100 / 20",
        ),
      );
      await page
        .getByRole("button", { name: "Correct city", exact: true })
        .click();
      await page.locator("#memory-value-home_city").fill("Sydney");
      await page
        .getByRole("button", { name: "Save value", exact: true })
        .click();
      await page
        .getByRole("alert")
        .getByText(/Give a reason/)
        .waitFor();
      await page
        .locator("#memory-reason-home_city")
        .fill("Synthetic lost-ack regression");
      b.state.loseCorrectionAck = true;
      await page
        .getByRole("button", { name: "Save value", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Retry identical correction",
          exact: true,
        })
        .waitFor();
      await page
        .locator('[data-b-fact="home_city"]')
        .getByText("Sydney", { exact: true })
        .first()
        .waitFor();
      const original = b.state.posts
        .filter((x) => x.action === "memory_correction")
        .at(-1);
      await page
        .getByRole("button", {
          name: "Retry identical correction",
          exact: true,
        })
        .click();
      await page.getByText(/same correction was already recorded/).waitFor();
      const replay = b.state.posts
        .filter((x) => x.action === "memory_correction")
        .at(-1);
      eq(JSON.stringify(original), JSON.stringify(replay));
      await page
        .getByRole("button", { name: "Correct city", exact: true })
        .click();
      await page
        .locator("#memory-reason-home_city")
        .fill("Synthetic durable clear");
      await page
        .getByRole("button", { name: "Clear field", exact: true })
        .click();
      await page
        .locator('[data-b-fact="home_city"]')
        .getByText(/Cleared by an operator/)
        .waitFor();
      ok(b.state.memory["acc-a"].cleared);
      await page
        .getByRole("button", {
          name: "Resume this fan's recovery",
          exact: true,
        })
        .click();
      await page.getByText(/does not mean recovery is complete/).waitFor();
      ok(await fits(page), `${label} memory fits`);
      await shot(page, `synthetic-native-memory-${label}.png`);
      b.state.delayA = 900;
      await page.locator("#b-mem-acct").selectOption("acc-b");
      await page.locator("#b-mem-acct").selectOption("acc-a");
      await page.locator("#b-mem-acct").selectOption("acc-b");
      await page.locator('[data-b-fan="9010"]').waitFor();
      await page.waitForTimeout(1100);
      eq(await page.locator('[data-b-fan="9001"]').count(), 0);
      eq(await page.locator('[data-b-card="fan"]').count(), 0);
      b.state.delayA = 0;
      await page.goto(`${origin}/memory?manage=0`, {
        waitUntil: "domcontentloaded",
      });
      await page.locator('[data-b-fan="9001"]').click();
      await page.locator('[data-b-fact="home_city"]').waitFor();
      ok(
        await page
          .getByRole("button", { name: "Correct city", exact: true })
          .isDisabled(),
      );
      ok(
        await page
          .getByRole("button", { name: "Resume account recovery", exact: true })
          .isDisabled(),
      );
      b.state.denied = true;
      await page.reload({ waitUntil: "domcontentloaded" });
      await page
        .getByText(/Sign in again/)
        .first()
        .waitFor();
      checks++;
      eq(external.length, 0, "no external requests");
      eq(errors.length, 0, "no browser exceptions");
      await context.close();
      await browser.close();
      browser = null;
    }
    console.log(
      `check-onlyfans-launch-b-browser SYNTHETIC UI ONLY: ${checks} assertions passed, 0 failed, 0 skipped (desktop + 390px); not integrated acceptance`,
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(work, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.env.ONLYFANS_TEST_NATIVE_LAUNCH === "1") {
    const origin = process.env.ONLYFANS_TEST_WEB_URL,
      cookie = process.env.ONLYFANS_TEST_COOKIE;
    assert(origin && /^http:\/\/127\.0\.0\.1:\d+$/.test(origin) && cookie);
    const browser = await launchBrowser();
    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
      });
      await context.addCookies([
        { name: "allie_admin_session", value: cookie, url: origin },
      ]);
      const page = await context.newPage();
      await checkNativeLaunchB(page, context, origin);
    } finally {
      await browser.close();
    }
  } else await runSynthetic();
}
