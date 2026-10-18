// OF-D0 contract checks.
//
// These prove the fixture frontend's behaviour, and nothing else. They do not
// prove backend security, backend correctness or production reliability: there
// is no backend for them to reach. What they do establish is that the preview
// cannot silently cross the boundaries it claims to hold:
//
//    1. two accounts never share a selected conversation or a cache entry;
//    2. an out-of-order response can never overwrite a newer selection within a
//       scope, and a thread read cannot invalidate the list's own read;
//    3. a response from a previous scope can never be applied to a new one, even
//       though a scope reset restarts the sequence numbers;
//    4. a selection the newest read no longer supports is dropped;
//    5. an unresolved send withdraws exactly the actions that could start
//       another send, and no others;
//    6. the rollup, the bubble receipts and the recorded attempt always agree;
//    7. paging never relabels a stale list as current;
//    8. a command carries its account, its payload and a content-addressed
//       identity, and a malformed one is refused;
//    9. the preview cannot fall through to a live transport, and its module
//       graph, including its own layout, imports no database client, no live
//       root layout and no production data provider.
//
// Run: npm run test:onlyfans-preview

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  availableActions,
  canSubmitCommand,
  commandPayloadProblem,
  createCommandRequest,
  isDeliveryUnresolved,
} from "../lib/onlyfans-preview/actions";
import {
  createFixtureOnlyFansDataSource,
  operatorViewer,
  readOnlyView,
} from "../lib/onlyfans-preview/fixture-data-source";
import { OnlyFansApiNotConfiguredError } from "../lib/onlyfans-preview/data-source";
import { createOnlyFansDataSource } from "../lib/onlyfans-preview/sources";
import {
  accounts as fixtureAccounts,
  conversationDetails,
  conversationsByAccount,
} from "../lib/onlyfans-preview/fixtures";
import { DEFAULT_CONTROLS, STALE_FRESHNESS, withDetailOverrides } from "../lib/onlyfans-preview/scenarios";
import {
  appendConversations,
  applyAccounts,
  applyConversation,
  applyConversations,
  beginAccounts,
  beginScope,
  cachedConversationIds,
  currentConversationState,
  initialSelectionState,
  requestConversation,
  requestConversations,
  requestMoreConversations,
  selectAccount,
  selectConversation,
} from "../lib/onlyfans-preview/selection";
import type {
  ConversationSummary,
  CursorPage,
  DeliveryOutcome,
  OfAccount,
  RequestState,
} from "../lib/onlyfans-preview/types";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let checks = 0;
let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  }
}

function group(title: string) {
  console.log(`\n${title}`);
}

const AVA = "of-acc-ava-001";
const AVA_SECOND = "of-acc-ava-005";
const LUNA = "of-acc-luna-003";

function readyAccount(id: string): OfAccount {
  const found = fixtureAccounts.find((account) => account.accountId === id);
  if (!found) throw new Error(`Fixture account ${id} is missing.`);
  return found;
}

function summary(accountId: string, conversationId: string): ConversationSummary {
  const found = (conversationsByAccount[accountId] ?? []).find(
    (item) => item.conversationId === conversationId,
  );
  if (!found) throw new Error(`Fixture conversation ${conversationId} is missing.`);
  return found;
}

function readyPage(items: ConversationSummary[]): RequestState<CursorPage<ConversationSummary>> {
  return { status: "ready", data: { items, nextCursor: null } };
}

async function main() {
  // 1. Account isolation
  group("1. Two accounts never share a selected conversation or a cache entry");
  {
    let state = initialSelectionState();
    state = selectAccount(state, AVA);
    state = selectConversation(state, AVA, "of-conv-ava-1001");

    const beforeSwitch = state.byAccount[AVA];
    state = selectAccount(state, AVA_SECOND);
    check(
      "selecting another account leaves the first account's entry untouched",
      state.byAccount[AVA] === beforeSwitch,
    );
    check(
      "the other account starts with nothing selected",
      state.byAccount[AVA_SECOND].selectedConversationId === null,
    );

    state = selectConversation(state, AVA_SECOND, "of-conv-ava-1001");
    const foreign = currentConversationState(state);
    check(
      "a conversation id from another account never resolves as this account's thread",
      foreign === null || foreign.status === "loading",
      `resolved as ${foreign ? foreign.status : "null"}`,
    );

    const seeded = beginAccounts(state);
    state = seeded.state;
    state = applyAccounts(state, seeded.generation, { status: "ready", data: fixtureAccounts });
    const cached = applyConversation(state, AVA, "of-conv-ava-1001", state.scopeGeneration, 1, {
      status: "empty",
    }).state;
    state = selectAccount(cached, AVA_SECOND);
    const secondDetail = currentConversationState(state);
    check(
      "the first account's cached thread is never shown for the second account",
      secondDetail === null || secondDetail.status === "loading",
      `resolved as ${secondDetail ? secondDetail.status : "null"}`,
    );
    check("the first account keeps its own cache entry", cachedConversationIds(state, AVA).length === 1);
    check(
      "the untouched account has an empty cache",
      cachedConversationIds(state, AVA_SECOND).length === 0,
    );
  }

  // 2. Out-of-order responses within a scope
  group("2. A stale response cannot overwrite a newer selection");
  {
    let state = initialSelectionState();
    state = selectAccount(state, AVA);

    const firstPage = requestConversations(state, AVA);
    state = firstPage.state;
    const secondPage = requestConversations(state, AVA);
    state = secondPage.state;

    const lateList = applyConversations(
      state,
      AVA,
      firstPage.generation,
      firstPage.seq,
      readyPage([summary(AVA, "of-conv-ava-1001")]),
    );
    check("a late list read is dropped", lateList.applied === false);

    const currentList = applyConversations(
      lateList.state,
      AVA,
      secondPage.generation,
      secondPage.seq,
      readyPage([summary(AVA, "of-conv-ava-1003")]),
    );
    check("the newest list read is applied", currentList.applied === true);
    const list = currentList.state.byAccount[AVA].conversations;
    check(
      "only the newest page is on screen",
      list.status === "ready" &&
        list.data.items.length === 1 &&
        list.data.items[0].conversationId === "of-conv-ava-1003",
    );

    let thread = currentList.state;
    const firstRead = requestConversation(thread, AVA, "of-conv-ava-1001");
    thread = firstRead.state;
    const secondRead = requestConversation(thread, AVA, "of-conv-ava-1001");
    thread = secondRead.state;
    const lateThread = applyConversation(thread, AVA, "of-conv-ava-1001", firstRead.generation, firstRead.seq, {
      status: "empty",
    });
    check("a late thread read of the same thread is dropped", lateThread.applied === false);
    const currentThread = applyConversation(
      lateThread.state,
      AVA,
      "of-conv-ava-1001",
      secondRead.generation,
      secondRead.seq,
      { status: "error", message: "newer read" },
    );
    check("the newest thread read is applied", currentThread.applied === true);

    // Opening a thread must not invalidate the list's own outstanding read, or
    // the list sits on its loading state with data already on the way.
    let mixed = initialSelectionState();
    mixed = selectAccount(mixed, AVA);
    const listRead = requestConversations(mixed, AVA);
    mixed = listRead.state;
    const threadRead = requestConversation(mixed, AVA, "of-conv-ava-1001");
    mixed = threadRead.state;
    const listApplied = applyConversations(
      mixed,
      AVA,
      listRead.generation,
      listRead.seq,
      readyPage([summary(AVA, "of-conv-ava-1001")]),
    );
    check(
      "a thread read does not invalidate the in-flight list read",
      listApplied.applied === true,
      "otherwise the list sits on its loading state with data already on the way",
    );
    check(
      "the list settles instead of staying on loading",
      listApplied.state.byAccount[AVA].conversations.status === "ready",
    );
  }

  // 3. Scope generation
  group("3. A response from a previous scope is refused");
  {
    const wide = createFixtureOnlyFansDataSource({ viewer: operatorViewer() });
    const narrow = createFixtureOnlyFansDataSource({ viewer: readOnlyView([AVA, AVA_SECOND]) });

    // A scope reset restarts the counters, so the sequence number alone cannot
    // separate an old response from a new one. This asserts that they collide.
    let state = initialSelectionState();
    const acctA = beginAccounts(state);
    state = acctA.state;
    state = applyAccounts(state, acctA.generation, await wide.listAccounts());
    const oldList = requestConversations(state, AVA);
    state = oldList.state;
    const oldListResponse = wide.listConversations(AVA);

    state = beginScope(state);
    const acctB = beginAccounts(state);
    state = acctB.state;
    state = applyAccounts(state, acctB.generation, await narrow.listAccounts());
    state = selectAccount(state, AVA);
    const newList = requestConversations(state, AVA);
    state = newList.state;
    check(
      "the two reads carry the same sequence number, so only the generation can separate them",
      oldList.seq === newList.seq,
      `${oldList.seq} vs ${newList.seq}`,
    );
    check("they carry different scope generations", oldList.generation !== newList.generation);

    const late = applyConversations(state, AVA, oldList.generation, oldList.seq, await oldListResponse);
    check("the late list read from the previous scope is refused", late.applied === false);
    check("and the current read is still in flight, not overwritten", late.state === state);

    const settled = applyConversations(late.state, AVA, newList.generation, newList.seq, await narrow.listConversations(AVA));
    check("the current scope's list is applied", settled.applied === true);
    check("and settles", settled.state.byAccount[AVA].conversations.status === "ready");

    // The accounts read is the security-shaped case: a late wide response must
    // never restore a wider scope after the operator narrowed it.
    let scoped = initialSelectionState();
    const wideAccounts = beginAccounts(scoped);
    scoped = wideAccounts.state;
    const wideResponse = wide.listAccounts();
    scoped = beginScope(scoped);
    const narrowAccounts = beginAccounts(scoped);
    scoped = narrowAccounts.state;
    const narrowResponse = narrow.listAccounts();

    const staleWide = applyAccounts(scoped, wideAccounts.generation, await wideResponse);
    check("a late accounts response from the wider scope is refused", staleWide === scoped);
    const freshNarrow = applyAccounts(staleWide, narrowAccounts.generation, await narrowResponse);
    const visible = freshNarrow.accounts.status === "ready" ? freshNarrow.accounts.data.map((a) => a.accountId) : [];
    check(
      "only the narrower scope's accounts are present",
      visible.length === 2 && visible.every((id) => id === AVA || id === AVA_SECOND),
      visible.join(","),
    );
  }

  // 4. Invalid selections are dropped
  group("4. A selection the newest read no longer supports is dropped");
  {
    let state = initialSelectionState();
    const seeded = beginAccounts(state);
    state = seeded.state;
    state = applyAccounts(state, seeded.generation, { status: "ready", data: fixtureAccounts });
    state = selectAccount(state, AVA);
    const listed = requestConversations(state, AVA);
    state = listed.state;
    state = applyConversations(
      state,
      AVA,
      listed.generation,
      listed.seq,
      readyPage([summary(AVA, "of-conv-ava-1001")]),
    ).state;
    const opened = requestConversation(state, AVA, "of-conv-ava-1001");
    state = opened.state;
    state = applyConversation(
      state,
      AVA,
      "of-conv-ava-1001",
      opened.generation,
      opened.seq,
      { status: "ready", data: conversationDetails["of-conv-ava-1001"] },
    ).state;
    check("a thread is open", currentConversationState(state)?.status === "ready");

    // The list comes back empty: the thread underneath it cannot stay.
    const emptied = requestConversations(state, AVA);
    state = emptied.state;
    state = applyConversations(state, AVA, emptied.generation, emptied.seq, { status: "empty" }).state;
    check("an empty list clears the selected conversation", state.byAccount[AVA].selectedConversationId === null);
    check("an empty list clears the thread cache", Object.keys(state.byAccount[AVA].detail).length === 0);
    check("no thread resolves any more", currentConversationState(state) === null);

    // A failed list read cannot vouch for what exists either.
    let failedState = initialSelectionState();
    failedState = selectAccount(failedState, AVA);
    failedState = selectConversation(failedState, AVA, "of-conv-ava-1001");
    const failedRead = requestConversations(failedState, AVA);
    failedState = failedRead.state;
    failedState = applyConversations(failedState, AVA, failedRead.generation, failedRead.seq, {
      status: "error",
      message: "boom",
    }).state;
    check(
      "a failed list read clears the selection it cannot vouch for",
      failedState.byAccount[AVA].selectedConversationId === null,
    );

    // An empty account scope must take the account, its thread and its cache.
    const emptyAccounts = beginAccounts(state);
    state = emptyAccounts.state;
    state = applyAccounts(state, emptyAccounts.generation, { status: "empty" });
    check("an empty account scope clears the selected account", state.selectedAccountId === null);
    check("an empty account scope clears every cached entry", Object.keys(state.byAccount).length === 0);
    check("no thread resolves after the scope empties", currentConversationState(state) === null);

    // An account that drops out of scope takes its cache with it.
    let narrowed = initialSelectionState();
    const wide = beginAccounts(narrowed);
    narrowed = wide.state;
    narrowed = applyAccounts(narrowed, wide.generation, { status: "ready", data: fixtureAccounts });
    narrowed = selectAccount(narrowed, LUNA);
    const narrowedScope = beginAccounts(narrowed);
    narrowed = narrowedScope.state;
    narrowed = applyAccounts(narrowed, narrowedScope.generation, {
      status: "ready",
      data: [readyAccount(AVA)],
    });
    check("an account leaving scope clears its selected state", narrowed.selectedAccountId === null);
    check("an account leaving scope drops its cache", narrowed.byAccount[LUNA] === undefined);
  }

  // 5. Unresolved-send policy
  group("5. An unresolved send withdraws exactly the actions that could send");
  {
    const account = readyAccount(AVA);
    const operator = operatorViewer();
    const incident = {
      attemptId: "of-attempt-ava-6001",
      outcome: "unknown" as const,
      recordedAt: "2026-10-17T08:41:30.000Z",
      detail: "fixture",
    };

    check("unknown delivery counts as unresolved", isDeliveryUnresolved("unknown"));
    check("dispatching delivery counts as unresolved", isDeliveryUnresolved("dispatching"));
    check("partial delivery is settled, not unresolved", isDeliveryUnresolved("partial") === false);
    check("failed delivery is settled, not unresolved", isDeliveryUnresolved("failed") === false);

    const paused = { ...summary(AVA, "of-conv-ava-1002"), delivery: "unknown" as const, automationMode: "paused" as const };
    const pausedSet = availableActions({ account, summary: paused, viewer: operator, deliveryIncident: incident });
    check(
      "resuming replies is withheld while a send is unresolved, because it could dispatch",
      !canSubmitCommand(operator, pausedSet, "resume_automation"),
    );
    check(
      "and the refusal is the unresolved send, not merely the wrong mode",
      pausedSet.blocked.some(
        (entry) => entry.action === "resume_automation" && /unresolved/i.test(entry.reason ?? ""),
      ),
    );
    check(
      "sending is withheld while a send is unresolved",
      !canSubmitCommand(operator, pausedSet, "send_manual_message"),
    );
    check("resolving the evidence is offered instead", canSubmitCommand(operator, pausedSet, "resolve_delivery_evidence"));

    const automated = { ...paused, automationMode: "automated" as const };
    const automatedSet = availableActions({ account, summary: automated, viewer: operator, deliveryIncident: incident });
    check(
      "pausing is still offered, because it only reduces activity",
      canSubmitCommand(operator, automatedSet, "pause_automation"),
    );
    check("taking over is still offered", canSubmitCommand(operator, automatedSet, "request_takeover"));
    check("excluding contact is still offered", canSubmitCommand(operator, automatedSet, "mark_no_contact"));
    // The documented rule (consolidation plan section 4; ARCHITECTURE.md
    // "unresolved send") is that an unresolved send blocks *conflicting sends*,
    // not every control. The three actions that could dispatch carry the
    // unresolved reason, and they do so in every mode.
    const withheldByUnresolved = automatedSet.blocked
      .filter((entry) => /unresolved/i.test(entry.reason ?? ""))
      .map((entry) => entry.action)
      .sort();
    check(
      "sending, resuming and handing back are withheld by the unresolved send",
      withheldByUnresolved.length === 3 &&
        withheldByUnresolved[0] === "release_takeover" &&
        withheldByUnresolved[1] === "resume_automation" &&
        withheldByUnresolved[2] === "send_manual_message",
      withheldByUnresolved.join(","),
    );
  }

  // 6. Delivery coherence
  group("6. The rollup, the bubble receipts and the attempt always agree");
  {
    const account = readyAccount(AVA);
    const operator = operatorViewer();
    const source = conversationDetails["of-conv-ava-1002"];
    const EXPECTS_ATTEMPT: DeliveryOutcome[] = ["dispatching", "unknown", "partial", "failed"];
    const OUTCOMES: DeliveryOutcome[] = [
      "none",
      "generating",
      "queued",
      "dispatching",
      "sent",
      "partial",
      "unknown",
      "refused",
      "failed",
    ];

    let receiptsAgree = true;
    let attemptRuleHolds = true;
    for (const outcome of OUTCOMES) {
      const overridden = withDetailOverrides(source, { ...DEFAULT_CONTROLS, delivery: outcome });
      const outbound = overridden.messages.filter((message) => message.direction === "outbound");
      if (outbound.length === 0 || !outbound.every((message) => message.delivery === outcome)) {
        receiptsAgree = false;
      }
      if (overridden.summary.delivery !== outcome) receiptsAgree = false;
      const expectsAttempt = EXPECTS_ATTEMPT.includes(outcome);
      if (expectsAttempt !== (overridden.deliveryIncident !== null)) attemptRuleHolds = false;
      if (overridden.deliveryIncident && overridden.deliveryIncident.outcome !== outcome) {
        attemptRuleHolds = false;
      }
    }
    check("every outcome keeps the rollup and the bubble receipts in step", receiptsAgree);
    check("every outcome keeps the recorded attempt in step", attemptRuleHolds);

    // The exact case that was wrong: Fan 9002 with the partial override used to
    // show an unknown bubble next to no attempt, with sending enabled.
    const partial = withDetailOverrides(source, { ...DEFAULT_CONTROLS, delivery: "partial" });
    const partialOutbound = partial.messages.filter((message) => message.direction === "outbound");
    check(
      "the partial override no longer leaves an unknown bubble behind",
      partialOutbound.length > 0 && partialOutbound.every((message) => message.delivery === "partial"),
      partialOutbound.map((message) => message.delivery).join(","),
    );
    check("the partial override keeps an attempt to resolve", partial.deliveryIncident !== null);
    const partialSet = availableActions({
      account,
      summary: partial.summary,
      viewer: operator,
      deliveryIncident: partial.deliveryIncident,
    });
    check("a partial send offers the evidence path", canSubmitCommand(operator, partialSet, "resolve_delivery_evidence"));

    const settled = withDetailOverrides(source, { ...DEFAULT_CONTROLS, delivery: "sent" });
    check("a settled outcome clears the attempt", settled.deliveryIncident === null);
    const settledSet = availableActions({
      account,
      summary: { ...settled.summary, automationMode: "human_controlled", takeoverState: "effective" },
      viewer: operator,
      deliveryIncident: settled.deliveryIncident,
    });
    check("a settled outcome allows a human with effective takeover to send again", canSubmitCommand(operator, settledSet, "send_manual_message"));
    check(
      "a settled outcome no longer offers evidence resolution",
      !canSubmitCommand(operator, settledSet, "resolve_delivery_evidence"),
    );

    const unresolved = withDetailOverrides(source, { ...DEFAULT_CONTROLS, delivery: "unknown" });
    const unresolvedOutbound = unresolved.messages.filter((message) => message.direction === "outbound");
    check(
      "an unresolved bubble points at the attempt that settles it",
      unresolvedOutbound.length > 0 &&
        unresolvedOutbound.every((message) => message.evidenceRef === unresolved.deliveryIncident?.attemptId),
    );
  }

  // 7. Pagination and staleness
  group("7. Paging never relabels a stale list as current");
  {
    let state = initialSelectionState();
    state = selectAccount(state, AVA);
    const first = requestConversations(state, AVA);
    state = first.state;
    state = applyConversations(state, AVA, first.generation, first.seq, {
      status: "stale",
      data: { items: [summary(AVA, "of-conv-ava-1001")], nextCursor: "1" },
      freshness: STALE_FRESHNESS,
    }).state;
    check("the first page is stale", state.byAccount[AVA].conversations.status === "stale");

    const more = requestMoreConversations(state, AVA);
    state = more.state;
    const appended = appendConversations(
      state,
      AVA,
      more.generation,
      more.seq,
      readyPage([summary(AVA, "of-conv-ava-1002")]),
    ).state;
    const merged = appended.byAccount[AVA].conversations;
    check("appending a fresh page does not make the list current", merged.status === "stale");
    check(
      "the staleness keeps its original reading",
      merged.status === "stale" && merged.freshness.asOf === STALE_FRESHNESS.asOf,
    );
    check(
      "both pages are present",
      merged.status === "stale" && merged.data.items.length === 2,
    );

    // A stale page arriving onto a current list makes the list stale, because
    // part of what is on screen is no longer current.
    let fresh = initialSelectionState();
    fresh = selectAccount(fresh, AVA);
    const freshRead = requestConversations(fresh, AVA);
    fresh = freshRead.state;
    fresh = applyConversations(
      fresh,
      AVA,
      freshRead.generation,
      freshRead.seq,
      { status: "ready", data: { items: [summary(AVA, "of-conv-ava-1001")], nextCursor: "1" } },
    ).state;
    const moreStale = requestMoreConversations(fresh, AVA);
    fresh = moreStale.state;
    const mixed = appendConversations(fresh, AVA, moreStale.generation, moreStale.seq, {
      status: "stale",
      data: { items: [summary(AVA, "of-conv-ava-1002")], nextCursor: null },
      freshness: STALE_FRESHNESS,
    }).state;
    check("a stale page makes the whole list stale", mixed.byAccount[AVA].conversations.status === "stale");

    // A failed page adds nothing and never blanks what is on screen.
    const failedPage = appendConversations(mixed, AVA, moreStale.generation, moreStale.seq, {
      status: "error",
      message: "boom",
    }).state;
    const survived = failedPage.byAccount[AVA].conversations;
    check(
      "a failed page leaves the rows already on screen",
      survived.status === "stale" && survived.data.items.length === 2,
    );
  }

  // 8. Command contract
  group("8. A command carries its account, its payload and a content identity");
  {
    const source = createFixtureOnlyFansDataSource({ viewer: operatorViewer() });
    const conversationId = "of-conv-ava-1001";
    const message = (body: string, accountId = AVA) =>
      createCommandRequest({
        command: "send_manual_message",
        accountId,
        conversationId,
        expectedRevision: 42,
        payload: { kind: "manual_message", body },
      });

    const first = message("the first thing I said");
    const second = message("something else entirely");
    check(
      "two different messages at the same revision are different commands",
      first.commandId !== second.commandId,
      `${first.commandId} / ${second.commandId}`,
    );
    check(
      "and they carry different idempotency keys",
      first.idempotencyKey !== second.idempotencyKey,
    );
    const retry = message("the first thing I said");
    check("a retry of the same message reuses the identity", retry.commandId === first.commandId);
    check(
      "the account is part of the identity",
      message("the first thing I said", AVA_SECOND).commandId !== first.commandId,
    );

    const accepted = await source.submitCommand(first);
    check("a well formed message is accepted", accepted.accepted === true);
    check("and is still never applied", accepted.applied === false);
    check(
      "the typed text survives into the modelled command",
      accepted.request.payload.kind === "manual_message" &&
        accepted.request.payload.body === "the first thing I said",
    );
    check("the account survives into the modelled command", accepted.request.accountId === AVA);
    check("the accepted note says nothing was sent", /no message was sent/i.test(accepted.note));

    const blank = await source.submitCommand(message("   "));
    check("an empty message is refused", blank.accepted === false);
    check("and the refusal says why", /needs some text/i.test(blank.refusalReason ?? ""));

    const tooLong = await source.submitCommand(message("🙂".repeat(1001)));
    check("an over-long message is refused", tooLong.accepted === false);
    check("the payload rule is shared with the UI", commandPayloadProblem("send_manual_message", { kind: "manual_message", body: "  " }) !== null);

    const wrongAccount = await source.submitCommand(message("hello", AVA_SECOND));
    check("a command naming the wrong account is refused", wrongAccount.accepted === false);
    check(
      "and the refusal names the reason",
      /different account/i.test(wrongAccount.refusalReason ?? ""),
      wrongAccount.refusalReason ?? "",
    );

    const wrongPayload = await source.submitCommand(
      createCommandRequest({
        command: "pause_automation",
        accountId: AVA,
        conversationId,
        expectedRevision: 42,
        payload: { kind: "manual_message", body: "hello" },
      }),
    );
    check("a payload that does not belong to the command is refused", wrongPayload.accepted === false);

    const unresolvedSend = await source.submitCommand(
      createCommandRequest({
        command: "send_manual_message",
        accountId: AVA,
        conversationId: "of-conv-ava-1002",
        expectedRevision: 17,
        payload: { kind: "manual_message", body: "hello" },
      }),
    );
    check("a send against an unresolved conversation is refused", unresolvedSend.accepted === false);
    check(
      "and the refusal is the unresolved send",
      /unresolved/i.test(unresolvedSend.refusalReason ?? ""),
      unresolvedSend.refusalReason ?? "",
    );

    const resolution = await source.submitCommand(
      createCommandRequest({
        command: "resolve_delivery_evidence",
        accountId: AVA,
        conversationId: "of-conv-ava-1002",
        expectedRevision: 17,
        payload: { kind: "delivery_resolution", attemptId: "of-attempt-ava-6001", decision: "delivered" },
      }),
    );
    check("a delivery decision is accepted", resolution.accepted === true);
    check(
      "the decision survives into the modelled command",
      resolution.request.payload.kind === "delivery_resolution" &&
        resolution.request.payload.decision === "delivered",
    );
    const decideAgain = createCommandRequest({
      command: "resolve_delivery_evidence",
      accountId: AVA,
      conversationId: "of-conv-ava-1002",
      expectedRevision: 17,
      payload: { kind: "delivery_resolution", attemptId: "of-attempt-ava-6001", decision: "not_delivered" },
    });
    check(
      "the opposite decision is a different command",
      decideAgain.commandId !== resolution.request.commandId,
    );
  }

  // 9. Read-only
  group("9. A read-only viewer cannot invoke a mutation");
  {
    const account = readyAccount(AVA_SECOND);
    const conversation = { ...summary(AVA_SECOND, "of-conv-ava2-1101"), automationMode: "human_controlled" as const, takeoverState: "effective" as const };
    const operator = operatorViewer();
    const viewAs = readOnlyView([AVA_SECOND]);
    const operatorSet = availableActions({ account, summary: conversation, viewer: operator });
    const viewAsSet = availableActions({ account, summary: conversation, viewer: viewAs });

    check("the operator may send", canSubmitCommand(operator, operatorSet, "send_manual_message"));
    check(
      "the read-only viewer may not send, even calling the guard directly",
      canSubmitCommand(viewAs, viewAsSet, "send_manual_message") === false,
    );
    check("no action is available to the read-only viewer", viewAsSet.available.length === 0);
    check(
      "the read-only viewer's scope is narrower than the operator's",
      viewAs.scopedAccountIds.length < operator.scopedAccountIds.length,
    );
  }

  // 10. No live transport
  group("10. The preview cannot fall through to a live transport");
  {
    // Live mode is the server source over a transport. A transport that reports
    // an unavailable backend must produce an `unavailable` read — not fixtures,
    // and not an error state that would read as a dashboard fault.
    const offTransport = {
      kind: "fake" as const,
      readAccounts: async () => ({ outcome: "unavailable" as const, message: "no backend here" }),
      readConversations: async () => ({ outcome: "unavailable" as const, message: "no backend here" }),
      readConversation: async () => ({ outcome: "unavailable" as const, message: "no backend here" }),
    };
    const liveSource = createOnlyFansDataSource({
      mode: "live",
      viewer: operatorViewer(),
      transport: offTransport,
    });
    check("a live source is identified as live, not downgraded to fixtures", liveSource.kind === "live");
    check("and it is labelled as live rather than as sample data", liveSource.label === "Live");

    const liveReads = await Promise.all([
      liveSource.listAccounts(),
      liveSource.getAccount(AVA),
      liveSource.listConversations(AVA),
      liveSource.getConversation(AVA, "of-conv-ava-1001"),
    ]);
    check(
      "every live read reports the backend as unavailable rather than falling back to fixtures",
      liveReads.every((state) => state.status === "unavailable"),
      liveReads.map((state) => state.status).join(","),
    );
    check(
      "and none of them produced a fixture account id",
      liveReads.every(
        (state) =>
          state.status !== "ready" ||
          !(state.data as { accountId?: string }[]).some?.((row) => row.accountId === AVA),
      ),
    );

    const env = process.env as unknown as Record<string, string | undefined>;
    const previousEnv = env.NODE_ENV;
    let productionGuard = false;
    try {
      env.NODE_ENV = "production";
      createOnlyFansDataSource({ mode: "fixture", viewer: operatorViewer() });
    } catch (error) {
      productionGuard = error instanceof OnlyFansApiNotConfiguredError;
    } finally {
      if (previousEnv === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = previousEnv;
    }
    check("a production build cannot serve fixture data", productionGuard);

    const fixtureSource = createOnlyFansDataSource({ mode: "fixture", viewer: operatorViewer() });
    check(
      "fixture mode labels itself as sample data",
      fixtureSource.kind === "fixture" && fixtureSource.label === "Sample data",
    );

    const narrow = createFixtureOnlyFansDataSource({ viewer: readOnlyView([AVA]) });
    check("an out-of-scope account read is refused", (await narrow.getAccount(LUNA)).status === "error");
    check(
      "a conversation belonging to another account does not resolve",
      (await narrow.getConversation(AVA, "of-conv-nova-2001")).status === "error",
    );

    const staleSource = createFixtureOnlyFansDataSource({
      viewer: operatorViewer(),
      scenarios: {
        accounts: { status: "stale", data: [readyAccount(AVA)], freshness: STALE_FRESHNESS },
      },
    });
    const stale = await staleSource.listAccounts();
    check("a stale read is reported as stale", stale.status === "stale");
    check(
      "a stale read carries its freshness so it cannot read as current",
      stale.status === "stale" && stale.freshness.stale === true,
    );

    // The delay seam exists so a reviewer can watch the loading and stale paths
    // rather than only the instantaneous ones.
    const delayed = createFixtureOnlyFansDataSource({ viewer: operatorViewer(), latencyMs: 5 });
    const startedAt = Date.now();
    await delayed.listAccounts();
    check("the fixture delay seam actually delays", Date.now() - startedAt >= 4);
  }

  // 11. Import audit
  group("11. The preview reaches no database, no live shell and no OF server");
  {
    const layoutEntry = join(repoRoot, "preview", "onlyfans", "app", "layout.tsx");
    const entries = [
      // The preview's own layout is an entry point in its own right. It is where
      // a provider or a live initializer would be added, so a walk that skips it
      // would not notice one.
      layoutEntry,
      join(repoRoot, "preview", "onlyfans", "app", "page.tsx"),
      join(repoRoot, "preview", "onlyfans", "app", "overview", "page.tsx"),
      join(repoRoot, "preview", "onlyfans", "app", "telegram", "page.tsx"),
      join(repoRoot, "preview", "onlyfans", "app", "onlyfans", "inbox", "page.tsx"),
      join(repoRoot, "preview", "onlyfans", "app", "onlyfans", "accounts", "page.tsx"),
      join(repoRoot, "preview", "onlyfans", "app", "api", "fx", "route.ts"),
      join(repoRoot, "components", "onlyfans-preview", "OnlyFansWorkspace.tsx"),
    ];

    // What must stay out of the client graph: everything that reads identity,
    // scope, a database or a production data provider.
    //
    // The shell is deliberately NOT on this list. The preview mounts the real
    // Sidebar, TopBar, MobileMenu and MainShell because they are the design
    // source of truth, so they and the presentational helpers they pull in
    // (DashboardAccessProvider, CurrencyProvider, CloneSwitcher, TwinAssistant,
    // lib/money) are in scope by design. The audit's job is to keep the data
    // layer out, not the product's own chrome.
    const FORBIDDEN = [
      "supabase",
      "lib/query-cache",
      "lib/dashboard-access",
      "lib/creator-dashboard-identity",
      "lib/agency-identity",
      "lib/agency-management",
      "lib/agency-fetch",
      "lib/agency-write",
      "lib/clone-scope",
      "lib/session",
      "lib/auth",
      "lib/api-read",
      "lib/api-public",
      "lib/dashboard-data",
      "lib/analytics-data",
      "lib/rollup",
      "lib/revenue-window",
      "lib/revenue-why-changed",
      "lib/twin-version",
      "app/layout",
      "app/api",
      "app/actions",
    ];

    /**
     * A `"use server"` module is a boundary, not a client import.
     *
     * Next replaces an import of a server action with a reference to its
     * endpoint; the action body, and everything it imports, never ships to the
     * browser. The shell reaches one of them: the clone-scope writer the
     * switcher calls. It used to reach the `sign out` action as well; `TopBar`
     * now takes the signed-in action as a prop from the server layout, so the
     * preview cannot reach it and renders an inert, labelled control instead.
     * Without this rule the walk would descend into the writer and report the
     * server's own database modules as though the page had imported them.
     *
     * Stopping there is only safe if it is bounded, so every server action the
     * walk stops at is recorded and asserted to be one the dashboard already
     * owns. A new action appearing in the shell is then a failed check rather
     * than a quiet gap.
     */
    const SERVER_ACTIONS_THE_SHELL_OWNS = [
      "app/actions/clone-scope.ts",
    ];
    const SERVER_ACTION_SOURCE = /^\s*["']use server["']/m;
    const serverActionsReached: string[] = [];

    // Every import form the preview could plausibly use. Matching each form
    // independently avoids the association bug that makes a side-effect import
    // invisible, and a bounded span for the `from` form still catches a
    // multi-line import without leaping across statements.
    const SPECIFIER_PATTERNS: RegExp[] = [
      /(?:^|\n)\s*import\s+["']([^"']+)["']/g,
      /(?:^|\n)\s*(?:import|export)[\s\S]{0,500}?from\s+["']([^"']+)["']/g,
      /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
      /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    ];

    const visited = new Set<string>();
    const offences: string[] = [];
    const queue = [...entries];

    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (visited.has(file)) continue;
      visited.add(file);
      if (!existsSync(file)) {
        offences.push(`missing module in the preview graph: ${file.slice(repoRoot.length)}`);
        continue;
      }
      const sourceText = readFileSync(file, "utf8");
      const specifiers = new Set<string>();
      for (const pattern of SPECIFIER_PATTERNS) {
        for (const match of sourceText.matchAll(pattern)) specifiers.add(match[1]);
      }
      for (const specifier of specifiers) {
        let target: string | null = null;
        if (specifier.startsWith("@/")) target = join(repoRoot, specifier.slice(2));
        else if (specifier.startsWith(".")) target = resolve(dirname(file), specifier);

        let resolved: string | null = null;
        if (target) {
          for (const candidate of [
            `${target}.ts`,
            `${target}.tsx`,
            join(target, "index.ts"),
            join(target, "index.tsx"),
          ]) {
            if (existsSync(candidate) && statSync(candidate).isFile()) {
              resolved = candidate;
              break;
            }
          }
        }

        // A reference to a server action is a boundary, not a client import:
        // Next replaces it with an endpoint reference and the action body never
        // ships. Record which one was reached and stop, rather than walking the
        // server's own module graph as though the page had imported it.
        if (resolved && SERVER_ACTION_SOURCE.test(readFileSync(resolved, "utf8").slice(0, 400))) {
          serverActionsReached.push(resolved.slice(repoRoot.length + 1).replace(/\\/g, "/"));
          continue;
        }

        for (const forbidden of FORBIDDEN) {
          if (specifier.includes(forbidden)) {
            offences.push(`${specifier} (from ${file.slice(repoRoot.length)})`);
          }
        }
        if (resolved) queue.push(resolved);
      }
    }

    check(
      "no live root layout, database client or production data provider is reachable",
      offences.length === 0,
      offences.join("; "),
    );
    check(
      "the only server actions the shell reaches are the two the dashboard already owns",
      serverActionsReached.length > 0 &&
        serverActionsReached.every((file) => SERVER_ACTIONS_THE_SHELL_OWNS.includes(file)),
      serverActionsReached.join(","),
    );
    check("the walk included the preview's own layout", visited.has(layoutEntry));
    check(
      "the walk actually followed the component graph",
      visited.size >= 10,
      `visited ${visited.size} modules`,
    );

    // The scanner is only meaningful if it can see the import forms a live
    // initializer would arrive in. This proves each one is detected.
    const SCANNER_SAMPLE = [
      'import "./side-effect";',
      'import { a } from "./named";',
      "import {\n  b,\n  c,\n} from './multi-line';",
      'export * from "./re-export";',
      'const lazy = await import("./dynamic");',
      'const legacy = require("./commonjs");',
    ].join("\n");
    const seen = new Set<string>();
    for (const pattern of SPECIFIER_PATTERNS) {
      for (const match of SCANNER_SAMPLE.matchAll(pattern)) seen.add(match[1]);
    }
    const expectedSpecifiers = [
      "./side-effect",
      "./named",
      "./multi-line",
      "./re-export",
      "./dynamic",
      "./commonjs",
    ];
    check(
      "the scanner sees every import form, including side-effect and dynamic ones",
      expectedSpecifiers.every((specifier) => seen.has(specifier)),
      [...seen].join(","),
    );

    const cssPath = join(repoRoot, "preview", "onlyfans", "app", "globals.css");
    const css = readFileSync(cssPath, "utf8");
    check(
      "the preview stylesheet draws from the dashboard's own stylesheet",
      css.includes('@import "../../../app/globals.css"'),
    );
    check(
      "the preview stylesheet fetches no remote asset",
      !/url\(\s*['"]?https?:/i.test(css) && !/@import\s+url\(/i.test(css),
    );
  }

  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("OF-D0 fixture contract checks passed.");
}

void main();
