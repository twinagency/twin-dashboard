// Account-scoped selection state for the OnlyFans preview.
//
// This module is the reason the preview is worth building before the backend
// exists: it pins the behaviours a dashboard of this shape gets wrong most
// often.
//
//   1. Two accounts never share a selected conversation or a cache entry.
//      Selecting an account must not touch another account's entry.
//   2. A slow response can never overwrite a newer one. The conversation list
//      and each thread carry their own sequence, so a late thread read cannot
//      invalidate an in-flight list read, and a late list read cannot reinstate
//      a conversation the operator already left.
//   3. A response from a previous scope can never be applied to a new one. A
//      sequence alone cannot do this: a scope reset restarts the numbering, so
//      an old response and a new request can carry the same number. Every read
//      therefore also carries the scope generation it was issued under.
//   4. A selection the newest read no longer supports is dropped. If the list
//      comes back empty, or fails, the thread underneath it goes with it rather
//      than staying on screen and staying actionable.
//
// The two read paths are sequenced separately on purpose. One shared counter
// looks equivalent and is not: opening a thread would then mark the list's own
// outstanding request stale, and the list would sit on its loading state
// forever with its data already on the way.
//
// All of this is a pure state transition, so the contract is testable without a
// DOM. Nothing here reads a clock, a network or a database.

import type {
  ConversationDetail,
  ConversationSummary,
  CursorPage,
  Freshness,
  OfAccount,
  RequestState,
} from "./types";

export type AccountSelection = {
  selectedConversationId: string | null;
  /** Newest issued conversation-list request for this account. */
  listSeq: number;
  /** The newest conversation-list request that was actually applied. */
  appliedListSeq: number;
  /** Per conversation: the newest detail request issued, keyed by id. */
  detailSeq: Record<string, number>;
  /** Per conversation: the newest detail request applied, keyed by id. */
  appliedDetailSeq: Record<string, number>;
  /** True while a further page of the list is being fetched. */
  loadingMore: boolean;
  conversations: RequestState<CursorPage<ConversationSummary>>;
  /** Detail cache, keyed by conversation id, scoped to this account only. */
  detail: Record<string, RequestState<ConversationDetail>>;
};

export type PreviewSelectionState = {
  selectedAccountId: string | null;
  accounts: RequestState<OfAccount[]>;
  /**
   * Bumped whenever the scope changes (creator or permission). Every request
   * records the generation it was issued under, and its response is dropped if
   * the generation has moved on, so a counter reset can never let an old
   * response look like a new one.
   */
  scopeGeneration: number;
  byAccount: Record<string, AccountSelection>;
};

export function initialSelectionState(): PreviewSelectionState {
  return {
    selectedAccountId: null,
    accounts: { status: "loading" },
    scopeGeneration: 0,
    byAccount: {},
  };
}

/**
 * Start a new scope. Discards every selection, cache and counter from the
 * previous one, and moves the generation on so any response still in flight for
 * the old scope is refused when it arrives.
 */
export function beginScope(state: PreviewSelectionState): PreviewSelectionState {
  return { ...initialSelectionState(), scopeGeneration: state.scopeGeneration + 1 };
}

function emptyAccountSelection(): AccountSelection {
  return {
    selectedConversationId: null,
    listSeq: 0,
    appliedListSeq: 0,
    detailSeq: {},
    appliedDetailSeq: {},
    loadingMore: false,
    conversations: { status: "loading" },
    detail: {},
  };
}

function withEntry(
  state: PreviewSelectionState,
  accountId: string,
  entry: AccountSelection,
): PreviewSelectionState {
  return { ...state, byAccount: { ...state.byAccount, [accountId]: entry } };
}

function entryOf(state: PreviewSelectionState, accountId: string): AccountSelection {
  return state.byAccount[accountId] ?? emptyAccountSelection();
}

export function applyAccounts(
  state: PreviewSelectionState,
  generation: number,
  accounts: RequestState<OfAccount[]>,
): PreviewSelectionState {
  if (generation !== state.scopeGeneration) return state;

  if (accounts.status === "loading") return { ...state, accounts };

  if (
    accounts.status === "empty" ||
    accounts.status === "error" ||
    accounts.status === "unavailable"
  ) {
    // A read that produced no accounts cannot vouch for any of them. An empty
    // scope, a failed scope and an unavailable backend are all "no account is
    // confirmed", so the account, its thread cache and its selected
    // conversation all go with it. Keeping them is how an empty scope still
    // renders the conversation that used to be there, with a live send control
    // underneath it.
    return { ...state, accounts, selectedAccountId: null, byAccount: {} };
  }

  const inScope = new Set(accounts.data.map((account) => account.accountId));
  // An account that is no longer in scope takes its selected conversation, its
  // thread cache and its read state with it. Leaving those reachable is how a
  // dashboard shows one account's messages under another account's name, and how
  // an empty scope still renders the conversation that used to be there.
  const byAccount: Record<string, AccountSelection> = {};
  for (const [accountId, entry] of Object.entries(state.byAccount)) {
    if (inScope.has(accountId)) byAccount[accountId] = entry;
  }

  return {
    ...state,
    accounts,
    byAccount,
    selectedAccountId:
      state.selectedAccountId && inScope.has(state.selectedAccountId)
        ? state.selectedAccountId
        : null,
  };
}

/**
 * Begin an accounts read. Returns the generation the result must come back
 * under, so an accounts response for a previous scope is refused.
 */
export function beginAccounts(state: PreviewSelectionState, options: { background?: boolean } = {}): {
  state: PreviewSelectionState;
  generation: number;
} {
  return {
    generation: state.scopeGeneration,
    state: options.background && ["ready", "stale"].includes(state.accounts.status) ? state : { ...state, accounts: { status: "loading" } },
  };
}

/** Selecting an account leaves every other account's entry untouched. */
export function selectAccount(
  state: PreviewSelectionState,
  accountId: string,
): PreviewSelectionState {
  const entry = state.byAccount[accountId] ?? emptyAccountSelection();
  return { ...withEntry(state, accountId, entry), selectedAccountId: accountId };
}

/**
 * Selecting a conversation is a display change only. It deliberately does not
 * touch the list sequence: the list is not stale just because a thread was
 * opened, and treating it as stale is what strands it on its loading state.
 */
export function selectConversation(
  state: PreviewSelectionState,
  accountId: string,
  conversationId: string,
): PreviewSelectionState {
  const entry = entryOf(state, accountId);
  return withEntry(state, accountId, { ...entry, selectedConversationId: conversationId });
}

export type PendingRequest = {
  state: PreviewSelectionState;
  seq: number;
  /** The scope generation the read was issued under. */
  generation: number;
};

/** Issue a conversation-list read and return the sequence it must come back under. */
export function requestConversations(
  state: PreviewSelectionState,
  accountId: string,
  options: { background?: boolean } = {},
): PendingRequest {
  const entry = entryOf(state, accountId);
  const seq = entry.listSeq + 1;
  return {
    seq,
    generation: state.scopeGeneration,
    state: withEntry(state, accountId, {
      ...entry,
      listSeq: seq,
      loadingMore: false,
      conversations: options.background ? entry.conversations : { status: "loading" },
    }),
  };
}

/** Issue the next page of the list, keeping the rows already on screen. */
export function requestMoreConversations(
  state: PreviewSelectionState,
  accountId: string,
): PendingRequest {
  const entry = entryOf(state, accountId);
  const seq = entry.listSeq + 1;
  return {
    seq,
    generation: state.scopeGeneration,
    state: withEntry(state, accountId, { ...entry, listSeq: seq, loadingMore: true }),
  };
}

export type ApplyResult = { state: PreviewSelectionState; applied: boolean };

export function applyConversations(
  state: PreviewSelectionState,
  accountId: string,
  generation: number,
  seq: number,
  result: RequestState<CursorPage<ConversationSummary>>,
): ApplyResult {
  if (generation !== state.scopeGeneration) return { state, applied: false };
  const entry = entryOf(state, accountId);
  if (seq < entry.listSeq) {
    // A newer list read is outstanding for this account. Dropping this keeps a
    // late page from reinstating a conversation the operator already left.
    return { state, applied: false };
  }
  // A list that came back empty, or failed, cannot vouch for the conversation
  // that was open underneath it. Keeping that selection is how an empty inbox
  // still shows an old thread with a live send control.
  const supportsSelection =
    (result.status === "ready" || result.status === "stale") && result.data.items.length > 0;
  return {
    applied: true,
    state: withEntry(state, accountId, {
      ...entry,
      appliedListSeq: Math.max(entry.appliedListSeq, seq),
      loadingMore: false,
      conversations: result,
      ...(supportsSelection ? {} : { selectedConversationId: null, detail: {} }),
    }),
  };
}

/** Refresh the newest page without losing loaded history or the selection. */
export function applyConversationRefresh(
  state: PreviewSelectionState, accountId: string, generation: number, seq: number,
  result: RequestState<CursorPage<ConversationSummary>>,
): ApplyResult {
  const entry = entryOf(state, accountId);
  const current = entry.conversations;
  if ((result.status === "ready" || result.status === "stale") &&
      (current.status === "ready" || current.status === "stale") && result.data.nextCursor) {
    const fresh = new Set(result.data.items.map(item => item.conversationId));
    const retained = current.data.items.filter(item => !fresh.has(item.conversationId));
    return applyConversations(state, accountId, generation, seq, {
      ...result, data: { ...result.data, items: [...result.data.items, ...retained],
        nextCursor: retained.length ? (current.data.nextCursor ?? result.data.nextCursor) : result.data.nextCursor },
    });
  }
  return applyConversations(state, accountId, generation, seq, result);
}

/** Append one page onto the rows already shown, for the same list read. */
export function appendConversations(
  state: PreviewSelectionState,
  accountId: string,
  generation: number,
  seq: number,
  result: RequestState<CursorPage<ConversationSummary>>,
): ApplyResult {
  if (generation !== state.scopeGeneration) return { state, applied: false };
  const entry = entryOf(state, accountId);
  const current = entry.conversations;
  const hadRows = current.status === "ready" || current.status === "stale";
  const shown = hadRows ? current.data.items : [];

  if (result.status !== "ready" && result.status !== "stale") {
    // A failed page adds nothing. The rows already on screen stay, so a bad
    // page never blanks a list the operator was reading.
    return {
      applied: false,
      state: withEntry(state, accountId, { ...entry, loadingMore: false }),
    };
  }
  if (seq < entry.listSeq) {
    return { applied: false, state: withEntry(state, accountId, { ...entry, loadingMore: false }) };
  }

  const data: CursorPage<ConversationSummary> = {
    items: [...shown, ...result.data.items],
    nextCursor: result.data.nextCursor,
  };

  // Staleness is a property of the list, not of the page. Appending a fresh page
  // to a stale list must not relabel the whole list as current, or a cached view
  // silently becomes "now". When both sides are stale the older reading wins,
  // because that is the conservative one.
  const merged = mergeFreshness(current, result, data);

  return {
    applied: true,
    state: withEntry(state, accountId, {
      ...entry,
      loadingMore: false,
      conversations: merged,
    }),
  };
}

function mergeFreshness(
  current: RequestState<CursorPage<ConversationSummary>>,
  incoming: RequestState<CursorPage<ConversationSummary>>,
  data: CursorPage<ConversationSummary>,
): RequestState<CursorPage<ConversationSummary>> {
  const currentFreshness = current.status === "stale" ? current.freshness : null;
  const incomingFreshness = incoming.status === "stale" ? incoming.freshness : null;
  if (!currentFreshness && !incomingFreshness) return { status: "ready", data };
  if (currentFreshness && incomingFreshness) {
    return {
      status: "stale",
      data,
      freshness:
        (currentFreshness.asOf ? Date.parse(currentFreshness.asOf) : -Infinity) <= (incomingFreshness.asOf ? Date.parse(incomingFreshness.asOf) : -Infinity)
          ? currentFreshness
          : incomingFreshness,
    };
  }
  return { status: "stale", data, freshness: (currentFreshness ?? incomingFreshness) as Freshness };
}

/** Issue a conversation detail read, returning the sequence it comes back under. */
export function requestConversation(
  state: PreviewSelectionState,
  accountId: string,
  conversationId: string,
  options: { background?: boolean } = {},
): PendingRequest {
  const entry = entryOf(state, accountId);
  // Sequenced on the newest request *issued*, not the newest applied. Deriving
  // it from what has been applied hands two outstanding reads the same number,
  // and the older one then looks current.
  const seq = (entry.detailSeq[conversationId] ?? 0) + 1;
  return {
    seq,
    generation: state.scopeGeneration,
    state: withEntry(state, accountId, {
      ...entry,
      selectedConversationId: conversationId,
      detailSeq: { ...entry.detailSeq, [conversationId]: seq },
      detail: { ...entry.detail, [conversationId]: options.background ? (entry.detail[conversationId] ?? { status: "loading" }) : { status: "loading" } },
    }),
  };
}

export function applyConversation(
  state: PreviewSelectionState,
  accountId: string,
  conversationId: string,
  generation: number,
  seq: number,
  result: RequestState<ConversationDetail>,
): ApplyResult {
  if (generation !== state.scopeGeneration) return { state, applied: false };
  // A payload naming another account or thread is never cached under this one (same rule as appendOlderConversation).
  if ((result.status === "ready" || result.status === "stale") && (result.data.accountId !== accountId || result.data.conversationId !== conversationId))
    return { state, applied: false };
  const entry = entryOf(state, accountId);
  const issued = entry.detailSeq[conversationId] ?? 0;
  if (seq < issued) {
    // An older read of this same thread cannot replace a newer one. A read of a
    // different thread is cached under its own key and is never displayed while
    // another conversation is selected, so it needs no guard.
    return { state, applied: false };
  }
  const cached = entry.detail[conversationId];
  if ((result.status === "ready" || result.status === "stale") && (cached?.status === "ready" || cached?.status === "stale") && cached.data.messages.length > 100) {
    result = { ...result, data: { ...result.data,
      messages: mergeHistory(cached.data.messages, result.data.messages),
      previousCursor: cached.data.previousCursor,
    } };
  }
  const applied = entry.appliedDetailSeq[conversationId] ?? 0;
  return {
    applied: true,
    state: withEntry(state, accountId, {
      ...entry,
      appliedDetailSeq: { ...entry.appliedDetailSeq, [conversationId]: Math.max(applied, seq) },
      detail: { ...entry.detail, [conversationId]: result },
    }),
  };
}

/**
 * The detail state for the current selection, if the selection belongs to the
 * account that is currently open. A conversation id from another account
 * resolves to nothing here even if it was cached under that other account.
 */
export function currentConversationState(
  state: PreviewSelectionState,
): RequestState<ConversationDetail> | null {
  const accountId = state.selectedAccountId;
  if (!accountId) return null;
  const entry = state.byAccount[accountId];
  if (!entry?.selectedConversationId) return null;
  return entry.detail[entry.selectedConversationId] ?? { status: "loading" };
}

export function currentAccount(state: PreviewSelectionState): OfAccount | null {
  if (state.accounts.status !== "ready" && state.accounts.status !== "stale") return null;
  const accountId = state.selectedAccountId;
  if (!accountId) return null;
  return state.accounts.data.find((account) => account.accountId === accountId) ?? null;
}

/** The cursor for the next page, or null when the end has been reached. */
export function nextConversationCursor(
  state: PreviewSelectionState,
  accountId: string,
): string | null {
  const list = state.byAccount[accountId]?.conversations;
  if (!list || (list.status !== "ready" && list.status !== "stale")) return null;
  return list.data.nextCursor;
}

export function isLoadingMore(state: PreviewSelectionState, accountId: string): boolean {
  return state.byAccount[accountId]?.loadingMore ?? false;
}

/**
 * Deliberately explicit: switching accounts must not clear the previous
 * account's entry, because that is what makes a cross-account leak detectable
 * rather than invisible.
 */
export function cachedConversationIds(state: PreviewSelectionState, accountId: string): string[] {
  return Object.keys(entryOf(state, accountId).detail).sort();
}


function mergeHistory(older: ConversationDetail["messages"], newer: ConversationDetail["messages"]): ConversationDetail["messages"] {
  const byId = new Map(older.map(message => [message.messageId, message]));
  for (const message of newer) byId.set(message.messageId, message);
  return [...byId.values()].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || Number(a.messageId) - Number(b.messageId));
}

export function appendOlderConversation(state: PreviewSelectionState, accountId: string, conversationId: string,
  generation: number, seq: number, result: RequestState<ConversationDetail>): ApplyResult {
  if (generation !== state.scopeGeneration) return { state, applied: false };
  const entry = entryOf(state, accountId);
  if (seq < (entry.detailSeq[conversationId] ?? 0)) return { state, applied: false };
  const cached = entry.detail[conversationId];
  if ((result.status === "ready" || result.status === "stale") && (cached?.status === "ready" || cached?.status === "stale")) {
    if (result.data.accountId !== accountId || result.data.conversationId !== conversationId) return { state, applied: false };
    const data = { ...result.data, messages: mergeHistory(result.data.messages, cached.data.messages) };
    // Apply directly: normal refresh deliberately retains the oldest loaded cursor.
    return { applied: true, state: withEntry(state, accountId, { ...entry,
      appliedDetailSeq: { ...entry.appliedDetailSeq, [conversationId]: seq },
      detail: { ...entry.detail, [conversationId]: { ...result, data } },
    }) };
  }
  // A denied/unavailable read must not retain private cached data as authority.
  return applyConversation(state, accountId, conversationId, generation, seq, result);
}
