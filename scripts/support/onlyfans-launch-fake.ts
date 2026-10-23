/** Synthetic backend for the launch checks. It enforces the real contract envelope: purpose token, version header, account in the path. */
export const BASE = "https://backend.example";
export const TOKENS = { ONLYFANS_API_TOKEN: "api-token-aaaaaaaaaaaa", ONLYFANS_CONTROL_TOKEN: "control-token-bbbbbbbb", ONLYFANS_CONFIGURATION_TOKEN: "config-token-cccccccc" } as const;
export function setEnv() { process.env.ONLYFANS_API_BASE_URL = BASE; for (const [k, v] of Object.entries(TOKENS)) process.env[k] = v; }

export type Call = { method: string; path: string; query: string; headers: Record<string, string>; body: unknown };
export type Handler = (call: Call, match: RegExpMatchArray) => Response | Promise<Response>;
export const json = (body: unknown, status = 200) => Response.json(body, { status });
const CFG = "of-configuration.v3", CTRL = "of-controls.v1";

export const ledgerBody = (account = "acc-a", over: Record<string, unknown> = {}) => ({ schemaVersion: "of-ledger.v1", accountId: account, status: "held", windowStart: "2026-07-25T00:00:00Z", windowEnd: "2026-10-23T00:00:00Z",
  pageOffset: 40, lastCompleteAt: null, lastFullAt: null, nextPollAt: "2026-10-23T05:10:00Z", lastError: "unsupported_ledger_response", leaseActive: false, connectionCurrent: true,
  connectionRevision: 7, conflictCount: 0, unlinkedPaidCount: 0, requiresInvestigation: true, commerceHeld: true, scanFingerprint: "f".repeat(64), ...over });
export const FP = "f".repeat(64);
export const recoveryBody = (account = "acc-a", fan: string | null = null, over: Record<string, unknown> = {}) => ({ schemaVersion: "of-history-recovery.v1", accountId: account, fanId: fan, status: "incomplete", discoveryComplete: false,
  discoveryCursor: null, discoveryLastError: null, conversationsDiscovered: 10, conversationsComplete: 4, conversationsRetrying: 1, conversationsDeferredForLiveInput: 0, pagesCommitted: 12,
  messagesObserved: 300, messagesAdded: 120, totalMessages: null, percentComplete: null, proof: "available_provider_history", recentRecoveryNeeded: false, ...over });
export const memProgress = (over: Record<string, unknown> = {}) => ({ schemaVersion: "of-history-memory-progress.v1", algorithm: "explicit-en.v1", storedMessages: 10, processedCurrentMessages: 8, pendingMessages: 2,
  storedMemoryComplete: false, providerHistoryComplete: null, revision: 3, oldestStoredAt: "2026-09-01T00:00:00", newestStoredAt: "2026-10-22T00:00:00", lastProcessedAt: null, ...over });
export const VERSION = "a".repeat(64);
export const memoryBody = (over: Record<string, unknown> = {}) => ({ schemaVersion: "of-history-memory.v1", algorithm: "explicit-en.v1", revision: 3, version: VERSION, canonicalDigest: "b".repeat(64),
  facts: { real_name: { value: "Alex", source: "operator", revision: 2 }, home_city: { value: "Leeds", source: "history", sourceMessageId: "9", sourceAt: "2026-10-01T00:00:00", quote: "I live in Leeds", sourceDigest: "c".repeat(64) } },
  summaries: { short_bio: "Likes football", bullet_points: null }, overrides: {}, interactions: [{ sourceMessageId: "4", sourceAt: "2026-09-02T00:00:00", direction: "in", excerpt: "<b>hi</b> there", sourceDigest: "d".repeat(64) }],
  summaryKind: "saved_profile_and_source_excerpts", fingerprint: "e".repeat(64), ...over });
const readiness = (ready: boolean) => ({ ready, reviewRequired: true, blockers: ready ? [] : ["credential_unverified"], model: { state: "known", modelId: "m1", provider: "p", reasoningEffort: { state: "x", saved: null, resolved: null } },
  credential: { state: ready ? "usable" : "metadata_unavailable", configured: ready, metadataAvailable: ready }, budget: { state: "positive", dailyCostCapCents: 500 }, tone: { state: "reviewed", conflicts: [], reviewRequired: true } });
export const personalityBody = (state: "empty" | "draft" | "approved", over: Record<string, unknown> = {}, ready = false) => state === "empty"
  ? { version: "of-personality.v1", state, revision: 0, bindingId: "bind-1", document: null, ...over }
  : { version: "of-personality.v1", state, revision: state === "draft" ? 1 : 3, bindingId: "bind-1",
    document: { source: "canonical_history", review: state === "approved" ? { persona: "Warm and brief" } : {},
      draft: { creatorFacts: [{ key: "job", value: "Nurse", evidenceIds: ["e1"], attribution: "profile", selected: false }], writingStyle: [{ key: "reply_length", value: "short", evidenceIds: ["e1"], attribution: "creator", selected: false }],
        operationalInstructions: [{ text: "Always push the bundle", evidenceIds: [], attribution: "agency", selected: false, conflicts: [{ code: "forced_sales", severity: "block", message: "Forced sales" }], includedInConfiguration: false }],
        suggestedPersona: { text: "Short and warm.", attribution: "creator", evidenceIds: ["e1"], selected: false, requiresReview: true, basis: "observed_account_style", warning: "Mixed authorship" },
        evidence: [{ id: "e1", sourceId: "m1", kind: "outgoing_message", author: "creator", excerpt: "<script>x</script> hey", truncated: false }],
        coverage: { inputMessages: 100, uniqueMessages: 90, sampledMessages: 40, authorship: {}, method: "m", limitations: ["Older rows not scanned"] } },
      ...(state === "approved" ? { approval: { acknowledgements: { mixedAuthorship: true, runtimeRules: true, factsVerified: true }, configurationCommandKey: "k", appliedConfigurationRevision: 9 } } : {}) },
    configurationRevision: 9, configurationFingerprint: "x", configurationCurrent: true, conflicts: [], requiresFactResolution: [],
    factComparisons: [{ key: "job", current: null, proposed: "Nurse", changed: true }], readiness: readiness(ready), createdAt: "2026-10-23T01:00:00Z", actor: "op-session:" + "1".repeat(64), commandKey: "k", ...over };
export const POLICY = { enabled: true, offers: false, follow_ups: true, reengagement: false, offer_delay_hours: 24, follow_up_delay_hours: 48, reengage_delay_hours: 168, expiry_hours: 24, fan_daily_limit: 1,
  fan_weekly_limit: 3, account_hourly_limit: 10, account_daily_limit: 60, unpaid_cooldown_hours: 72, repeat_item_days: 30, follow_up_text: "Would you like to keep chatting?", reengage_text: "How have you been?" };
export const ACTION_A = { actionId: "11111111-1111-1111-1111-111111111111", kind: "follow_up", status: "scheduled", reason: null, fanId: "7", dueAt: "2026-10-24T00:00:00Z", expiresAt: "2026-10-25T00:00:00Z", intentId: null, cancelRequested: false };

/** The default answers a healthy backend gives. Tests replace single handlers to inject failures. */
export function fakeBackend(overrides: Partial<Record<string, Handler>> = {}) {
  const calls: Call[] = [];
  const routes: [string, string, RegExp][] = [];
  const add = (key: string, method: string, re: string) => routes.push([key, method, new RegExp(`^${re}$`)]);
  const P = "/onlyfans/configuration/v1/accounts/(acc-[a-z]+)";
  add("personality", "GET", `${P}/personality`); add("personality.history", "GET", `${P}/personality/history`); add("personality.revision", "GET", `${P}/personality/revisions/(\\d+)`);
  add("personality.post", "POST", `${P}/personality/(import|review|approve)`);
  add("recovery", "GET", `${P}/history-memory/progress`); add("fan.progress", "GET", `${P}/history-memory/fans/(\\d+)/progress`); add("fan.memory", "GET", `${P}/history-memory/fans/(\\d+)/memory`);
  add("fan.correct", "POST", `${P}/history-memory/fans/(\\d+)/corrections`); add("backfill", "POST", `${P}/history-memory/backfill`); add("fan.backfill", "POST", `${P}/history-memory/fans/(\\d+)/backfill`);
  add("engagement", "GET", `${P}/engagement`); add("engagement.settings", "POST", `${P}/engagement/settings`); add("engagement.actions", "GET", `${P}/engagement/actions`);
  add("engagement.cancel", "POST", `${P}/engagement/actions/([a-f0-9-]{36})/cancel`);
  add("ledger", "GET", "/onlyfans/api/v1/accounts/(acc-[a-z]+)/ledger"); add("ledger.retry", "POST", "/onlyfans/control/v1/accounts/(acc-[a-z]+)/ledger/retry");
  const defaults: Record<string, Handler> = {
    personality: (_c, m) => json({ schemaVersion: CFG, ok: true, accountId: m[1], personalityVersion: "of-personality.v1", personality: personalityBody("empty") }),
    "personality.history": (_c, m) => json({ schemaVersion: CFG, ok: true, accountId: m[1], personalityVersion: "of-personality.v1", personality: { revisions: [{ revision: 2, state: "draft", actor: "x", createdAt: "2026-10-23T00:00:00Z" }], nextBefore: 2 } }),
    "personality.post": (c, m) => json({ schemaVersion: CFG, ok: true, accountId: m[1], personalityVersion: "of-personality.v1", personality: personalityBody(m[2] === "approve" ? "approved" : "draft", {}, true), commandKey: (c.body as { commandKey: string }).commandKey }),
    recovery: (_c, m) => json({ schemaVersion: CFG, ok: true, accountId: m[1], progress: recoveryBody(m[1]) }),
    "fan.progress": (_c, m) => json({ schemaVersion: CFG, ok: true, accountId: m[1], recovery: recoveryBody(m[1], m[2]), memory: memProgress() }),
    "fan.memory": (_c, m) => json({ schemaVersion: CFG, ok: true, accountId: m[1], memory: memoryBody() }),
    "fan.correct": (c, m) => json({ schemaVersion: CFG, ok: true, accountId: m[1], correction: { revision: 4, replayed: false, version: "9".repeat(64) }, commandKey: (c.body as { commandKey: string }).commandKey }),
    backfill: (_c, m) => json({ schemaVersion: CFG, ok: true, accountId: m[1], requested: "account" }),
    "fan.backfill": (_c, m) => json({ schemaVersion: CFG, ok: true, accountId: m[1], requested: "fan" }),
    engagement: (_c, m) => json({ schemaVersion: CFG, ok: true, accountId: m[1], engagementVersion: "of-engagement.v1", revision: 5, bindingCurrent: true, settings: POLICY }),
    "engagement.settings": (c, m) => json({ schemaVersion: CFG, ok: true, accountId: m[1], engagementVersion: "of-engagement.v1", revision: 6, commandKey: (c.body as { commandKey: string }).commandKey }),
    "engagement.actions": (_c, m) => json({ schemaVersion: CFG, ok: true, accountId: m[1], engagementVersion: "of-engagement.v1", actions: [ACTION_A] }),
    "engagement.cancel": (_c, m) => json({ schemaVersion: CFG, ok: true, accountId: m[1], engagementVersion: "of-engagement.v1", action: { ...ACTION_A, actionId: m[2], status: "cancelled", cancelRequested: true } }),
    ledger: (_c, m) => json(ledgerBody(m[1])),
    "ledger.retry": (c, m) => json({ schemaVersion: CTRL, ok: true, accepted: true, outcome: "queued", commandKey: (c.body as { commandKey: string }).commandKey, accountId: m[1], queuedAt: "2026-10-23T06:00:00Z" }),
  };
  const handlers = { ...defaults, ...overrides };
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers: Record<string, string> = {}; new Headers(init?.headers).forEach((v, k) => { headers[k.toLowerCase()] = v; });
    let body: unknown = null; try { body = init?.body ? JSON.parse(String(init.body)) : null; } catch { /* leave null */ }
    const call: Call = { method: init?.method ?? "GET", path: url.pathname, query: url.search, headers, body };
    calls.push(call);
    for (const [key, method, re] of routes) {
      const m = url.pathname.match(re);
      if (!m || method !== call.method) continue;
      const kind = url.pathname.includes("/configuration/") ? ["x-onlyfans-configuration-version", CFG, TOKENS.ONLYFANS_CONFIGURATION_TOKEN]
        : url.pathname.includes("/control/") ? ["x-onlyfans-control-version", CTRL, TOKENS.ONLYFANS_CONTROL_TOKEN] : ["x-onlyfans-schema-version", "of-preview.v2", TOKENS.ONLYFANS_API_TOKEN];
      if (headers.authorization !== `Bearer ${kind[2]}`) return json({ ok: false, code: "unauthorized" }, 401);
      if (headers[kind[0]] !== kind[1]) return json({ ok: false, code: "unsupported_schema" }, 400);
      return handlers[key]!(call, m);
    }
    return json({ ok: false, code: "not_found" }, 404);
  }) as typeof fetch;
  return { fetch: fetchImpl, calls, last: () => calls[calls.length - 1] };
}
