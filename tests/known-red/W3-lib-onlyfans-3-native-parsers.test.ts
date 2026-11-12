// KNOWN RED (W3 lib-onlyfans-3, findings L9-10..L9-19; docs/review/W3/lib-onlyfans-3.md). lib/onlyfans/launch/native.ts parsers
// admit backend payloads that contradict themselves, and the launch screens render the contradiction as backend truth
// (REVIEW inv 7: no false success; holds and STOP win).
// L9-10 :278,:293 readiness.ready:true with blockers listed ("ready: yes" beside blockers, PersonalityScreen.tsx:536,550).
// L9-11 :213-214 approved state with an empty review {} ("Approved: yes" with no reviewed persona).
// L9-12 :268-276 factComparisons changed:false while current !== proposed ("25 -> 30 (unchanged)").
// L9-13 :91-99,:222 creatorFacts evidenceIds that name no evidence row.
// L9-14 :641-654 recovery status "complete" with discovery incomplete / conversations retrying; :678-679 memory progress
//       storedMemoryComplete:true with pending messages ("Current stored messages processed").
// L9-15 :697 vs :786 accountControl.enabled vs autonomy.accountEnabled; readyToEnable:true with no checks;
//       archiveComplete:true with pending archive conversations.
// L9-16 :715,:763 + account-controls-route.ts:33-36 — the STOP control is only reachable through the whole readiness parse, so an
//       unrelated out-of-bounds field (31 worker capabilities, a new check status) removes the STOP button (inv 7: STOP is never
//       harder to trigger than a go). Fix: parse accountControl on its own (either fix shape below turns the test green).
// L9-17 :879-880 ledger evidence outcome "unknown" with resolved:true ("unknown · reconciled", inv 7 ledger unknown).
// L9-18 :417-421,:438 memory facts not from history keep unchecked provenance (quote:{}); interactions with sourceAt null.
// L9-19 :16-17 timestamp() is Date.parse: "1" is a valid timestamp (renders as 2001). Tested through parsePersonalityHistory only,
//       so a fix that renames or replaces the helper keeps the test meaningful.
// Team's Claude owns the fix. Not wired into npm scripts. Run: node --import tsx --test <this file>.
// Fixtures copied from scripts/check-onlyfans-launch.ts (personality), scripts/check-agency-launch.tsx (readiness),
// scripts/check-onlyfans-native-memory.ts (memory, progress, recovery), scripts/check-onlyfans-launch-browser.mjs (ledger).
import assert from "node:assert/strict";
import test from "node:test";
import * as native from "../../lib/onlyfans/launch/native";
import { parseMemoryProgress, parseNativeLedger, parseNativeMemory, parseNativePersonality, parseNativeReadiness,
  parsePersonalityHistory, parseRecoveryProgress } from "../../lib/onlyfans/launch/native";

const h = "a".repeat(64), stamp = "2026-10-23T00:00:00Z";

// ---------- personality (scripts/check-onlyfans-launch.ts draft) ----------
const draft = {
  version: "of-personality.v1", state: "draft", revision: 1, bindingId: "binding-a",
  document: {
    source: "canonical_history", review: { persona: "Short, warm replies." },
    draft: {
      creatorFacts: [] as unknown[], writingStyle: [], operationalInstructions: [],
      suggestedPersona: { text: "Short replies", attribution: "unknown", evidenceIds: [], selected: false, requiresReview: true,
        basis: "observed_account_style", warning: "Account authorship may be mixed." },
      evidence: [] as unknown[],
      coverage: { inputMessages: 20, uniqueMessages: 20, sampledMessages: 20, authorship: { creator: 0, agency: 0, unknown: 20, automation: 0 },
        method: "bounded sample", limitations: ["Not full provider history."] },
    },
  },
  configurationRevision: 3, configurationCurrent: true, configurationFingerprint: h, conflicts: [], requiresFactResolution: [],
  factComparisons: [] as unknown[],
  readiness: {
    ready: false, reviewRequired: true, blockers: ["personality_not_approved", "credential_missing"],
    model: { state: "ready", modelId: "deepseek-chat", provider: "deepseek", reasoningEffort: { state: "default", saved: null, resolved: null } },
    credential: { state: "missing", configured: false, metadataAvailable: true },
    budget: { state: "unset", dailyCostCapCents: 0 },
    tone: { state: "ready", conflicts: [], reviewRequired: true },
  },
  createdAt: stamp, actor: "op:1", commandKey: h,
};
const readyCredential = { state: "ready", configured: true, metadataAvailable: true };
const readyDraft = { ...draft, readiness: { ...draft.readiness, ready: true, blockers: [] as string[], credential: readyCredential } };
const approval = { acknowledgements: { mixedAuthorship: true, runtimeRules: true, factsVerified: true }, configurationCommandKey: h, appliedConfigurationRevision: 3 };
const approved = { ...draft, state: "approved", document: { ...draft.document, approval },
  readiness: { ...draft.readiness, blockers: ["credential_missing"] } };
const ageEvidence = { id: "ev-1", sourceId: "profile-1", kind: "profile", author: "profile", excerpt: "29", truncated: false };
const withFacts = (evidenceIds: string[], evidence: unknown[]) =>
  ({ ...draft, document: { ...draft.document, draft: { ...draft.document.draft, evidence,
    creatorFacts: [{ key: "age", value: "29", evidenceIds, attribution: "profile", selected: false }] } } });

test("control: L9-10..13 the personality fixtures parse (draft, ready draft, approved, fact with resolved evidence, consistent comparison)", () => {
  assert.ok(parseNativePersonality(draft), "draft");
  assert.ok(parseNativePersonality(readyDraft), "ready:true, no blockers, credential configured");
  assert.ok(parseNativePersonality(approved), "approved with a reviewed persona");
  assert.ok(parseNativePersonality(withFacts(["ev-1"], [ageEvidence])), "fact citing existing evidence");
  assert.ok(parseNativePersonality({ ...draft, factComparisons: [{ key: "age", current: "25", proposed: "30", changed: true }] }), "changed comparison");
});
test("L9-10: readiness ready:true with blockers listed is rejected", () => {
  const parsed = parseNativePersonality({ ...readyDraft, readiness: { ...readyDraft.readiness, blockers: ["personality_not_approved"] } });
  assert.equal(parsed, null, `readiness.ready must equal (blockers empty); actual ready ${parsed?.readiness?.ready} with blockers ${JSON.stringify(parsed?.readiness?.blockers)}`);
});
test("L9-11: an approved personality with an empty review is rejected", () => {
  const parsed = parseNativePersonality({ ...approved, document: { ...approved.document, review: {} } });
  assert.equal(parsed, null, `"approved" applies a saved review, so an empty review cannot be approved; actual state ${parsed?.state} review ${JSON.stringify(parsed?.document?.review)}`);
});
test("L9-12: a fact comparison marked unchanged with different values is rejected", () => {
  const parsed = parseNativePersonality({ ...draft, factComparisons: [{ key: "age", current: "25", proposed: "30", changed: false }] });
  assert.ok(parsed === null || parsed?.factComparisons?.[0]?.changed === true,
    `factComparisons[].changed must equal (current !== proposed): reject it or derive changed:true; actual ${JSON.stringify(parsed?.factComparisons)}`);
});
test("L9-13: a creator fact citing evidence that does not exist is rejected", () => {
  const parsed = parseNativePersonality(withFacts(["ghost"], []));
  assert.equal(parsed, null, `every evidenceId must resolve to an evidence row; actual creatorFacts ${JSON.stringify(parsed?.document?.draft.creatorFacts)} evidence ${JSON.stringify(parsed?.document?.draft.evidence)}`);
});

// ---------- recovery + memory progress (scripts/check-onlyfans-native-memory.ts) ----------
const account = "account-a";
const recovery = { schemaVersion: "of-history-recovery.v1", accountId: account, fanId: null, status: "incomplete", discoveryComplete: false,
  conversationsDiscovered: 125, conversationsComplete: 12, conversationsRetrying: 1, conversationsDeferredForLiveInput: 2, pagesCommitted: 20,
  messagesObserved: 400, messagesAdded: 395, totalMessages: null, percentComplete: null, recentRecoveryNeeded: true };
const recovered = { ...recovery, status: "complete", discoveryComplete: true, conversationsComplete: 125, conversationsRetrying: 0 };
const progress = { schemaVersion: "of-history-memory-progress.v1", algorithm: "english-patterns.v1", storedMessages: 120, processedCurrentMessages: 100,
  pendingMessages: 20, storedMemoryComplete: false, providerHistoryComplete: null, revision: 2, oldestStoredAt: stamp, newestStoredAt: stamp, lastProcessedAt: stamp };

test("control: L9-14 recovery (incomplete, and consistently complete) and memory progress (partial, and complete) parse", () => {
  assert.ok(parseRecoveryProgress(recovery, account));
  assert.ok(parseRecoveryProgress(recovered, account));
  assert.ok(parseMemoryProgress(progress));
  assert.ok(parseMemoryProgress({ ...progress, processedCurrentMessages: 120, pendingMessages: 0, storedMemoryComplete: true }));
});
test("L9-14: recovery status complete while discovery is incomplete is rejected", () => {
  const parsed = parseRecoveryProgress({ ...recovered, discoveryComplete: false }, account);
  assert.equal(parsed, null, `status "complete" requires discoveryComplete; actual status ${parsed?.status} discoveryComplete ${parsed?.discoveryComplete}`);
});
test("L9-14: recovery status complete while conversations are retrying is rejected", () => {
  const parsed = parseRecoveryProgress({ ...recovered, conversationsComplete: 124, conversationsRetrying: 1 }, account);
  assert.equal(parsed, null, `status "complete" requires zero retrying conversations; actual status ${parsed?.status} retrying ${parsed?.conversationsRetrying}`);
});
test("L9-14: memory progress storedMemoryComplete:true with pending messages is rejected", () => {
  const parsed = parseMemoryProgress({ ...progress, storedMemoryComplete: true });
  assert.equal(parsed, null, `storedMemoryComplete requires pendingMessages 0; actual complete ${parsed?.storedMemoryComplete} pending ${parsed?.pendingMessages}`);
});

// ---------- readiness (scripts/check-agency-launch.tsx sample, plus a fully processed variant) ----------
const check = { key: "memory", status: "unknown", blocking: false, observedAt: "2026-10-28T00:00:00Z", blocker: "full_memory_coverage_not_verified_inline", action: "history_memory" };
const readiness = { readinessVersion: "of-launch-readiness.v1", observedAt: "2026-10-28T00:00:00Z", schemaRevision: "0098_ledger_exclusion", readyToEnable: false,
  checks: [check] as unknown[],
  accountControl: { enabled: false, bindingId: "binding", revision: 0, unresolvedOutgoing: 1, fingerprint: h },
  coverage: { storedMessages: 10000, processedMessages: null as number | null, memorySample: { inspectedMessages: 50, processedCurrentMessages: 49, complete: false } as unknown,
    providerTotalMessages: null, archiveComplete: false, pendingArchiveConversations: 2 },
  catalogue: { usableInspectedItems: 0, inspectedItems: 0, hasMore: false },
  autonomy: { accountEnabled: false, deliveryEnabled: false, existingAutomatedConversations: 0, automateNewConversations: false, engagementEnabled: false,
    workerCapabilities: {} as Record<string, boolean> },
  limits: [] as string[] };
/** Memory fully processed, so the coverage rule does not depend on a "memory unknown" check. */
const processed = { ...readiness, checks: [{ ...check, status: "ready", blocking: true, blocker: null }],
  coverage: { storedMessages: 10000, processedMessages: 10000, providerTotalMessages: null, archiveComplete: true, pendingArchiveConversations: 0 } };
/** Ready to enable and consistent everywhere: every check key ReadinessScreen.tsx:13-28 names, all ready and blocking, nothing outgoing unresolved. */
const CHECK_KEYS = ["schema", "connection", "worker", "recentIntake", "archive", "memory", "ledger", "model", "credential", "budget", "personality",
  "deliveryPolicy", "catalogue", "engagement"];
const readyToEnable = { ...processed, readyToEnable: true,
  checks: CHECK_KEYS.map(key => ({ key, status: "ready", blocking: true, observedAt: check.observedAt, blocker: null, action: null })),
  accountControl: { ...readiness.accountControl, unresolvedOutgoing: 0 },
  catalogue: { usableInspectedItems: 1, inspectedItems: 1, hasMore: false } };

test("control: L9-15/16 the readiness fixtures parse (partial memory sample, fully processed, ready to enable with a ready check)", () => {
  assert.ok(parseNativeReadiness(readiness));
  assert.ok(parseNativeReadiness(processed));
  assert.ok(parseNativeReadiness(readyToEnable), "ready to enable with every check ready");
  assert.ok(parseNativeReadiness({ ...readiness, accountControl: { ...readiness.accountControl, enabled: true }, autonomy: { ...readiness.autonomy, accountEnabled: true } }),
    "agreeing enabled flags");
});
test("L9-15: accountControl.enabled false while autonomy.accountEnabled true is rejected", () => {
  const parsed = parseNativeReadiness({ ...readiness, autonomy: { ...readiness.autonomy, accountEnabled: true } });
  const autonomy = parsed?.autonomy as { accountEnabled?: unknown } | undefined;
  assert.ok(parsed === null || autonomy?.accountEnabled === undefined || parsed?.accountControl?.enabled === autonomy.accountEnabled,
    `accountControl.enabled must equal autonomy.accountEnabled (reject, or keep one runtime-enabled field); actual ${parsed?.accountControl?.enabled} vs ${autonomy?.accountEnabled}`);
});
test("L9-15: readyToEnable:true with no checks is rejected", () => {
  const parsed = parseNativeReadiness({ ...processed, readyToEnable: true, checks: [] });
  assert.equal(parsed, null, `readyToEnable needs at least one check proving it; actual readyToEnable ${parsed?.readyToEnable} with checks ${JSON.stringify(parsed?.checks)}`);
});
test("L9-15: archiveComplete:true with pending archive conversations is rejected", () => {
  const parsed = parseNativeReadiness({ ...readiness, coverage: { ...readiness.coverage, archiveComplete: true, pendingArchiveConversations: 2 } });
  assert.equal(parsed, null, `archiveComplete requires zero pending archive conversations; actual complete ${parsed?.coverage.archiveComplete} pending ${parsed?.coverage.pendingArchiveConversations}`);
});

// L9-16: either fix shape (a standalone parseAccountControl, or a readiness parse that keeps accountControl) turns this green.
// A standalone parser may take the accountControl object or the whole payload: both shapes are tried, the first non-null wins.
const controlOf = (value: typeof readiness): unknown => {
  const mod = native as unknown as { parseAccountControl?: (v: unknown) => unknown };
  const attempt = (run: () => unknown) => { try { return run() ?? null; } catch { return null; } };
  return (mod.parseAccountControl && (attempt(() => mod.parseAccountControl!(value.accountControl)) ?? attempt(() => mod.parseAccountControl!(value))))
    ?? attempt(() => parseNativeReadiness(value)?.accountControl);
};
test("control: L9-16 a valid readiness yields its account control", () => {
  assert.deepEqual(controlOf(readiness), readiness.accountControl);
});
test("L9-16: 31 worker capabilities do not remove the account control (STOP)", () => {
  const workerCapabilities = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`capability_${i}`, true]));
  const control = controlOf({ ...readiness, autonomy: { ...readiness.autonomy, workerCapabilities } });
  assert.notEqual(control, null, `STOP must not depend on unrelated readiness fields (inv 7); actual account control ${JSON.stringify(control)} for 31 workerCapabilities`);
});
test("L9-16: an unknown check status does not remove the account control (STOP)", () => {
  const control = controlOf({ ...readiness, checks: [check, { ...check, key: "ledger", status: "degraded" }] });
  assert.notEqual(control, null, `STOP must not depend on unrelated readiness fields (inv 7); actual account control ${JSON.stringify(control)} for a "degraded" check`);
});

// ---------- ledger (scripts/check-onlyfans-launch-browser.mjs) ----------
const evidence = { evidenceHash: h, providerTransactionId: "provider-tx", fanId: "9007199254740993", transactionId: "12", messageId: "4",
  amountCents: 1999, currency: "USD", status: "cleared", outcome: "conflict", resolved: false, recordedAt: stamp, supportedAction: "reconcile_evidence", blocker: null };
const ledger = { ledgerVersion: "of-ledger.v1", observedAt: stamp, bindingCurrent: true, status: "running", windowStart: stamp, windowEnd: stamp,
  pageOffset: 40, lastCompleteAt: null, lastFullAt: null, leaseUntil: stamp, activeLease: false, nextPollAt: stamp, lastError: "provider_read_deferred",
  updatedAt: stamp, fresh: false, unresolvedTransactions: 1, conflictingEvidence: 1, commerceHold: true, fingerprint: h, evidence: [evidence], nextCursor: null };

test("control: L9-17 the ledger fixture and an unresolved unknown outcome parse", () => {
  assert.ok(parseNativeLedger(ledger));
  assert.ok(parseNativeLedger({ ...ledger, evidence: [{ ...evidence, outcome: "unknown", resolved: false }] }));
});
test("L9-17: ledger evidence outcome unknown marked resolved is rejected", () => {
  const parsed = parseNativeLedger({ ...ledger, evidence: [{ ...evidence, outcome: "unknown", resolved: true }] });
  assert.equal(parsed, null, `an "unknown" ledger outcome is never resolved (inv 7); actual outcome ${parsed?.evidence[0].outcome} resolved ${parsed?.evidence[0].resolved}`);
});

// ---------- memory (scripts/check-onlyfans-native-memory.ts detail().memory) ----------
const fanId = "9007199254740993", version = h;
const memory = { schemaVersion: "of-history-memory.v1", algorithm: "english-patterns.v1", revision: 2, version, canonicalDigest: version, fingerprint: version,
  facts: { home_city: { value: "Brisbane", source: "history", sourceMessageId: fanId, sourceAt: stamp, quote: "I live in Brisbane", sourceDigest: version } } as Record<string, unknown>,
  summaries: { short_bio: "Saved notes", bullet_points: null }, overrides: { hobbies: { operation: "clear", revision: 2 } },
  interactions: [{ sourceMessageId: fanId, sourceAt: stamp as string | null, direction: "in", excerpt: "I live in Brisbane", sourceDigest: version }],
  summaryKind: "saved_profile_and_source_excerpts" };

test("control: L9-18 the memory fixture and a plain operator fact parse", () => {
  assert.ok(parseNativeMemory(memory));
  assert.ok(parseNativeMemory({ ...memory, facts: { ...memory.facts, real_name: { value: "Al", source: "operator", revision: 3 } } }));
});
test("L9-18: an operator fact carrying a non-string quote is rejected", () => {
  const parsed = parseNativeMemory({ ...memory, facts: { ...memory.facts, real_name: { value: "Al", source: "operator", quote: {}, revision: 3 } } });
  assert.equal(parsed, null, `fact provenance fields must be validated for every source; actual real_name ${JSON.stringify(parsed?.facts.real_name)}`);
});
test("L9-18: an interaction with a null sourceAt is rejected", () => {
  const parsed = parseNativeMemory({ ...memory, interactions: [{ ...memory.interactions[0], sourceAt: null }] });
  assert.equal(parsed, null, `interactions[].sourceAt is a required timestamp; actual ${JSON.stringify(parsed?.interactions[0].sourceAt)}`);
});

// ---------- timestamp ----------
test("control: L9-19 history with an ISO createdAt parses", () => {
  assert.ok(parsePersonalityHistory({ revisions: [{ revision: 1, state: "draft", actor: "op:1", createdAt: stamp }], nextBefore: null }));
});
test("L9-19: personality history createdAt \"1\" is rejected", () => {
  const parsed = parsePersonalityHistory({ revisions: [{ revision: 1, state: "draft", actor: "op:1", createdAt: "1" }], nextBefore: null });
  assert.equal(parsed, null, `history createdAt must be an ISO instant; actual ${JSON.stringify(parsed?.revisions[0].createdAt)}`);
});
