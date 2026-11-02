/** Synthetic native contract regressions. Integrated and live evidence are separate. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createLaunchBackend,
  type LaunchBackend,
} from "../lib/onlyfans/launch/a-backend";
import {
  dispatchLaunch,
  type LaunchCall,
} from "../lib/onlyfans/launch/a-route";
import { validCommand } from "../lib/onlyfans/launch/a-types";
import { LEDGER_ERRORS, parseLedger, retryAdvice } from "../lib/onlyfans/launch/ledger-model";
import {
  parseNativePersonality,
  parsePersonalityHistory,
  parseEngagementAction,
  parseNativeLedger,
} from "../lib/onlyfans/launch/native";
import {
  createNativeConfigurationBackend,
  createNativeReadBackend,
  createNativeControlBackend,
} from "../lib/onlyfans/launch/native-backend";
import {
  CONFIGURATION_HEADER,
  CONFIGURATION_SCHEMA,
  validConfigurationRequest,
} from "../lib/onlyfans/configuration";
import { CONTROL_HEADER, CONTROL_SCHEMA } from "../lib/onlyfans/controls";
import { ONLYFANS_PREVIEW_SCHEMA_VERSION } from "../lib/onlyfans-preview/types";
const h = "a".repeat(64),
  stamp = "2026-10-23T00:00:00Z";
const empty = {
  version: "of-personality.v1",
  state: "empty",
  revision: 0,
  bindingId: "binding-a",
  document: null,
};
const draft = {
  version: "of-personality.v1",
  state: "draft",
  revision: 1,
  bindingId: "binding-a",
  document: {
    source: "canonical_history",
    review: { persona: "Short, warm replies." },
    draft: {
      creatorFacts: [],
      writingStyle: [],
      operationalInstructions: [],
      suggestedPersona: {
        text: "Short replies",
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
  configurationFingerprint: h,
  conflicts: [],
  requiresFactResolution: [],
  factComparisons: [],
  readiness: {
    ready: false,
    reviewRequired: true,
    blockers: ["personality_not_approved", "credential_missing"],
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
    budget: { state: "unset", dailyCostCapCents: 0 },
    tone: { state: "ready", conflicts: [], reviewRequired: true },
  },
  createdAt: stamp,
  actor: "op:1",
  commandKey: h,
};
const jr = (v: unknown, status = 200) => Response.json(v, { status });
const call = (x: Partial<LaunchCall> = {}): LaunchCall => ({
  method: "GET",
  accountId: "acc-a",
  path: ["personality"],
  query: new URLSearchParams(),
  actor: "op:1",
  canManage: true,
  ...x,
});
const command = {
  path: "personality/import",
  id: null,
  body: { expectedRevision: 0, expectedBindingId: "binding-a" },
};

test("personality validates document revision, provenance and readiness", () => {
  assert(parseNativePersonality(empty));
  assert(parseNativePersonality(draft));
  for (const bad of [
    { ...draft, revision: "1" },
    { ...draft, version: "of-personality.v0" },
    { ...draft, state: "approved" },
    { ...draft, readiness: { ...draft.readiness, ready: true } },
    { ...draft, readiness: { ...draft.readiness, ready: true, credential: {state:"ready", configured:true, metadataAvailable:false} } },
    {
      ...draft,
      readiness: { ...draft.readiness, credential: { state: "ready" } },
    },
    {
      ...draft,
      document: {
        ...draft.document,
        review: { persona: "good", dailyCostCapCents: 100 },
      },
    },
  ])
    assert.equal(parseNativePersonality(bad), null);
});
test("document review and approval require explicit acknowledgements and native revision", () => {
  assert(validCommand(command));
  assert.equal(validCommand({ ...command, body: {expectedRevision: 0} }), false, "displayed creator binding is mandatory");
  assert(
    validCommand({
      path: "personality/review",
      id: null,
      body: {
        expectedRevision: 1, expectedBindingId: "binding-a",
        review: { persona: "Warm", creatorFacts: { job: "Trainer" } },
      },
    }),
  );
  assert(
    validCommand({
      path: "personality/approve",
      id: null,
      body: {
        expectedRevision: 2, expectedBindingId: "binding-a",
        acknowledgements: {
          mixedAuthorship: true,
          runtimeRules: true,
          factsVerified: true,
        },
      },
    }),
  );
  for (const acknowledgements of [
    {},
    { mixedAuthorship: true, runtimeRules: true, factsVerified: false },
    {
      mixedAuthorship: true,
      runtimeRules: true,
      factsVerified: true,
      extra: true,
    },
  ])
    assert.equal(
      validCommand({
        path: "personality/approve",
        id: null,
        body: { expectedRevision: 2, expectedBindingId: "binding-a", acknowledgements },
      }),
      false,
    );
  assert.equal(
    validCommand({
      path: "personality/approve",
      id: null,
      body: { expectedRevision: 2 },
    }),
    false,
  );
  assert.equal(
    validCommand({
      path: "personality/draft",
      id: "fact-1",
      body: { expectedRevision: 2, expectedBindingId: "binding-a", edited: "x" },
    }),
    false,
  );
});
test("ledger permits evidence reconciliation, never arbitrary ownership choices", () => {
  assert(
    validCommand({
      path: "ledger/retry",
      id: null,
      body: { expectedConnectionRevision: 4, expectedScanFingerprint: h },
    }),
  );
  assert(
    validCommand({
      path: "ledger/resolve",
      id: null,
      body: {
        expectedFingerprint: h,
        evidenceHash: h,
        reason: "Review linked transaction",
      },
    }),
  );
  for (const resolution of ["confirmed_owned", "not_owned", "leave_unmatched"])
    assert.equal(
      validCommand({
        path: "purchases/resolve",
        id: "x",
        body: { expectedRevision: 1, expectedBindingId: "binding-a", resolution, reason: "x", evidenceId: "e" },
      }),
      false,
    );
  for (const body of [
    { expectedFingerprint: h, reason: "" },
    { expectedFingerprint: h, reason: "x", actor: "spoof" },
    { expectedFingerprint: h, reason: "x", ownership: true },
  ])
    assert.equal(validCommand({ path: "ledger/retry", id: null, body }), false);
});
test("access works without backend, missing services never fabricate account data", async () => {
  assert.equal(
    (await dispatchLaunch(call({ path: ["access"], canManage: false }), null))
      .status,
    200,
  );
  const r = await dispatchLaunch(call(), null);
  assert.equal(r.status, 503);
  assert.equal((r.body as { outcome: string }).outcome, "unavailable");
});
test("read-only staff and absent actor cannot invoke commands", async () => {
  let writes = 0;
  const b: LaunchBackend = {
    read: async () => ({ ok: true, data: empty }),
    command: async () => {
      writes++;
      return { ok: true, data: empty };
    },
  };
  for (const change of [{ canManage: false }, { actor: null }])
    assert.equal(
      (
        await dispatchLaunch(
          call({ method: "POST", path: ["command"], body: command, ...change }),
          b,
        )
      ).status,
      403,
    );
  assert.equal(writes, 0);
});
test("actor and stable identical-retry identity derive on the server", async () => {
  const writes: { path: string; body: unknown }[] = [];
  const b: LaunchBackend = {
    read: async () => ({ ok: true, data: empty }),
    command: async (_a, path, body) => {
      writes.push({ path, body });
      return { ok: true, data: empty };
    },
  };
  for (const body of [
    command,
    structuredClone(command),
    { ...command, body: { expectedRevision: 1, expectedBindingId: "binding-a" } },
    { ...command, body: { expectedRevision: 0, expectedBindingId: "binding-b" } },
  ])
    assert.equal(
      (
        await dispatchLaunch(
          call({ method: "POST", path: ["command"], body }),
          b,
        )
      ).status,
      200,
    );
  const rows = writes.map(
    (x) => x.body as { actor: string; commandKey: string },
  );
  assert.equal(writes[0].path, "personality/import");
  assert.equal(rows[0].actor, "op:1");
  assert.match(rows[0].commandKey, /^[a-f0-9]{64}$/);
  assert.equal(rows[0].commandKey, rows[1].commandKey);
  assert.notEqual(rows[0].commandKey, rows[2].commandKey);
  assert.notEqual(rows[0].commandKey, rows[3].commandKey, "rebound creator never reuses command identity");
  assert.equal(
    (
      await dispatchLaunch(
        call({
          method: "POST",
          path: ["command"],
          body: { ...command, body: { expectedRevision: 0, expectedBindingId: "binding-a", actor: "spoof" } },
        }),
        b,
      )
    ).status,
    400,
  );
});
test("history revisions and evidence cursors reject malformed and duplicate query fields", async () => {
  const reads: { path: string; q: Record<string, string> }[] = [];
  const b: LaunchBackend = {
    read: async (_a, path, q) => {
      reads.push({ path, q });
      return { ok: true, data: {} };
    },
    command: async () => ({ ok: true, data: {} }),
  };
  assert.equal(
    (
      await dispatchLaunch(
        call({
          path: ["personality", "history"],
          query: new URLSearchParams("before=9"),
        }),
        b,
      )
    ).status,
    200,
  );
  assert.deepEqual(reads[0], {
    path: "personality/history",
    q: { before: "9" },
  });
  for (const query of ["before=0", "before=1&before=2", "before=4&actor=x"])
    assert.equal(
      (
        await dispatchLaunch(
          call({
            path: ["personality", "history"],
            query: new URLSearchParams(query),
          }),
          b,
        )
      ).status,
      400,
    );
  assert.equal(
    (
      await dispatchLaunch(
        call({
          path: ["purchases", "evidence"],
          query: new URLSearchParams("cursor=opaque_abc&limit=25"),
        }),
        b,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await dispatchLaunch(
        call({ path: ["purchases", "evidence"], query: new URLSearchParams("limit=101") }),
        b,
      )
    ).status,
    400,
  );
  assert.equal(
    (await dispatchLaunch(call({ path: ["personality", "revisions", "7"] }), b))
      .status,
    200,
  );
  assert.equal(
    (
      await dispatchLaunch(
        call({ path: ["personality", "revisions", "../x"] }),
        b,
      )
    ).status,
    404,
  );
});
test("personality uses existing configuration-purpose transport and exact version", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const b = createLaunchBackend({
    baseUrl: "https://b.example/",
    token: "configuration-token",
    fetchImpl: (async (url, init) => {
      seen = { url: String(url), init: init! };
      return jr({
        schemaVersion: CONFIGURATION_SCHEMA,
        ok: true,
        accountId: "acc-a",
        personalityVersion: "of-personality.v1",
        personality: empty,
      });
    }) as typeof fetch,
  });
  assert.equal((await b.read("acc-a", "personality", {})).ok, true);
  assert.equal(
    seen!.url,
    "https://b.example/onlyfans/configuration/v1/accounts/acc-a/personality",
  );
  assert.equal(
    new Headers(seen!.init.headers).get(CONFIGURATION_HEADER),
    CONFIGURATION_SCHEMA,
  );
  assert.equal(
    new Headers(seen!.init.headers).get("Authorization"),
    "Bearer configuration-token",
  );
});
test("wrong account/version and mutation acknowledgement mismatch fail closed", async () => {
  for (const wrong of [
    {
      schemaVersion: "of-launch.v1",
      ok: true,
      accountId: "acc-a",
      personality: empty,
    },
    {
      schemaVersion: CONFIGURATION_SCHEMA,
      ok: true,
      accountId: "acc-b",
      personality: empty,
    },
  ]) {
    const b = createLaunchBackend({
      baseUrl: "https://b.example",
      token: "config",
      fetchImpl: (async () => jr(wrong)) as typeof fetch,
    });
    assert.equal((await b.read("acc-a", "personality", {})).ok, false);
  }
  const send = createNativeConfigurationBackend({
    baseUrl: "https://b.example",
    token: "config",
    fetchImpl: (async () =>
      jr({
        schemaVersion: CONFIGURATION_SCHEMA,
        ok: true,
        accountId: "acc-a",
        commandKey: "b".repeat(64),
        personality: empty,
      })) as typeof fetch,
  });
  const r = await send("acc-a", "personality/import", "POST", {
    commandKey: h,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.outcome, "unconfirmed");
});
test("lost write replies stay unknown, explicit409 remains conflict", async () => {
  const b = createLaunchBackend({
    baseUrl: "https://b.example",
    token: "config",
    fetchImpl: (async () => {
      throw new Error("socket");
    }) as typeof fetch,
  });
  const r = await b.command("acc-a", "personality/import", { commandKey: h });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.outcome, "unconfirmed");
  const c = createLaunchBackend({
    baseUrl: "https://b.example",
    token: "config",
    fetchImpl: (async () => jr({}, 409)) as typeof fetch,
  });
  const q = await c.command("acc-a", "personality/import", { commandKey: h });
  assert.equal(q.ok, false);
  if (!q.ok) assert.deepEqual([q.status, q.outcome], [409, "refused"]);
});
test("read and control requests use distinct native-purpose paths and headers", async () => {
  const seen: { url: string; headers: Headers }[] = [];
  const f = (async (url, init) => {
    seen.push({ url: String(url), headers: new Headers(init?.headers) });
    return jr(
      String(url).includes("/control/")
        ? {
            schemaVersion: CONTROL_SCHEMA,
            ok: true,
            accountId: "acc-a",
            command: { recorded: true, commandKey: h },
          }
        : {
            schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION,
            ok: true,
            accountId: "acc-a",
            readiness: {},
          },
    );
  }) as typeof fetch;
  assert(
    (
      await createNativeReadBackend({
        baseUrl: "https://b.example",
        token: "read",
        fetchImpl: f,
      })("acc-a", "readiness")
    ).ok,
  );
  assert(
    (
      await createNativeControlBackend({
        baseUrl: "https://b.example",
        token: "control",
        fetchImpl: f,
      })("acc-a", "control", { commandKey: h })
    ).ok,
  );
  assert.match(seen[0].url, /\/onlyfans\/api\/v1\//);
  assert.equal(
    seen[0].headers.get("X-OnlyFans-Schema-Version"),
    ONLYFANS_PREVIEW_SCHEMA_VERSION,
  );
  assert.equal(seen[1].headers.get(CONTROL_HEADER), CONTROL_SCHEMA);
  assert.notEqual(
    seen[0].headers.get("Authorization"),
    seen[1].headers.get("Authorization"),
  );
});
test("audit pagination and all durable engagement states remain truthful", () => {
  assert(
    parsePersonalityHistory({
      revisions: [
        { revision: 9, state: "approved", actor: "op:1", createdAt: stamp },
      ],
      nextBefore: 9,
    }),
  );
  assert.equal(
    parsePersonalityHistory({
      revisions: [
        { revision: "9", state: "approved", actor: "op:1", createdAt: stamp },
      ],
      nextBefore: 9,
    }),
    null,
  );
  const a = {
    actionId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    fanId: "9007199254740993",
    kind: "follow_up",
    dueAt: stamp,
    expiresAt: stamp,
    intentId: "intent",
    reason: null,
    cancelRequested: true,
  };
  for (const status of [
    "scheduled",
    "queued",
    "dispatching",
    "accepted",
    "not_accepted",
    "unknown",
    "cancelled",
    "expired",
  ])
    assert.equal(parseEngagementAction({ ...a, status })?.status, status);
  assert.equal(parseEngagementAction({ ...a, status: "sent" }), null);
  assert.equal(
    parseEngagementAction({
      ...a,
      status: "accepted",
      fanId: 9007199254740993,
    }),
    null,
  );
});
test("daily budget and reasoning use configuration revision guards, exact integer cents", () => {
  for (const dailyCostCapCents of [0, 1, 1000000])
    assert(
      validConfigurationRequest({
        patch: { dailyCostCapCents, reasoningEffort: null },
        expectedRevision: 1,
        expectedFingerprint: h,
      }),
    );
  for (const dailyCostCapCents of [-1, 1.5, 1000001, "100"])
    assert.equal(
      validConfigurationRequest({
        patch: { dailyCostCapCents },
        expectedRevision: 1,
        expectedFingerprint: h,
      }),
      false,
    );
});
test("ledger display preserves integer cents even at safe-integer boundaries and reversals", async () => {
  const { formatCents } = await import(
    "../components/onlyfans-launch/a-shared"
  );
  for (const [c, want] of [
    [0, "0.00 USD"],
    [1999, "19.99 USD"],
    [-1999, "-19.99 USD"],
    [9007199254740899, "90071992547408.99 USD"],
    [Number.MAX_SAFE_INTEGER, "90071992547409.91 USD"],
  ] as const)
    assert.equal(formatCents(c, "USD"), want);
  assert.equal(formatCents(NaN, "USD"), "amount unknown");
});

test("personality acknowledgements remain bound to the displayed creator and exact resulting revision", async () => {
  const body = { expectedRevision: 0, expectedBindingId: "binding-a", actor: "op:1", commandKey: h };
  for (const [personality, accepted] of [[draft, true], [{ ...draft, bindingId: "binding-b" }, false], [{ ...draft, revision: 2 }, false], [empty, false]] as const) {
    const b = createLaunchBackend({ baseUrl: "https://b.example", token: "config", fetchImpl: (async () => jr({ schemaVersion: CONFIGURATION_SCHEMA, ok: true, accountId: "acc-a", personalityVersion: "of-personality.v1", commandKey: h, personality })) as typeof fetch });
    const result = await b.command("acc-a", "personality/import", body);
    assert.equal(result.ok, accepted);
    if (!result.ok) assert.equal(result.outcome, "unconfirmed");
  }
});

test("canonical ledger retry uses the displayed scan CAS and trusted actor header with a queued-only acknowledgement", async () => {
  const body = { commandKey: h, actor: "op:1", expectedConnectionRevision: 7, expectedScanFingerprint: h };
  let sent: { headers: Headers; body: Record<string, unknown> } | undefined;
  let response = { schemaVersion: CONTROL_SCHEMA, ok: true, accountId: "acc-a", accepted: true, outcome: "queued", commandKey: h, queuedAt: stamp };
  const send = createNativeControlBackend({ baseUrl: "https://b.example", token: "control", fetchImpl: (async (_u, init) => {
    sent = {headers:new Headers(init?.headers),body:JSON.parse(String(init?.body))}; return jr(response);
  }) as typeof fetch });
  assert((await send("acc-a", "ledger/retry", body)).ok);
  assert.equal(sent!.headers.get("X-OnlyFans-Actor"), "op:1");
  assert.deepEqual(sent!.body, {commandKey:h,expectedConnectionRevision:7,expectedScanFingerprint:h});
  response = {...response, outcome:"completed"};
  const bad = await send("acc-a", "ledger/retry", body);
  assert(!bad.ok && bad.outcome === "unconfirmed");
  assert.equal(validCommand({path:"ledger/retry",id:null,body:{expectedConnectionRevision:7,expectedScanFingerprint:null}}),false);
});

test("canonical ledger status refuses incompatible evidence and gates retry on a held current scan", () => {
  const ledger = {schemaVersion:"of-ledger.v1",accountId:"acc-a",status:"held",windowStart:stamp,windowEnd:stamp,pageOffset:40,lastCompleteAt:null,lastFullAt:null,nextPollAt:stamp,lastError:"ledger_read_failed",leaseActive:false,connectionCurrent:true,connectionRevision:7,conflictCount:1,unlinkedPaidCount:1,requiresInvestigation:true,commerceHeld:true,scanFingerprint:h};
  const parsed = parseLedger(ledger, "acc-a");
  assert(parsed && retryAdvice(parsed, true).allowed);
  for (const error of LEDGER_ERRORS) assert(parseLedger({...ledger,lastError:error},"acc-a"));
  for (const changed of [{accountId:"acc-b"},{schemaVersion:"of-ledger.v0"},{scanFingerprint:null},{pageOffset:1.5},{lastError:"provider_prose"},{extra:true}])
    assert.equal(parseLedger({...ledger,...changed},"acc-a"),null);
  assert.equal(retryAdvice(parsed!,false).allowed,false);
  for (const changed of [{status:"idle" as const},{status:"running" as const},{leaseActive:true},{connectionCurrent:false},{connectionRevision:null}])
    assert.equal(retryAdvice({...parsed!,...changed},true).allowed,false);
  const notStarted = {...ledger,status:"not_started",windowStart:null,windowEnd:null,pageOffset:null,lastCompleteAt:null,lastFullAt:null,nextPollAt:null,lastError:null,leaseActive:false,connectionCurrent:false,scanFingerprint:null};
  assert(parseLedger(notStarted,"acc-a"));
  assert.equal(parseLedger({...notStarted,windowStart:stamp},"acc-a"),null);
});
