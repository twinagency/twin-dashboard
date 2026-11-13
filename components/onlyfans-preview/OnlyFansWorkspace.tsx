"use client";
import { EMPTY_INBOX_SEARCH, type InboxSearch } from "@/lib/onlyfans/inbox-search";
import { recallFilters, recallSelected, rememberFilters, rememberSelected } from "@/lib/onlyfans/inbox-view-memory";

// The OnlyFans workspace: which account is selected, which conversation is
// open, the last modelled command, and the data source behind all of it.
//
// WHERE THE SCOPE COMES FROM. The selected creator and account live in the URL,
// not only in component state, so a link from Accounts opens the account it
// names and reloading or pressing Back lands back on it. Both ids are a
// *request*: the data source is asked for the accounts in that creator, and only
// the accounts it answers with can be selected. An id the server did not
// authorize is not selected, and the URL is corrected to what was actually
// returned — so a hand-typed account id cannot leave the surface claiming to
// show something it is not showing.
//
// WHICH SOURCE. `source="fixture"` is the isolated preview and its tests.
// `source="server"` is the dashboard's own read handlers, and it is the only
// mode the real routes use. There is no fallback between them: with no backend
// configured the server source reports `unavailable`, which is a state the UI
// renders as its own thing.
//
// It does NOT own the shell any more. The channel, the sidebar, the top bar and
// the creator scope belong to the dashboard: this component is mounted as the
// page, inside app/preview's root layout, which mounts the real
// Sidebar/TopBar/MobileMenu/MainShell. That is the point of the repair — the
// OnlyFans channel is an extension of the product, not a second product.
//
// The explicit source selects synthetic preview data or authenticated dashboard
// handlers. Neither browser path imports database or provider code.

import { clearSubmittedDraft, draftKey, readDraft, type InboxDraft } from "@/lib/onlyfans/inbox-drafts";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { threadNeedsRefresh, mergeListControl } from "@/lib/onlyfans/thread-refresh";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  availableActions,
  canSubmitCommand,
  commandForAction,
  createCommandRequest,
  heldSendInput,
  sendIntent,
  uuidRequestKey,
} from "@/lib/onlyfans-preview/actions";
import { operatorViewer, readOnlyView } from "@/lib/onlyfans-preview/fixture-data-source";
import type { OnlyFansDataSource } from "@/lib/onlyfans-preview/data-source";
import {
  parseWorkspaceScope,
  workspaceHref,
  type WorkspaceScope,
} from "@/lib/onlyfans-preview/scope";
import { createFetchOnlyFansTransport } from "@/lib/onlyfans-preview/server-data-source";
import { createOnlyFansDataSource } from "@/lib/onlyfans-preview/sources";
import {
  applyAccounts,
  applyConversation,
  appendOlderConversation,
  applyConversations,
  applyConversationRefresh,
  appendConversations,
  beginAccounts,
  beginScope,
  currentAccount,
  currentConversationState,
  initialSelectionState,
  isLoadingMore,
  nextConversationCursor,
  requestConversation,
  requestConversations,
  requestMoreConversations,
  selectAccount,
  selectConversation,
} from "@/lib/onlyfans-preview/selection";
import type { PreviewSelectionState } from "@/lib/onlyfans-preview/selection";
import {
  DEFAULT_CONTROLS,
  buildScenarios,
} from "@/lib/onlyfans-preview/scenarios";
import type { PreviewControls } from "@/lib/onlyfans-preview/scenarios";
import { fixtureAccountIdsForCreator } from "@/lib/onlyfans-preview/workspace";
import type {
  AvailableAction,
  CommandPayload,
  PreviewViewer,
  RequestState,
  CommandResult,
  CommandRequest,
} from "@/lib/onlyfans-preview/types";
import PreviewControlsPanel from "./PreviewControlsPanel";
import type { PreviewPreset } from "./PreviewControlsPanel";
import AccountsView from "./AccountsView";
import InboxView from "./InboxView";
import AllFansControl from "./AllFansControl";
import HandoverPanel from "./HandoverPanel";
import type { Handover } from "@/lib/onlyfans/handover";
import type { EngineActionHandler, EnginePageLoader } from "./EngineStatus";
import { submitEngineOperatorCommand } from "@/lib/onlyfans/engine-operator-client";
import { forgetHeldKeys, heldKeyStore } from "@/lib/onlyfans/plan-c-client";
import { STALE_REFUSAL_CODES } from "@/lib/onlyfans/controls";
import type { CursorPage, ConversationSummary } from "@/lib/onlyfans-preview/types";
import type { ConnectionCreator } from "@/lib/onlyfans-connections/contract";

export type OnlyFansView = "inbox" | "accounts";

/** Which data source the surface reads. There is no default: it is declared. */
export type OnlyFansSourceMode = "fixture" | "server" | "creator";

const PRESETS: PreviewPreset[] = [
  { key: "healthy", label: "Healthy account", controls: { ...DEFAULT_CONTROLS } },
  {
    key: "expired",
    label: "Session expired",
    controls: { ...DEFAULT_CONTROLS, health: "expired_session" },
  },
  {
    key: "disconnected",
    label: "Disconnected",
    controls: { ...DEFAULT_CONTROLS, health: "disconnected" },
  },
  {
    key: "reconnecting",
    label: "Reconnecting",
    controls: { ...DEFAULT_CONTROLS, health: "reconnecting" },
  },
  { key: "revoked", label: "Access revoked", controls: { ...DEFAULT_CONTROLS, health: "revoked" } },
  {
    key: "paused",
    label: "Replies paused",
    controls: { ...DEFAULT_CONTROLS, automationMode: "paused" },
  },
  {
    key: "takeover_pending",
    label: "Takeover pending",
    controls: { ...DEFAULT_CONTROLS, takeoverState: "requested" },
  },
  {
    key: "takeover_active",
    label: "Takeover active",
    controls: { ...DEFAULT_CONTROLS, takeoverState: "effective", automationMode: "human_controlled" },
  },
  {
    key: "unknown",
    label: "Unknown delivery",
    controls: { ...DEFAULT_CONTROLS, delivery: "unknown" },
  },
  {
    key: "partial",
    label: "Partial delivery",
    controls: { ...DEFAULT_CONTROLS, delivery: "partial" },
  },
  { key: "readonly", label: "Read only", controls: { ...DEFAULT_CONTROLS, viewAs: true } },
  {
    key: "stale",
    label: "Stale reads",
    controls: {
      ...DEFAULT_CONTROLS,
      accountsRead: "stale",
      conversationsRead: "stale",
      conversationRead: "stale",
    },
  },
  {
    key: "error",
    label: "Read error",
    controls: { ...DEFAULT_CONTROLS, conversationsRead: "error", conversationRead: "error" },
  },
  {
    key: "empty",
    label: "Empty inbox",
    controls: { ...DEFAULT_CONTROLS, conversationsRead: "empty" },
  },
  { key: "loading", label: "Loading", controls: { ...DEFAULT_CONTROLS, accountsRead: "loading" } },
];

/** Carries an override through the read states that hold data. */
function mapState<T, U>(state: RequestState<T>, map: (value: T) => U): RequestState<U> {
  if (state.status === "ready") return { status: "ready", data: map(state.data) };
  if (state.status === "stale") {
    return { status: "stale", data: map(state.data), freshness: state.freshness };
  }
  return state;
}

/**
 * Selection state held in a ref alongside React state, so a transition is
 * computed from the newest committed value rather than from whichever render
 * the click happened to observe. `selection.ts` stays the one definition of the
 * transitions, including the stale-response rule.
 */
function useSelectionStore() {
  const [state, setState] = useState<PreviewSelectionState>(initialSelectionState);
  const ref = useRef<PreviewSelectionState>(state);
  const commit = useCallback((next: PreviewSelectionState) => {
    ref.current = next;
    setState(next);
  }, []);
  return { state, ref, commit };
}

const UNCONFIRMED_NOTE = "The outcome is not confirmed. Refresh the conversation or retry this same request.";

export default function OnlyFansWorkspace({
  view,
  source: sourceMode,
  connectionsConfigured = false,
  connectionCreators = [],
  canManage = true,
  canChat = false,
  draftPrincipal = "fixture",
  agencyViewer = false,
  operatorScope,
}: {
  view: OnlyFansView;
  /**
   * Required rather than defaulted: a surface that forgets it has to fail the
   * typecheck, not quietly render sample data on a live route.
   */
  source: OnlyFansSourceMode;
  connectionsConfigured?: boolean;
  connectionCreators?: ConnectionCreator[];
  canManage?: boolean;
  canChat?: boolean;
  draftPrincipal?: string;
  agencyViewer?: boolean;
  /** Names this operator's held sends in the tab's sessionStorage (planCKeyScope); without it a reload drops them, and a session loss always does. */
  operatorScope?: string;
}) {
  const submittedDrafts = useRef(new Map<string, InboxDraft>());
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // The requested scope. `creator` narrows what may be read; `account` asks for
  // one account to be open. Neither grants anything.
  const requestedScope: WorkspaceScope = useMemo(
    () => parseWorkspaceScope(searchParams),
    [searchParams],
  );

  const [controls, setControls] = useState<PreviewControls>(DEFAULT_CONTROLS);
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null);
  const [commandPending, setCommandPending] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const commandBusy = useRef(false);
  const commandByThread = useRef(new Map<string, CommandResult>());
  const olderBusy = useRef(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const { state, ref, commit } = useSelectionStore();
  // Filters and the chosen thread are recalled from this document's memory, so
  // opening Content or Earnings and coming back leaves the inbox as it was.
  const recalled = useState(() => draftPrincipal === "fixture" || draftPrincipal === "unavailable" ? null : recallFilters(draftPrincipal, requestedScope.creatorId))[0];
  const [inboxSearch, setInboxSearch] = useState<InboxSearch>(recalled?.search ?? EMPTY_INBOX_SEARCH);
  const searchRef = useRef(inboxSearch);
  searchRef.current = inboxSearch;
  const [aiOnly, setAiOnly] = useState(recalled?.aiOnly ?? false);
  const aiOnlyRef = useRef(recalled?.aiOnly ?? false);
  const remembers = draftPrincipal !== "fixture" && draftPrincipal !== "unavailable";
  const [handover, setHandover] = useState<Handover | null>(null);
  const [handoverLoading, setHandoverLoading] = useState(false);
  const [handoverRefresh, setHandoverRefresh] = useState(0);
  const selectedDetail = currentConversationState(state);
  const selectedSummary = selectedDetail && (selectedDetail.status === "ready" || selectedDetail.status === "stale") ? selectedDetail.data.summary : null;
  const handoverCurrent = handover && !handoverLoading && selectedSummary && handover.accountId === state.selectedAccountId &&
    handover.conversationId === selectedSummary.conversationId && handover.revision === selectedSummary.revision ? handover : null;
  /** A manual send held in the key store (in flight or unconfirmed, on an earlier page load too), offered again as its exact retry. */
  const heldSend = useCallback((accountId: string, conversationId: string): CommandResult | null => {
    const store = heldKeyStore("of-send-keys", accountId, operatorScope);
    const input = store.pending().map(heldSendInput).find(held => held?.accountId === accountId && held.conversationId === conversationId);
    return input ? { simulated: false, applied: false, accepted: false, outcome: "unconfirmed", note: UNCONFIRMED_NOTE,
      request: { ...createCommandRequest(input), idempotencyKey: uuidRequestKey(store.keyFor(sendIntent(input))) } } : null;
  }, [operatorScope]);
  useEffect(() => {
    const id = selectedSummary ? `${selectedSummary.accountId}:${selectedSummary.conversationId}` : "";
    setCommandResult(commandByThread.current.get(id) ?? (selectedSummary ? heldSend(selectedSummary.accountId, selectedSummary.conversationId) : null));
  }, [state.selectedAccountId, selectedSummary?.conversationId, heldSend]);

  const requested = useRef<{ conversations: Set<string>; details: Set<string> }>({
    conversations: new Set(),
    details: new Set(),
  });

  // Permission is the viewer, and the viewer is derived, never supplied by the
  // page: a view-as session is always narrower and always read only. Its
  // account scope follows the requested creator, so the preview's read-only mode
  // narrows the same way the real one would rather than pinning a fixture.
  const viewerKey = sourceMode === "creator" ? "creator" : controls.viewAs ? "view_as" : "operator";
  const viewer = useMemo<PreviewViewer>(
    () =>
      sourceMode === "creator" ? { kind: "view_as", label: "Your OnlyFans account", canManage: false, scopedAccountIds: [] } : controls.viewAs
        ? readOnlyView(fixtureAccountIdsForCreator(requestedScope.creatorId))
        : { ...operatorViewer(), canManage, canChat, label: agencyViewer ? "Agency team" : "Operator" },
    [controls.viewAs, requestedScope.creatorId, sourceMode, canManage, canChat, agencyViewer],
  );

  const scenarios = useMemo(() => buildScenarios(controls, viewer), [controls, viewer]);

  // The developer overrides live in the fixture source's scenarios (buildScenarios), so its simulator sees them too.
  const source = useMemo<OnlyFansDataSource>(() => createOnlyFansDataSource({
      mode: sourceMode === "fixture" ? "fixture" : "live",
      ...(sourceMode === "creator" ? { transport: createFetchOnlyFansTransport(undefined, "/creator-auth/onlyfans") } : {}),
      viewer,
      scenarios,
    }), [viewer, scenarios, sourceMode]);

  // A different scope starts clean: changing the permission must not leave a
  // conversation, a thread or a draft from the previous scope reachable.
  // `beginScope` also moves the generation on, so a response still in flight for
  // the previous scope cannot be mistaken for one from this scope just because
  // the counters restarted.
  useEffect(() => {
    requested.current = { conversations: new Set(), details: new Set() };
    commandByThread.current.clear();
    setCommandResult(null);
    commit(beginScope(ref.current));
  }, [viewerKey, requestedScope.creatorId, commit]);

  // Accounts re-read whenever the source changes, which includes every override,
  // so a state the reviewer selects is a fresh read and never a cached one — and
  // whenever the requested creator changes, because that is a different
  // question, not a different view of the same answer.
  useEffect(() => {
    requested.current = { conversations: new Set(), details: new Set() };
    let cancelled = false;
    const begun = beginAccounts(ref.current, { background: sourceMode === "server" });
    commit(begun.state);
    void source
      .listAccounts({ creatorId: requestedScope.creatorId, accountId: requestedScope.accountId })
      .then((result) => {
        if (!cancelled) commit(applyAccounts(ref.current, begun.generation, result));
      });
    return () => {
      cancelled = true;
    };
  }, [source, commit, ref, requestedScope.creatorId, requestedScope.accountId]);

  useEffect(() => {
    if (sourceMode !== "server") return;
    let active = true, busy = false;
    const generation = ref.current.scopeGeneration;
    const timer = setInterval(async () => {
      if (busy || document.visibilityState !== "visible" || commandBusy.current) return;
      busy = true;
      try {
        const result = await source.listAccounts({ creatorId: requestedScope.creatorId, accountId: requestedScope.accountId });
        if (active && (result.status === "ready" || result.status === "stale" || result.status === "empty")) commit(applyAccounts(ref.current, generation, result));
      } finally { busy = false; }
    }, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [sourceMode, source, requestedScope.creatorId, requestedScope.accountId, commit, ref]);

  // Keep the selection inside the accounts the server actually returned.
  //
  // The URL is rewritten only when it *asked for something this session may not
  // select* — a hand-typed id, or an account that was unbound while the tab was
  // open. A URL that asked for nothing is left alone: the surface opens the
  // first authorized account, and silently writing that into the address bar
  // would be a navigation nobody requested, which is also how a correction can
  // race a click and pull the operator back to the page they just left.
  useEffect(() => {
    // The preceding accounts effect has already marked a new read loading in
    // the ref. A render's old list cannot reject a newly requested account.
    const current=ref.current;
    if (current.accounts.status !== "ready" && current.accounts.status !== "stale") return;
    const authorized = current.accounts.data.map((account) => account.accountId);
    const requestedId = requestedScope.accountId;
    const chosen =
      requestedId && authorized.includes(requestedId)
        ? requestedId
        : current.selectedAccountId && authorized.includes(current.selectedAccountId)
          ? current.selectedAccountId
          : (authorized[0] ?? null);

    if (chosen && chosen !== current.selectedAccountId) {
      commit(selectAccount(current, chosen));
    }
    if (requestedId && chosen !== requestedId) {
      router.replace(
        workspaceHref(pathname, { creatorId: requestedScope.creatorId, accountId: chosen }),
        { scroll: false },
      );
    }
  }, [
    state.accounts,
    state.selectedAccountId,
    requestedScope.creatorId,
    requestedScope.accountId,
    commit,
    ref,
    router,
    pathname,
  ]);

  // The accounts the server authorized. The creator filter already happened in
  // the read, so this list *is* the scope the surface may show — there is no
  // second, local filter that could disagree with the server's answer.
  const authorizedAccounts = useMemo(
    () =>
      state.accounts.status === "ready" || state.accounts.status === "stale"
        ? state.accounts.data
        : [],
    [state.accounts],
  );
  const authorizedIds = useMemo(
    () => authorizedAccounts.map((account) => account.accountId),
    [authorizedAccounts],
  );

  // Conversations for the selected account.
  useEffect(() => {
    const accountId = state.selectedAccountId;
    if (!accountId || !authorizedIds.includes(accountId)) return;
    if (requested.current.conversations.has(accountId)) return;
    requested.current.conversations.add(accountId);
    const pending = requestConversations(ref.current, accountId);
    commit(pending.state);
    void source.listConversations(accountId, null, aiOnly, inboxSearch).then((result) => {
      commit(applyConversations(ref.current, accountId, pending.generation, pending.seq, result).state);
    });
  }, [state.selectedAccountId, authorizedIds, source, commit, ref, aiOnly, inboxSearch]);

  // A single outstanding visible-tab read. Every result still passes the
  // existing account generation/sequence gates; no poll can select an account.
  useEffect(() => {
    const accountId = state.selectedAccountId;
    if (sourceMode !== "server" || view !== "inbox" || !accountId ||
        !authorizedIds.includes(accountId)) return;
    let active = true, busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => { if (active) timer = setTimeout(() => void refresh(), 3000); };
    const refresh = async () => {
      if (!active || busy) return;
      const entry = ref.current.byAccount[accountId];
      if (document.visibilityState !== "visible" || commandBusy.current ||
          ref.current.selectedAccountId !== accountId || !entry ||
          entry.conversations.status === "loading" || entry.loadingMore) {
        schedule(); return;
      }
      busy = true;
      const pending = requestConversations(ref.current, accountId, { background: true });
      commit(pending.state);
      try {
        const result = await source.listConversations(accountId, null, aiOnly, inboxSearch);
        if (active) {
          commit(applyConversationRefresh(ref.current, accountId, pending.generation, pending.seq, result).state);
          const open = currentConversationState(ref.current);
          if (!olderBusy.current && ref.current.selectedAccountId === accountId &&
              (result.status === "ready" || result.status === "stale") && open && (open.status === "ready" || open.status === "stale")) {
            const changed = result.data.items.find(row => threadNeedsRefresh(row, open.data.summary));
            if (changed) {
              const thread = requestConversation(ref.current, accountId, changed.conversationId, { background: true });
              commit(thread.state);
              const detail = await source.getConversation(accountId, changed.conversationId);
              if (active) commit(applyConversation(ref.current, accountId, changed.conversationId, thread.generation, thread.seq, detail).state);
            }
          }
        }
      } finally { busy = false; schedule(); }
    };
    const visible = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      void refresh();
    };
    schedule();
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible); };
  }, [sourceMode, view, state.selectedAccountId, authorizedIds, source, commit, ref, aiOnly, inboxSearch]);

  // The selected thread.
  useEffect(() => {
    const accountId = state.selectedAccountId;
    if (!accountId) return;
    const conversationId = state.byAccount[accountId]?.selectedConversationId;
    if (!conversationId) return;
    const key = `${accountId}:${conversationId}`;
    if (requested.current.details.has(key)) return;
    requested.current.details.add(key);
    const pending = requestConversation(ref.current, accountId, conversationId);
    commit(pending.state);
    void source.getConversation(accountId, conversationId).then((result) => {
      commit(
        applyConversation(ref.current, accountId, conversationId, pending.generation, pending.seq, result)
          .state,
      );
    });
  }, [state, source, commit, ref]);

  // Open the first conversation once a list arrives, so the surface opens on a
  // real thread instead of an empty pane. This is a presentation default, not a
  // read: it selects from the list that was already fetched.
  useEffect(() => {
    const accountId = state.selectedAccountId;
    if (!accountId) return;
    const entry = state.byAccount[accountId];
    if (!entry || entry.selectedConversationId) return;
    const list = entry.conversations;
    if (list.status !== "ready" && list.status !== "stale") return;
    const remembered = remembers ? recallSelected(draftPrincipal, accountId) : null;
    const first = list.data.items.find(item => item.conversationId === remembered) ?? list.data.items[0];
    if (first) commit(selectConversation(ref.current, accountId, first.conversationId));
  }, [state, commit, ref, remembers, draftPrincipal]);

  const accountsState = state.accounts;

  const activeAccount = useMemo(() => {
    const found = currentAccount(state);
    return found && authorizedIds.includes(found.accountId) ? found : null;
  }, [state, authorizedIds]);

  const detailState = currentConversationState(state);
  const handoverAccount = state.selectedAccountId;
  const handoverConversation = selectedSummary?.conversationId;
  const handoverRevision = selectedSummary?.revision;
  useEffect(() => {
    if (sourceMode !== "server" || view !== "inbox" || !handoverAccount || !handoverConversation) { setHandover(null); return; }
    const controller = new AbortController(); let active = true;
    setHandoverLoading(true);
    setHandover(current => current?.accountId === handoverAccount && current.conversationId === handoverConversation ? current : null);
    void fetch(`/api/onlyfans/accounts/${encodeURIComponent(handoverAccount)}/conversations/${encodeURIComponent(handoverConversation)}/handover`, {
      credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
    }).then(async response => {
      const data = response.ok ? await response.json() as Handover : null;
      if (active) setHandover(data?.schemaVersion === "of-handover.v1" && data.accountId === handoverAccount && data.conversationId === handoverConversation ? data : null);
    }).catch(() => { if (active) setHandover(null); }).finally(() => { if (active) setHandoverLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [sourceMode, view, handoverAccount, handoverConversation, handoverRevision, handoverRefresh]);
  const actionViewer = useMemo(() => ({ ...viewer, ...(agencyViewer ? { canActAsOwner: !!handoverCurrent?.canActAsOwner } : {}) }), [viewer, agencyViewer, handoverCurrent]);
  const refreshHandover = useCallback(() => {
    setHandoverRefresh(value => value + 1);
    if (!handoverAccount || !handoverConversation || olderBusy.current) return;
    const pending = requestConversation(ref.current, handoverAccount, handoverConversation, { background: true });
    commit(pending.state);
    void source.getConversation(handoverAccount, handoverConversation).then(result => {
      commit(applyConversation(ref.current, handoverAccount, handoverConversation, pending.generation, pending.seq, result).state);
    });
  }, [handoverAccount, handoverConversation, source, ref, commit]);
  const handleEngineAction: EngineActionHandler = async (requestId, action, expectedRevision, note, environment) => {
    if (!handoverAccount || !handoverConversation) return { ok: false, outcome: "refused", error: "Conversation unavailable." };
    const result = await submitEngineOperatorCommand({ accountId: handoverAccount, conversationId: handoverConversation, requestId, action, expectedRevision, note, environment });
    refreshHandover();
    return result;
  };
  /** Later pages of this conversation's requests, from the dashboard route that reads the backend with the opaque cursor. */
  const handleEngineLoadMore: EnginePageLoader = async (cursor) => {
    if (!handoverAccount || !handoverConversation) throw new Error("Conversation unavailable.");
    const response = await fetch(`/api/onlyfans/accounts/${encodeURIComponent(handoverAccount)}/conversations/${encodeURIComponent(handoverConversation)}/engine-status?limit=20&cursor=${encodeURIComponent(cursor)}`, {
      credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("Requests could not be loaded.");
    return response.json();
  };
  useEffect(() => {
    if (sourceMode !== "server" || view !== "inbox" || !handoverConversation) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible" && !commandBusy.current) refreshHandover(); }, 15000);
    return () => clearInterval(timer);
  }, [sourceMode, view, handoverConversation, refreshHandover]);

  // One account list feeds both surfaces, so Accounts and Inbox can never
  // disagree about whose accounts are on screen. Every request state passes
  // through unchanged — including `unavailable`, which must reach the page
  // rather than being flattened into an empty list.
  const scopedAccounts: RequestState<typeof authorizedAccounts> = accountsState;

  const handleSelectAccount = useCallback(
    (accountId: string) => {
      setCommandResult(null);
      commit(selectAccount(ref.current, accountId));
      // `replace`, not `push`: switching accounts is a change of scope within
      // one page, and piling a history entry per click would make Back mean
      // "the previous account" instead of "the previous page". The scope still
      // survives a reload, because it is in the URL either way.
      router.replace(
        workspaceHref(pathname, { creatorId: requestedScope.creatorId, accountId }),
        { scroll: false },
      );
    },
    [commit, ref, router, pathname, requestedScope.creatorId],
  );

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      const accountId = ref.current.selectedAccountId;
      if (!accountId) return;
      setCommandResult(null);
      if (remembers) rememberSelected(draftPrincipal, accountId, conversationId);
      commit(selectConversation(ref.current, accountId, conversationId));
    },
    [commit, ref, remembers, draftPrincipal],
  );

  const handleLoadOlder = useCallback(async () => {
    const snapshot = ref.current;
    const accountId = snapshot.selectedAccountId;
    const current = currentConversationState(snapshot);
    if (!accountId || olderBusy.current || !current || (current.status !== "ready" && current.status !== "stale") || !current.data.previousCursor) return;
    const { conversationId, previousCursor } = current.data;
    olderBusy.current = true; setLoadingOlder(true);
    const pending = requestConversation(snapshot, accountId, conversationId, { background: true });
    commit(pending.state);
    try {
      const result = await source.getConversation(accountId, conversationId, previousCursor);
      commit(appendOlderConversation(ref.current, accountId, conversationId, pending.generation, pending.seq, result).state);
    } catch {
      commit(appendOlderConversation(ref.current, accountId, conversationId, pending.generation, pending.seq,
        { status: "error", message: "Older messages could not be loaded. Reopen the conversation to retry." }).state);
    } finally { olderBusy.current = false; setLoadingOlder(false); }
  }, [source, ref, commit]);

  /** Fetch the next page and append it, keeping the rows already on screen. */
  const handleLoadMore = useCallback(() => {
    const accountId = ref.current.selectedAccountId;
    if (!accountId) return;
    const cursor = nextConversationCursor(ref.current, accountId);
    if (!cursor) return;
    const pending = requestMoreConversations(ref.current, accountId);
    commit(pending.state);
    void source.listConversations(accountId, cursor, aiOnlyRef.current, searchRef.current).then((result) => {
      commit(appendConversations(ref.current, accountId, pending.generation, pending.seq, result).state);
    });
  }, [commit, ref, source]);

  /**
   * The single command gate.
   *
   * The UI already hides and disables what a viewer may not do, and this is the
   * second check before submission. The backend separately verifies permission,
   * scope, revision and delivery holds in its canonical transaction.
   */
  const executeCommand = useCallback(async (command: CommandRequest) => {
    if (commandBusy.current) return;
    // A manual send reaches the fan, so the exact request and its requestKey are held per tab, operator and account, across a reload
    // too (not across a re-sign-in), named by a hash of the full intent (conversation, revision, canonical payload). The same send at the
    // same revision reuses the key; any change, a new revision included, is a new intent. Only a recorded ack, or two allowlisted
    // post-lookup refusals in a row (STALE_REFUSAL_CODES), release it.
    const { command: kind, accountId, conversationId, expectedRevision, payload } = command, intent = sendIntent(command);
    const sendKeys = payload.kind === "manual_message" ? heldKeyStore("of-send-keys", accountId, operatorScope) : null;
    const request = sendKeys ? { ...command, idempotencyKey: uuidRequestKey(sendKeys.keyFor(intent, { command: kind, accountId, conversationId, expectedRevision, payload })) } : command;
    const draftId = draftKey(draftPrincipal, request.accountId, request.conversationId);
    if (request.payload.kind === "manual_message" && !submittedDrafts.current.has(request.idempotencyKey)) {
      const draft = readDraft(draftId);
      if (draft.body === request.payload.body && draft.catalogItemId === String(request.payload.catalogItemId ?? "")) submittedDrafts.current.set(request.idempotencyKey, draft);
    }
    commandBusy.current = true;
    setCommandPending(true);
    setPendingAction(request.command);
    setCommandResult(null);
    const generation = ref.current.scopeGeneration;
    try {
      let result: CommandResult;
      try { result = await source.submitCommand(request); }
      catch { result = { simulated: false, applied: false, accepted: false, outcome: "unconfirmed", request, note: UNCONFIRMED_NOTE }; }
      const refusal = result.simulated ? undefined : result.refusal;
      if (sendKeys && refusal?.status === 401) forgetHeldKeys(operatorScope); // a 403 (read-only, permission, origin) is no session loss (#19)
      const held = sendKeys?.settle(intent, result.simulated ? "refused" : result.outcome === "recorded" ? "ack" : result.outcome === "unconfirmed" ? "unconfirmed"
        : STALE_REFUSAL_CODES.includes(refusal?.code ?? "") ? "stale" : "refused");
      // A refusal does not prove an earlier unconfirmed attempt failed: the send stays held and its exact retry stays offered. Once this
      // one is settled, the oldest other held send of the conversation is offered next, after a control ack too (#20).
      const next = !result.simulated && result.outcome !== "unconfirmed" && !held ? heldSend(accountId, conversationId) : null;
      if (held && !result.simulated && result.outcome !== "unconfirmed") result = { ...result, outcome: "unconfirmed", note: `${result.note} An earlier attempt is not confirmed, so retry this same request.` };
      else if (next) result = { ...next, note: `${result.note} ${next.note}` };
      const submitted = submittedDrafts.current.get(request.idempotencyKey);
      if (!result.simulated && result.outcome === "recorded" && result.intentId && submitted) {
        clearSubmittedDraft(draftId, submitted);
        submittedDrafts.current.delete(request.idempotencyKey);
      }
      if (generation !== ref.current.scopeGeneration) return;
      const selected = () => ref.current.selectedAccountId === request.accountId &&
        ref.current.byAccount[request.accountId]?.selectedConversationId === request.conversationId;
      commandByThread.current.set(`${request.accountId}:${request.conversationId}`, result);
      if (selected()) setCommandResult(result);
      setPendingAction(null);
      if (!result.simulated) {
        const accounts = await source.listAccounts({ creatorId: requestedScope.creatorId, accountId: requestedScope.accountId });
        commit(applyAccounts(ref.current, generation, accounts));
        if (generation !== ref.current.scopeGeneration) return;
        requested.current.details.delete(`${request.accountId}:${request.conversationId}`);
        requested.current.conversations.delete(request.accountId);
        if (selected()) {
          // Refresh from the canonical store; the acknowledgement is historical.
          requested.current.conversations.add(request.accountId);
          requested.current.details.add(`${request.accountId}:${request.conversationId}`);
          const list = requestConversations(ref.current, request.accountId, { background: true });
          commit(list.state);
          const listRead = await source.listConversations(request.accountId, null, aiOnlyRef.current, searchRef.current);
          commit(applyConversationRefresh(ref.current, request.accountId, list.generation, list.seq, listRead).state);
          if (generation === ref.current.scopeGeneration && selected()) {
            requested.current.details.add(`${request.accountId}:${request.conversationId}`);
            const detail = requestConversation(ref.current, request.accountId, request.conversationId, { background: true });
            commit(detail.state);
            const read = await source.getConversation(request.accountId, request.conversationId);
            commit(applyConversation(ref.current, request.accountId, request.conversationId,
              detail.generation, detail.seq, read).state);
          }
        } else { commit({ ...ref.current }); }
      }
    } catch {
      commit(applyAccounts(ref.current, generation, { status: "unavailable",
        message: "The conversation could not be refreshed. Reload the dashboard to read its current state." }));
    } finally { commandBusy.current = false; setCommandPending(false); setPendingAction(null); }
  }, [commit, ref, source, requestedScope.creatorId, requestedScope.accountId, draftPrincipal, operatorScope, heldSend]);

  const submitAction = useCallback(
    async (action: AvailableAction, payload: CommandPayload) => {
      const snapshot = ref.current;
      const account = currentAccount(snapshot);
      const detailRead = currentConversationState(snapshot);
      if (!account || !detailRead) return;
      if (detailRead.status !== "ready" && detailRead.status !== "stale") return;
      const detail = detailRead.data;
      const actionSet = availableActions({
        account,
        summary: detail.summary,
        viewer: actionViewer,
        deliveryIncident: detail.deliveryIncident,
      });
      const request = createCommandRequest({
        command: commandForAction(action),
        accountId: account.accountId,
        conversationId: detail.summary.conversationId,
        expectedRevision: detail.summary.revision,
        payload,
      });
      // A manual send's requestKey comes from the held key store in executeCommand: a retry at the same revision in this tab, after a
      // reload too, keeps it; after a recorded ack an intentional repeat of the same text gets a new one.
      if (!canSubmitCommand(actionViewer, actionSet, action)) {
        setCommandResult({
          simulated: true,
          applied: false,
          accepted: false,
          refusalReason: "This session or this conversation does not permit that action.",
          request,
          note: "Refused before submission: this session or this conversation does not permit that action.",
        });
        return;
      }
      await executeCommand(request);
    },
    [ref, actionViewer, executeCommand],
  );

  const handleCommand = useCallback(
    (action: AvailableAction, payload: CommandPayload) => {
      void submitAction(action, payload);
    },
    [submitAction],
  );

  // The developer controls are a fixture affordance: they override reads that
  // only the fixture source can perform. A live surface therefore renders
  // neither them nor the sample-data chrome, because either would be a control
  // or a label that describes something untrue about live data.
  const showPreviewChrome = sourceMode === "fixture";
  const developerControls: ReactNode = (
    <PreviewControlsPanel
      controls={controls}
      presets={PRESETS}
      onChange={(patch) => setControls((current) => ({ ...current, ...patch }))}
      onApplyPreset={(preset) => {
        setControls(preset.controls);
        setCommandResult(null);
      }}
      onReset={() => {
        setControls(DEFAULT_CONTROLS);
        setCommandResult(null);
      }}
    />
  );

  // The creator name comes from the account bindings the server returned, never
  // from a local fixture index — and only when the list is one creator's. With
  // no creator requested the surface shows every creator this session may read,
  // and naming the first one over a grid of several would be a caption that
  // contradicts the page it labels.
  const creatorIds = new Set(authorizedAccounts.map((account) => account.binding.creatorId));
  const creatorName =
    creatorIds.size === 1 ? (authorizedAccounts[0]?.binding.creatorName ?? null) : null;

  if (view === "accounts") {
    return (
      <AccountsView
        controls={showPreviewChrome ? developerControls : undefined}
        showPreviewChrome={showPreviewChrome}
        accountsState={scopedAccounts}
        activeAccountId={state.selectedAccountId}
        openConnectionAccountId={searchParams.get("connection") === "1" ? requestedScope.accountId : null}
        onSelectAccount={handleSelectAccount}
        readOnly={!viewer.canManage}
        creatorName={creatorName}
        sourceLabel={source.label}
        connectionsConfigured={sourceMode === "server" && connectionsConfigured}
        connectionCreators={connectionCreators}
        agencyConnections={agencyViewer}
      />
    );
  }

  return (
    <InboxView
      draftPrincipal={draftPrincipal}
      accountControls={sourceMode === "server" && activeAccount && actionViewer.canManage ? <AllFansControl key={activeAccount.accountId} account={activeAccount} viewer={actionViewer} source={source} onChanged={() => {
        const id = ref.current.selectedAccountId; if (!id) return;
        const pending = requestConversations(ref.current, id); commit(pending.state);
        void source.listConversations(id, null, aiOnlyRef.current, searchRef.current).then(result => commit(applyConversations(ref.current, id, pending.generation, pending.seq, result).state));
        refreshHandover();
      }} /> : undefined}
      controls={showPreviewChrome ? developerControls : undefined}
      showPreviewChrome={showPreviewChrome}
      accountsState={scopedAccounts}
      activeAccount={activeAccount}
      activeAccountId={state.selectedAccountId}
      onSelectAccount={handleSelectAccount}
      conversations={mapState<CursorPage<ConversationSummary>, CursorPage<ConversationSummary>>(
        state.selectedAccountId
          ? (state.byAccount[state.selectedAccountId]?.conversations ?? { status: "loading" })
          : (state.accounts.status === "empty" ? { status: "empty" } : { status: "loading" }),
        page => ({ ...page, items: page.items.map(summary => mergeListControl(summary, selectedSummary)) }),
      )}
      selectedConversationId={
        state.selectedAccountId
          ? (state.byAccount[state.selectedAccountId]?.selectedConversationId ?? null)
          : null
      }
      onSelectConversation={handleSelectConversation}
      detailState={detailState}
      loadingOlder={loadingOlder}
      onLoadOlder={handleLoadOlder}
      viewer={actionViewer}
      aiOnly={aiOnly}
      inboxSearch={inboxSearch}
      onInboxSearchChange={next => {
        if (next.query === searchRef.current.query && next.filter === searchRef.current.filter) return;
        requested.current.conversations.clear();
        searchRef.current = next;
        setInboxSearch(next);
        if (remembers) rememberFilters(draftPrincipal, requestedScope.creatorId, { search: next, aiOnly: aiOnlyRef.current });
      }}
      onAiFilterChange={enabled => {
        if (aiOnlyRef.current === enabled) return;
        aiOnlyRef.current = enabled;
        requested.current.conversations.clear();
        setAiOnly(enabled);
        if (remembers) rememberFilters(draftPrincipal, requestedScope.creatorId, { search: searchRef.current, aiOnly: enabled });
      }}
      onEngineLoadMore={sourceMode === "server" ? handleEngineLoadMore : undefined}
      onEngineAction={sourceMode === "server" && actionViewer.kind === "operator" && (actionViewer.canManage || actionViewer.canChat === true) ? handleEngineAction : undefined}
      handoverHistory={sourceMode === "server" ? handover : null}
      handover={sourceMode === "server" ? <HandoverPanel value={handoverCurrent} loading={handoverLoading} onRefresh={refreshHandover} /> : undefined}
      onCommand={handleCommand}
      commandResult={commandResult}
      commandPending={commandPending}
      pendingAction={pendingAction}
      onRetryCommand={() => {
        if (commandResult && !commandResult.simulated && commandResult.outcome === "unconfirmed") {
          void executeCommand(commandResult.request);
        }
      }}
      nextCursor={
        state.selectedAccountId ? nextConversationCursor(state, state.selectedAccountId) : null
      }
      loadingMore={state.selectedAccountId ? isLoadingMore(state, state.selectedAccountId) : false}
      onLoadMore={handleLoadMore}
    />
  );
}

