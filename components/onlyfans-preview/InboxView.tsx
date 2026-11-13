"use client";

// The OnlyFans inbox. Presentation refresh; backend command and ownership gates remain authoritative.
//
// The fan profile and reply controls stay visible on desktop. The existing
// capability, ownership and delivery gates decide which commands can be used.
// Compact rendering changes presentation only; stale reads remain visible.

import { EngineStatus, type EngineActionHandler, type EnginePageLoader } from "./EngineStatus";
import { engineControlLabel, engineControlPendingLabel, isEngineControlAction, orderControls } from "@/lib/onlyfans/engine-controls";
import { parseEngineStatus } from "@/lib/onlyfans/engine-status";
import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AlertTriangle, ArrowUpRight, Check, ImagePlus, MessageCircle, Pause, Search, Send, Sparkles, UserRound } from "lucide-react";
import styles from "./InboxView.module.css";
import ManualMediaAttachments from "./ManualMediaAttachments";
import { manualPriceCents, validManualMedia, type ManualMedia } from "@/lib/onlyfans/manual-media";
import { onlyFansMessageText } from "@/lib/onlyfans/message-display";
import { parseFanFinancials } from "@/lib/onlyfans/fan-financials";
import { EMPTY_INBOX_SEARCH, type InboxSearch } from "@/lib/onlyfans/inbox-search";
import { draftKey, readDraft, writeDraft, subscribeDraft, emptyDraft } from "@/lib/onlyfans/inbox-drafts";
import { recallScroll, rememberScroll } from "@/lib/onlyfans/inbox-view-memory";
import BMemoryPanel from "@/components/onlyfans-launch/memory/BMemoryPanel";
import FanMemoryCategories from "./FanMemoryCategories";
import { inboxSyncNotice } from "@/lib/onlyfans/inbox-sync";
import CreatorPortrait from "./CreatorPortrait";
import MessageAttachments from "./MessageAttachments";
import { useInboxIdentity } from "./InboxIdentity";
import { Card } from "@/components/ui/card";
import OnlyFansAvatar from "./OnlyFansAvatar";
import { availableActions, canSubmitCommand, commandPayloadProblem } from "@/lib/onlyfans-preview/actions";
import { MAX_MANUAL_MESSAGE_BYTES } from "@/lib/onlyfans/controls";
import { conversationTimeline, isAiChatting, effectiveAiStatus, replyOwnership } from "@/lib/onlyfans/ai-visibility";
import type { Handover } from "@/lib/onlyfans/handover";
import type { ActionSet } from "@/lib/onlyfans-preview/actions";
import { formatAge } from "@/lib/onlyfans-preview/fixtures";
import { displayTime as formatPreviewTime, displayDay, displayDateTime } from "@/lib/onlyfans/time";
import type {
  AvailableAction,
  CommandPayload,
  ConversationDetail,
  ConversationMessage,
  ConversationSummary,
  CursorPage,
  DeliveryResolutionDecision,
  MessageOrigin,
  OfAccount,
  OwnedMediaItem,
  PreviewViewer,
  RequestState,
  CommandResult,
} from "@/lib/onlyfans-preview/types";
import { NO_PAYLOAD } from "@/lib/onlyfans-preview/types";
import {
  DeliveryPill,
  OwnershipPill,
  SimulatedTag,
  formatMoney,
} from "./labels";
import { FreshnessLine } from "./PreviewChrome";
import PreviewNotice from "./PreviewNotice";
import { RequestStateBlock } from "./RequestStateBlock";
import { parseWorkspace, formatRecordedMoney, type CatalogRead } from "@/lib/onlyfans/workspace";
import { fanContentHistory } from "@/lib/onlyfans/chat-content-history";
import ChatContentPicker, { isSendableOffer, offerMediaSummary } from "./ChatContentPicker";
import { Info } from "@/components/clone/fields";

const PRIORITY_LABEL: Record<ConversationSummary["priority"], { label: string; tone: "pink" | "gold" | "slate" }> = {
  priority: { label: "Priority", tone: "pink" },
  normal: { label: "Normal", tone: "slate" },
  quiet: { label: "Quiet", tone: "slate" },
};

/** Who produced an outbound message, in the operator's words. */
const ORIGIN_LABEL: Record<MessageOrigin, string> = {
  fan: "the fan",
  ai: "the engine",
  human: "an operator",
  imported: "imported history",
};

function fanName(fan: ConversationSummary["fan"]): string {
  return !fan.displayName || /^unnamed fan$/i.test(fan.displayName.trim()) ? `Fan ${fan.shortRef}` : fan.displayName;
}

function AccountChips({
  accounts,
  activeAccountId,
  onSelectAccount,
}: {
  accounts: OfAccount[];
  activeAccountId: string | null;
  onSelectAccount: (accountId: string) => void;
}) {
  if (accounts.length === 0) return null;
  return (
    <div className="of-accounts" aria-label="Creator accounts">
      {accounts.map(account => <button key={account.accountId} type="button"
        data-of-account-chip={account.accountId} aria-pressed={account.accountId === activeAccountId}
        onClick={() => onSelectAccount(account.accountId)} title={`${account.binding.creatorName} · @${account.binding.handle}`}
        className="of-account" aria-label={account.binding.creatorName + " @" + account.binding.handle}>
        <span className="creator-name"><CreatorPortrait creatorId={account.binding.creatorId} name={account.binding.creatorName} providerAvatarUrl={account.creatorProfile?.avatarUrl} /></span>
        <span className="of-account-copy"><strong className="creator-name">{account.binding.creatorName}</strong><small>@{account.binding.handle}</small></span>
        <span className="of-health" data-health={account.health} aria-label={account.health} title={account.healthReason ?? account.health} />
      </button>)}
    </div>
  );
}

function AiChattingBadge({ conversation, account }: { conversation: ConversationSummary; account: OfAccount | null }) {
  const status = effectiveAiStatus(conversation, account);
  return <span className="of-ai-badge" data-of-ai-chatting title={status}>{status}</span>;
}

/** Ownership pill and AI status badge, one rule for the row and the chat header. */
function OwnershipBadges({ conversation, account, handover }: { conversation: ConversationSummary; account: OfAccount | null; handover?: Handover | null }) {
  const ownership = replyOwnership(conversation, account, handover);
  return <>
    {ownership.label !== "AI handling" ? <OwnershipPill ownership={ownership} /> : null}
    {isAiChatting(conversation) && ownership.label !== "AI paused" ? <AiChattingBadge conversation={conversation} account={account} /> : null}
  </>;
}

function ConversationList({
  conversations,
  account,
  selectedConversationId,
  onSelectConversation,
  nextCursor,
  loadingMore,
  onLoadMore,
  aiOnly,
  onAiFilterChange,
  inboxSearch,
  onInboxSearchChange,
}: {
  conversations: RequestState<CursorPage<ConversationSummary>>;
  account: OfAccount | null;
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
  aiOnly: boolean;
  onAiFilterChange: (enabled: boolean) => void;
  inboxSearch: InboxSearch;
  onInboxSearchChange: (search: InboxSearch) => void;
}) {
  const [query, setQuery] = useState(inboxSearch.query);
  const filter = aiOnly ? "ai" : inboxSearch.filter;
  const localMatch = (row: ConversationSummary) => filter === "ai" ? isAiChatting(row) : filter === "paused" ? ["paused", "no_contact"].includes(row.automationMode) : filter === "review" ? row.attentionReasons?.includes("human_review") || row.automationMode === "human_controlled" || row.takeoverState !== "none" : filter === "delivery" ? row.attentionReasons?.includes("delivery_problem") : true;
  const visibleConversations = conversations.status === "ready" || conversations.status === "stale"
    ? { ...conversations, data: { ...conversations.data, items: conversations.data.items.filter(localMatch) } } : conversations;
  const searchChange = useRef(onInboxSearchChange);
  searchChange.current = onInboxSearchChange;
  useEffect(() => { const timer = setTimeout(() => searchChange.current({ query, filter }), 250); return () => clearTimeout(timer); }, [query, filter]);
  const chooseFilter = (value: InboxSearch["filter"]) => { onInboxSearchChange({ query, filter: value }); onAiFilterChange(value === "ai"); };
  return (
    <div className="of-list-content">
    <div className="of-list-heading"><h2>Conversations</h2></div>
    <label className="of-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search fan name, username or ID</span><input type="search" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search fan name, username or ID" /></label>
    <div className="of-filters" aria-label="Filter conversations">{([ ["all", "All"], ["unread", "Unread"], ["review", "Human handling"] ] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => chooseFilter(key)}>{label}</button>)}</div>
    <details className="of-more-filters" open={["attention", "paused", "delivery", "ai"].includes(filter)}><summary>More filters</summary>
      <div className="of-filters" aria-label="More conversation filters">{([ ["attention", "Attention"], ["paused", "Intentionally paused"], ["delivery", "Delivery problem"], ["ai", "AI enabled"] ] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => chooseFilter(key)}>{label}</button>)}</div></details>
    <p className="of-filter-note">Searches saved fan names, usernames and IDs across this account. Message contents are not searched.</p>
    {["paused", "review", "delivery"].includes(filter) && nextCursor ? <p className="of-filter-note">This status filter covers loaded search results. Load more to inspect further matches.</p> : null}
    <RequestStateBlock
      showStaleWarning={false}
      state={visibleConversations}
      label="conversations"
      render={(page) =>
        page.items.length === 0 && !nextCursor ? (
          <div className="px-3.5 py-6 text-xs leading-5 text-muted">
            {aiOnly ? "No conversations have AI chatting enabled for this account." : "No conversations in scope for this account."}
          </div>
        ) : (
          <div data-of-conversation-list>
            {page.items.length === 0 ? <p className="of-filter-note px-4 py-6" role="status">No saved conversations match this search.</p> : null}
            <div className="divide-y divide-line/80">
              {page.items.map((conversation) => {
                const active = conversation.conversationId === selectedConversationId;
                const priority = PRIORITY_LABEL[conversation.priority];
                return (
                  <button
                    key={conversation.conversationId}
                    type="button"
                    data-of-conversation-id={conversation.conversationId}
                    aria-current={active ? "true" : undefined}
                    onClick={() => onSelectConversation(conversation.conversationId)}
                    className={`of-conversation flex w-full gap-3 px-3.5 py-3 text-left transition ${
                      active
                        ? "border-l-[3px] border-accent-2 bg-accent-2/[0.045] pl-[11px]"
                        : "hover:bg-[#f8fafc]"
                    }`}
                  >
                    <OnlyFansAvatar
                      name={conversation.fan.displayName}
                      avatarUrl={conversation.fan.avatarUrl}
                      className="h-9 w-9 text-[11px]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-ink">
                          {fanName(conversation.fan)}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted">
                          {formatAge(conversation.lastActivityAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {conversation.lastMessagePreview}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1">
                        {conversation.requiresAttention ? (
                          <span className="rounded-full bg-[#fdf2f6] px-1.5 py-0.5 text-[10px] font-semibold text-[#9b2f62]">
                            {conversation.priority === "normal" ? "Attention" : priority.label}
                          </span>
                        ) : null}
                        {["failed", "partial", "unknown", "refused"].includes(conversation.delivery) ? <DeliveryPill outcome={conversation.delivery} /> : null}
                        {conversation.unreadCount > 0 ? <span className="of-unread" aria-label={`${conversation.unreadCount} unread messages`}>{conversation.unreadCount}</span> : null}
                        <OwnershipBadges conversation={conversation} account={account} />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {nextCursor ? (
              <div className="border-t border-line/80 p-3">
                <button
                  type="button"
                  data-of-load-more
                  onClick={onLoadMore}
                  disabled={loadingMore}
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-ink transition hover:bg-elev/70 disabled:cursor-not-allowed disabled:text-muted"
                >
                  {loadingMore ? "Loading more…" : "Load more conversations"}
                </button>
              </div>
            ) : null}
          </div>
        )
      }
    />
    </div>
  );
}

/**
 * The thread. Same bubble classes as the Telegram Fans thread (`tg-bubble`,
 * `tg-bubble-in/out`, run tails, the day rule) so the two channels read as one
 * product, with the OnlyFans receipt attached under each outbound bubble.
 */
function Thread({ detail, principal, handoverHistory, loadingOlder, onLoadOlder }: { detail: ConversationDetail; principal: string; handoverHistory?: Handover | null; loadingOlder: boolean; onLoadOlder: () => void }) {
  const remembers = principal !== "fixture" && principal !== "unavailable";
  const timeline = conversationTimeline(detail, handoverHistory);
  const messages = timeline.filter(entry => entry.kind === "message").length;
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Open on the newest message, the way the Telegram thread does: a bottom-anchored
  // run inside a scroll box that starts at the top would otherwise show nothing but
  // wallpaper when the operator switches to a fan.
  const olderAnchor = useRef<{ height: number; top: number } | null>(null);
  const bottom = useRef(true);
  const previousThread = useRef("");
  const previousMessages = useRef(0);
  // Messages that arrived while the reader was scrolled up. They are never
  // dragged into view; the pill below says how many are waiting.
  const [unseen, setUnseen] = useState(0);
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (previousThread.current !== detail.conversationId) {
      previousThread.current = detail.conversationId; olderAnchor.current = null; bottom.current = true;
      // Coming back to a thread you had scrolled up in reopens it where you were.
      const saved = remembers ? recallScroll(principal, detail.accountId, detail.conversationId) : null;
      if (saved === null) node.scrollTop = node.scrollHeight; else { node.scrollTop = saved; bottom.current = false; }
      setUnseen(0);
    } else if (olderAnchor.current && !loadingOlder) {
      node.scrollTop = olderAnchor.current.top + node.scrollHeight - olderAnchor.current.height;
      olderAnchor.current = null;
    } else if (!olderAnchor.current && bottom.current) node.scrollTop = node.scrollHeight;
    else if (!olderAnchor.current && messages > previousMessages.current) { const added = messages - previousMessages.current; setUnseen(count => count + added); }
    previousMessages.current = messages; // the pill counts messages, not handover or control events
  }, [detail.conversationId, timeline.length, messages, loadingOlder]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
    <div
      ref={scrollRef}
      className="tg-thread min-h-[16rem] flex-1 overflow-y-auto px-3 py-3"
      data-of-thread
      onScroll={event => { const node = event.currentTarget; bottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80; if (bottom.current) setUnseen(count => count ? 0 : count);
        if (remembers) rememberScroll(principal, detail.accountId, detail.conversationId, bottom.current ? null : node.scrollTop); }}
    >
      {/* A short thread sits at the bottom of the panel, the way a chat does,
          instead of leaving the wallpaper dangling under three bubbles. */}
      <div className="flex min-h-full flex-col justify-start">
      {detail.previousCursor ? <button type="button" data-of-load-older className="mx-auto mb-3 rounded-full bg-black/25 px-4 py-2 text-xs text-white" disabled={loadingOlder} onClick={() => {
        const node = scrollRef.current;
        if (node) olderAnchor.current = { height: node.scrollHeight, top: node.scrollTop };
        onLoadOlder();
      }}>{loadingOlder ? "Loading older messages…" : "Load older messages"}</button> : null}
      {timeline.length === 0 ? (
        <div className="mx-auto w-fit rounded-full bg-black/25 px-3 py-1 text-[11px] font-medium text-white">
          No messages in this view
        </div>
      ) : (
        timeline.map((entry, index) => {
          if (entry.kind === "control") return <div key={`control:${entry.event.revision}`} className="of-control-event" data-of-handover-event={entry.event.revision}><span>{entry.label}</span><time dateTime={entry.at}>{displayDateTime(entry.at)}</time></div>;
          const message = entry.message;
          const inbound = message.direction === "inbound";
          const previousEntry = timeline[index - 1], nextEntry = timeline[index + 1];
          const previous = previousEntry?.kind === "message" ? previousEntry.message : null;
          const next = nextEntry?.kind === "message" ? nextEntry.message : null;
          const startsRun = !previous || previous.direction !== message.direction;
          const endsRun = !next || next.direction !== message.direction;
          return (
            <div key={message.messageId}>
              {!previous || displayDay(previous.occurredAt) !== displayDay(message.occurredAt) ? <div className="of-message-day">{displayDay(message.occurredAt)}</div> : null}

              <div className={"flex " + (inbound ? "justify-start" : "justify-end") + (startsRun ? " mt-2" : " mt-0.5")}>
                <div className="flex max-w-[78%] flex-col items-stretch gap-1">
                  <div
                    data-of-message-id={message.messageId}
                    data-of-message-delivery={message.delivery}
                    className={
                      "tg-bubble " +
                      (inbound ? "tg-bubble-in " : "tg-bubble-out ") +
                      (endsRun ? (inbound ? "tg-tail-in" : "tg-tail-out") : "")
                    }
                  >
                    <MessageAttachments accountId={detail.accountId} attachments={message.attachments} conversationId={message.conversationId} messageId={message.messageId} />
                    <span className="whitespace-pre-wrap">{onlyFansMessageText(message.body)}</span>
                    <time className="tg-meta" dateTime={message.occurredAt} title={message.occurredAt}>{formatPreviewTime(message.occurredAt)}</time>
                  </div>
                  {!inbound ? (
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {message.origin === "ai" ? <span className="of-ai-reply" data-of-ai-reply>AI message</span> : message.origin === "human" ? <span>Human message</span> : <span>Imported from OnlyFans</span>}
                      {message.delivery === "sent" ? <span className="of-sent-receipt" title={`Provider accepted this message from ${ORIGIN_LABEL[message.origin]}. Read and purchase status are not confirmed.${message.evidenceRef ? " Receipt recorded." : ""}`}><Check size={13} aria-hidden="true" /><span className="sr-only">Sent to provider</span></span> : <DeliveryPill outcome={message.delivery} />}
                      {message.delivery !== "sent" && message.evidenceRef ? <span title={`Delivery receipt: ${message.evidenceRef}`} className="text-[10px] text-white/90">Receipt recorded</span> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })
      )}


      </div>
    </div>
    {unseen > 0 ? <button type="button" data-of-new-messages className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white shadow-lg"
      onClick={() => { const node = scrollRef.current; if (node) node.scrollTo({ top: node.scrollHeight }); bottom.current = true; setUnseen(0); }}>
      {unseen === 1 ? "1 new message" : `${unseen} new messages`} ↓</button> : null}
    </div>
  );
}

function Composer({
  draftId,
  actionSet,
  viewer,
  account,
  onSubmit,
  onTakeover,
  disabledReason,
  simulated,
  pending,
  pendingAction,
  result,
  detail,
}: {
  draftId: string;
  actionSet: ActionSet;
  viewer: PreviewViewer;
  account: OfAccount;
  onSubmit: (body: string, catalogItemId?: number, media?: ManualMedia) => void;
  onTakeover: () => void;
  disabledReason: string | null;
  simulated: boolean;
  pending: boolean;
  pendingAction?: string | null;
  result: CommandResult | null;
  /** The open conversation, for fan-specific content history. Without it the picker stays closed and the select remains. */
  detail?: ConversationDetail;
}) {
  const [pickerOpen, setPickerOpen] = useState(false), attachButton = useRef<HTMLButtonElement>(null);
  const draft = useSyncExternalStore(subscribeDraft, () => readDraft(draftId), emptyDraft);
  const text = draft.body, catalogItemId = draft.catalogItemId;
  const setText = (body: string) => writeDraft(draftId, { body });
  // An offer and vault attachments are alternatives: choosing an offer drops attachments, and attaching media clears the offer (ManualMediaAttachments).
  const setCatalogItemId = (catalogItemId: string) => writeDraft(draftId, { catalogItemId, ...(catalogItemId ? { selectedMedia: [], mediaPaid: false, previewIds: [] } : {}) });
  const [catalogue, setCatalogue] = useState<CatalogRead["items"]>([]);
  const [catalogueCursor, setCatalogueCursor] = useState<string | null>(null), [catalogueBusy, setCatalogueBusy] = useState(false), [catalogueError, setCatalogueError] = useState("");
  const catalogueActive = useRef(true), catalogueRequest = useRef(false);
  const loadCatalogue = useCallback(async (cursor: string | null = null) => {
    if (simulated || account.capabilities.sendManualMessage !== "available" || catalogueRequest.current) return;
    catalogueRequest.current = true; setCatalogueBusy(true); setCatalogueError("");
    try {
      const response = await fetch(`/api/onlyfans/accounts/${encodeURIComponent(account.accountId)}/workspace/content${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("Saved paid content is unavailable. Text replies remain available.");
      const value = await response.json(), parsed = parseWorkspace(value.workspace, account.accountId, "content");
      if (!parsed || parsed.section !== "content") throw new Error("Saved paid content could not be read.");
      if (catalogueActive.current) { setCatalogue(previous => cursor ? [...new Map([...previous, ...parsed.items].map(item => [item.itemId, item])).values()] : parsed.items); setCatalogueCursor(parsed.nextCursor); }
    } catch (error) { if (catalogueActive.current) setCatalogueError(error instanceof Error ? error.message : "Saved paid content could not be read."); }
    finally { catalogueRequest.current = false; if (catalogueActive.current) setCatalogueBusy(false); }
  }, [account.accountId, account.capabilities.sendManualMessage, simulated]);
  useEffect(() => { catalogueActive.current = true; void loadCatalogue(); return () => { catalogueActive.current = false; }; }, [loadCatalogue]);
  const selectedOffer = catalogItemId ? catalogue.find(item => item.itemId === catalogItemId) : undefined;
  const canSend = canSubmitCommand(viewer, actionSet, "send_manual_message") && !disabledReason && !pending;
  const takeoverAvailable = canSubmitCommand(viewer, actionSet, "request_takeover");
  const takeoverDisabled = pending || (!result?.simulated && result?.outcome === "unconfirmed");
  const sendBlockedReason = disabledReason ?? actionSet.blocked.find(entry => entry.action === "send_manual_message")?.reason;
  const bodyProblem =
    text.trim().length === 0
      ? null
      : new TextEncoder().encode(text).length > MAX_MANUAL_MESSAGE_BYTES
        ? `Longer than the ${MAX_MANUAL_MESSAGE_BYTES} byte limit.`
        : null;
  const canEdit = !pending && (viewer.canManage || viewer.canChat === true);
  const media: ManualMedia | undefined = draft.selectedMedia.length ? {
    mediaIds: draft.selectedMedia.map(row => row.mediaId), previewIds: draft.mediaPaid ? draft.previewIds : [],
    priceCents: draft.mediaPaid ? manualPriceCents(draft.mediaPrice) ?? -1 : 0,
  } : undefined;
  const mediaProblem = media && !validManualMedia(media) ? "Set a price from USD 3.00 to 200.00 and leave at least one attachment locked, or choose Free." : null;
  const submittable = canSend && bodyProblem === null && !mediaProblem && (!!text.trim() || !!media);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!submittable) return;
    onSubmit(text, media ? undefined : catalogItemId ? Number(catalogItemId) : undefined, media);
  }

  return (
    <div className="of-composer border-t border-line p-3">
      <form onSubmit={handleSubmit} className="space-y-2">
        <p className="text-xs text-muted">Replying as {account.binding.creatorName} · @{account.binding.handle}. Draft kept in this tab for up to 8 hours, until reload or sign-out.</p>
        {takeoverAvailable ? <button type="button" data-of-composer-takeover onClick={onTakeover}
          disabled={takeoverDisabled} className="of-control-button of-primary">
          <UserRound size={16} aria-hidden="true" />{pending && pendingAction === "request_takeover" ? engineControlPendingLabel("request_takeover") : engineControlLabel("request_takeover", true)}
        </button> : null}
        {!simulated && account.capabilities.sendManualMessage === "available" ? <ManualMediaAttachments key={draftId} accountId={account.accountId} draftId={draftId} draft={draft} disabled={!canEdit} /> : null}
        {!simulated && account.capabilities.sendManualMessage === "available" ? <details className="of-paid-content" open={catalogItemId ? true : undefined}><summary><ImagePlus size={15} aria-hidden="true" />{catalogItemId ? "Paid content selected" : "Attach paid content"}</summary><div className="space-y-1">
          {detail ? <button type="button" ref={attachButton} data-of-attach-content aria-haspopup="dialog" disabled={!canSend} onClick={() => setPickerOpen(true)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-50"><ImagePlus size={14} aria-hidden="true" />Attach content</button> : null}
          <label className="block text-[11px] font-medium text-muted">Paid content
            <select data-of-manual-offer value={catalogItemId} onChange={event => setCatalogItemId(event.target.value)} disabled={!canSend}
              className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ink disabled:bg-elev disabled:text-muted">
              <option value="">Text reply only</option>
              {catalogue.filter(isSendableOffer).map(item => <option key={item.itemId} value={item.itemId}>{item.label} · {formatRecordedMoney(item.priceCents!, item.currency)}</option>)}
            </select>
          </label>
          {catalogueError ? <p className="text-[11px] text-muted" role="status">{catalogueError}</p> : null}
          {catalogueCursor || catalogueError ? <button type="button" className="text-[11px] font-semibold text-accent disabled:text-muted" disabled={!canSend || catalogueBusy} onClick={() => void loadCatalogue(catalogueCursor)}>{catalogueBusy ? "Loading…" : catalogueCursor ? "Load more saved content" : "Retry saved content"}</button> : null}
        </div></details> : null}
        {catalogItemId ? <div className="rounded-lg border border-line bg-elev px-3 py-2 text-xs" data-of-composition-summary>
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 break-words font-semibold">{selectedOffer ? selectedOffer.label : `Saved item #${catalogItemId}`}
              <Info className="ml-1" text="This reply will include the saved item at its catalogue price and previews. The price and the free and paid split come from the Content page and cannot be changed here." /></p>
            <button type="button" data-of-composition-clear disabled={pending} onClick={() => setCatalogItemId("")} className="shrink-0 font-semibold text-accent disabled:opacity-50">Clear</button>
          </div>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt className="text-muted">Attachments</dt><dd>{selectedOffer ? offerMediaSummary(selectedOffer) : "Not loaded yet"}</dd>
            <dt className="text-muted">Caption</dt><dd className="line-clamp-2 min-w-0 whitespace-pre-wrap break-words">{text.trim() || "No caption yet"}</dd>
            <dt className="text-muted">Approved price</dt><dd className="font-semibold">{selectedOffer?.priceCents != null ? formatRecordedMoney(selectedOffer.priceCents, selectedOffer.currency) : "Not loaded yet"}</dd>
          </dl>
        </div> : null}
        <div className="of-input flex items-start gap-3 rounded-xl border border-line bg-white px-3 py-2.5">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Manual message</span>
            <textarea
              data-of-composer
              value={text}
              onChange={(event) => setText(event.target.value)}
              disabled={!canEdit}
              rows={1}
              placeholder={canEdit ? (media ? "Add a caption (optional)…" : "Write a reply as the creator…") : pending ? pendingAction === "send_manual_message" ? "Sending…" : "Updating reply control…"
                : sendBlockedReason === "Take over this conversation before sending a manual reply."
                  ? "Take over to reply" : "Reply unavailable, see reason below"}
              className="w-full resize-none bg-transparent text-sm text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed"
            />
          </label>
          <button
            type="submit"
            data-of-send
            disabled={!submittable}
            aria-label="Send as creator"
            className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent text-white transition disabled:cursor-not-allowed disabled:bg-elev disabled:text-muted"
          >
            {pending && pendingAction === "send_manual_message" ? <span className="text-[10px]">…</span> : <Send className="size-3.5" />}
          </button>
        </div>
        {result && !result.simulated && result.request.command === "send_manual_message" ? <p role={result.accepted ? "status" : "alert"} className="text-xs" data-of-composer-result>{result.note}</p> : null}
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
          {simulated ? <SimulatedTag /> : null}
          <span>
            {disabledReason ??
              bodyProblem ?? mediaProblem ??
              (simulated ? `Nothing is sent. @${account.binding.handle} is a fixture, and this preview has no delivery authority.`
                : actionSet.blocked.find(entry => entry.action === "send_manual_message")?.reason ??
                  null)}
          </span>
        </div>
      </form>
      {/* Outside the form: portalled dialogs still bubble submit events through the React tree. */}
      {pickerOpen && detail ? <ChatContentPicker key={account.accountId} accountId={account.accountId} offers={catalogue} offersBusy={catalogueBusy} offersError={catalogueError}
          hasMoreOffers={!!catalogueCursor} onLoadMoreOffers={() => void loadCatalogue(catalogueCursor)} selectedItemId={catalogItemId} history={fanContentHistory(detail)}
          contentHref={`/onlyfans/content?creator=${encodeURIComponent(account.binding.creatorId)}&account=${encodeURIComponent(account.accountId)}`}
          finalFocus={attachButton} onSelectOffer={setCatalogItemId} onClose={() => setPickerOpen(false)} /> : null}
    </div>
  );
}

// One option on purpose: the operator attests what the provider evidence shows before a ledger reconcile, not a dead chooser.
const RESOLUTION_OPTIONS: { value: DeliveryResolutionDecision; label: string }[] = [
  { value: "delivered", label: "The evidence shows it was delivered" },

];

function ActionColumn({
  actionSet,
  viewer,
  result,
  incident,
  onCommand,
  onResolve,
  pending,
  pendingAction,
  onRetry,
  engineAware = false,
}: {
  engineAware?: boolean;
  actionSet: ActionSet;
  viewer: PreviewViewer;
  result: CommandResult | null;
  pending: boolean;
  pendingAction?: string | null;
  onRetry: () => void;
  incident: ConversationDetail["deliveryIncident"];
  onCommand: (action: AvailableAction, payload: CommandPayload) => void;
  onResolve: (attemptId: string, decision: DeliveryResolutionDecision, providerMessageId: string) => void;
}) {
  // What the operator read in the provider's evidence. The resolution command
  // carries it, so a decision cannot be submitted without one being made.
  const [decision, setDecision] = useState<DeliveryResolutionDecision | null>(null);
  const [providerMessageId, setProviderMessageId] = useState("");

  return (
    <div className="flex flex-col gap-5">
      {incident ? (
        <div data-of-incident className="rounded-xl border border-[#f0c3cb] bg-[#fff5f6] p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#9b2f62]">
            <AlertTriangle className="size-4" />
            {incident.outcome === "dispatching" ? "Sending" : incident.outcome === "accepted_pending" ? "CRM receipt update pending" : "Delivery needs resolving"}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted">{incident.detail}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <span className="rounded-full bg-elev px-2 py-0.5 font-medium">{incident.attemptId}</span>
            <DeliveryPill outcome={incident.outcome} />
          </div>
          <div className="mt-3 space-y-1.5 border-t border-[#f0c3cb] pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              What the evidence shows
            </div>
            <div className="flex flex-col gap-1.5">
              {actionSet.available.some(entry => entry.action === "resolve_delivery_evidence") ? <label>Provider message ID<input aria-label="Provider message ID" inputMode="numeric" value={providerMessageId} onChange={event => setProviderMessageId(event.target.value)} /><small>The server verifies this exact message against OnlyFans. Missing history cannot confirm failure.</small></label> : <p>Keep this attempt held. Ask an account operator to reconcile the exact provider receipt in Operations.</p>}
              {(actionSet.available.some(entry => entry.action === "resolve_delivery_evidence") ? RESOLUTION_OPTIONS : []).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  data-of-decision={option.value}
                  aria-pressed={decision === option.value}
                  onClick={() => setDecision(option.value)}
                  className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-semibold transition ${
                    decision === option.value
                      ? "border-accent-2/40 bg-white text-ink"
                      : "border-[#f0c3cb] bg-white/70 text-muted hover:text-ink"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {result ? (
        <div
          data-of-command-result
          role={result.accepted ? "status" : "alert"}
          data-of-command-accepted={result.accepted}
          className={`rounded-xl border p-3 text-xs leading-5 ${
            result.accepted
              ? "border-[#e3c98b] bg-[#fffaee] text-[#8a5f06]"
              : "border-[#f0c3cb] bg-[#fff5f6] text-[#9b2f62]"
          }`}
        >
          <div className="font-semibold">
            {result.simulated ? (result.accepted ? "Modelled, not performed" : "Refused before submission")
              : result.outcome === "recorded" ? result.intentId ? "Message queued" : "Change saved" : result.outcome === "unconfirmed" ? "Outcome not confirmed" : "Change not accepted"}
          </div>
          <p className="mt-1">{result.note}</p>
          {!result.simulated && result.intentId && result.request.payload.kind === "manual_message" ?
            <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-white/70 p-2 text-ink">{result.request.payload.body}</p> : null}
          {result.simulated ? <p className="mt-1">
            <code className="font-mono">{result.request.command}</code> on account{" "}
            <code className="font-mono">{result.request.accountId}</code> against revision{" "}
            <code className="font-mono">{result.request.expectedRevision}</code>, idempotency key{" "}
            <code className="font-mono">{result.request.idempotencyKey}</code>.
          </p> : null}
          {!result.simulated && result.outcome === "unconfirmed" ? (
            <button type="button" data-of-retry-control disabled={pending} onClick={onRetry}
              className="mt-2 rounded-lg border border-current px-2 py-1 disabled:opacity-50">Retry same request</button>
          ) : null}
        </div>
      ) : null}

      <div className="of-reply-actions" data-of-actions>
        {orderControls(actionSet.available.filter(entry => !["send_manual_message", "mark_no_contact"].includes(entry.action))).map(entry => {
          const resolution = entry.action === "resolve_delivery_evidence";
          const needsDecision = resolution && (!incident || decision === null || commandPayloadProblem("resolve_delivery_evidence",
            { kind: "delivery_resolution", attemptId: incident.attemptId, decision, providerMessageId }) !== null);
          const primary = resolution || ["request_takeover", "release_takeover", "resume_automation"].includes(entry.action);
          const label = isEngineControlAction(entry.action) ? engineControlLabel(entry.action, engineAware) : entry.label;
          const Icon = entry.action === "request_takeover" ? UserRound : entry.action === "pause_automation" ? Pause : Sparkles;
          return <div key={entry.action}><button type="button" data-of-action={entry.action} disabled={needsDecision || pending}
            title={needsDecision ? "Choose what the evidence shows first." : undefined}
            onClick={() => resolution ? incident && decision && onResolve(incident.attemptId, decision, providerMessageId) : onCommand(entry.action, NO_PAYLOAD)}
            className={`of-control-button ${primary ? "of-primary" : "of-secondary"}`}><Icon size={16} aria-hidden="true" />{pending && pendingAction === entry.action ? isEngineControlAction(entry.action) ? engineControlPendingLabel(entry.action) : "Saving…" : label}</button>
            {needsDecision ? <p className="of-filter-note">Choose what the evidence shows before resolving.</p> : null}</div>;
        })}
        {actionSet.available.every(entry => ["send_manual_message", "mark_no_contact"].includes(entry.action)) ? <p className="of-filter-note">No reply changes are available right now.</p> : null}
      </div>
      {actionSet.available.some(entry => entry.action === "mark_no_contact") ? <details className="of-more-actions"><summary>More actions</summary><button type="button" data-of-action="mark_no_contact" disabled={pending} onClick={() => onCommand("mark_no_contact", NO_PAYLOAD)} className="of-control-button of-secondary">Stop further contact</button></details> : null}

      {actionSet.blocked.length > 0 ? (
        <details open={!!incident} className="of-blocked-actions">
          <summary className="text-xs font-semibold text-muted">Control availability</summary>
          <div className="mt-2 space-y-1.5">
            {actionSet.blocked.map((entry) => (
              <div key={entry.action} className="rounded-lg bg-[#fbfdfe] px-3 py-2">
                <div className="text-xs font-semibold text-muted">{entry.label}</div>
                <div className="mt-0.5 text-[11px] leading-4 text-muted">{entry.reason}</div>
              </div>
            ))}
          </div>
        </details>
      ) : null}

    </div>
  );
}

function FanMemory({ accountId, fanId, canCorrect }: { accountId: string; fanId: string; canCorrect: boolean }) {
  const [opened, setOpened] = useState(false);
  return <details onToggle={event => { if (event.currentTarget.open) setOpened(true); }}><summary className="of-section-heading">Edit fan notes and facts</summary>{opened ? <BMemoryPanel part="facts" canManage={canCorrect} selectedAccountId={accountId} selectedFanId={fanId} /> : null}</details>;
}

/** Archive, recovery, discovery and stored-message counters stay one click away, never ahead of fan information. */
function FanHistory({ detail, accountId, canCorrect, showMemory }: { detail: ConversationDetail; accountId: string; canCorrect: boolean; showMemory: boolean }) {
  const [opened, setOpened] = useState(false);
  return <details className="of-history-details" data-of-history-details onToggle={event => { if (event.currentTarget.open) setOpened(true); }}>
    <summary className="of-section-heading">History and sync details</summary>
    <div className="of-history-body"><div><FreshnessLine freshness={detail.freshness} /></div>
      {showMemory && opened ? <BMemoryPanel part="diagnostics" canManage={canCorrect} selectedAccountId={accountId} selectedFanId={detail.summary.fan.fanId} /> : null}</div>
  </details>;
}

const Hint = ({ text }: { text: string }) => <span className="ml-1 cursor-help text-muted/80" title={text} aria-label={text}>ⓘ</span>;
const latestPurchase = (items: OwnedMediaItem[]) => items.reduce<OwnedMediaItem | null>((best, item) => !best || Date.parse(item.purchasedAt) > Date.parse(best.purchasedAt) ? item : best, null);

/** One line built only from the loaded conversation and purchase history. */
function FanRelationship({ detail }: { detail: ConversationDetail }) {
  const latest = latestPurchase(detail.ownedMedia);
  return <p className="of-relationship" data-of-relationship>
    <span>Last activity {formatAge(detail.summary.lastActivityAt)}</span>
    <span data-of-latest-purchase>{latest ? <>Last media purchase: {formatAge(latest.purchasedAt)}</> : "No media purchase recorded in the history loaded for this fan."}</span>
  </p>;
}

function FanMetrics({detail}: {detail:ConversationDetail}) {
  const financials = parseFanFinancials(detail.financials);
  const verified = !!financials && financials.coverageComplete;
  return <div className="of-spend" data-of-spend>
    <h3 className="of-section-heading">Spend and ownership</h3>
    {!financials ? <div className="of-fan-metrics"><div><strong>Unknown</strong><span>Recorded cleared spend</span></div></div> : null}
    {!financials ? <p className="of-empty-context">Financial evidence unavailable. Refresh after the account read service recovers.</p> : <>
      {financials.totals.length ? <ul className="text-xs space-y-2">{financials.totals.map(row => <li key={`${row.currency}:${row.status}`} className="of-spend-row">
        <strong>{formatRecordedMoney(row.grossCents, row.currency)}</strong> gross · {row.status.replaceAll("_", " ")} · {row.transactions} transactions.
        <span>Net: {row.netCents === null ? "Unavailable" : formatRecordedMoney(row.netCents, row.currency)}.</span>
        <span>Last transaction: {new Date(row.lastTransactionAt).toLocaleString()}.</span>
      </li>)}</ul> : <p className="of-empty-context">No canonical transactions recorded for this fan.</p>}
      <p className="text-xs text-muted of-spend-row"><span>Coverage through {financials.coverageAt ? new Date(financials.coverageAt).toLocaleString() : "an unknown cutoff"}.</span><span>{financials.coverageComplete ? "Completed supported scan; later activity may be missing." : "Partial or unverified history; recorded totals are not lifetime spend."}</span></p>
      {financials.commerceHeld ? <p role="note" className="text-xs">Commerce is held for this fan. Ownership and payment reconciliation must be verified before paid content is sent.</p> : null}
    </>}
    {verified ? <div className="of-fan-metrics" data-of-ownership="verified"><div><strong>{detail.ownedMedia.length}</strong><span>Owned media items</span></div></div>
      : <div className="of-ownership" data-of-ownership="unverified"><strong>Known owned items: {detail.ownedMedia.length}</strong>
        <p role="note">Ownership not fully verified, payment history incomplete<Hint text="This count only covers items found in the history loaded for this fan. Payment history is not fully reconciled, so other purchases may exist. This text does not grant ownership and does not unlock selling." /></p></div>}
    <h3 className="of-section-heading">Purchased media</h3>
    {detail.ownedMedia.length ? <ul className="of-purchases">{detail.ownedMedia.map(item=><li key={item.mediaId}>
      <span className="of-purchase-icon" aria-hidden="true"><ImagePlus size={21}/></span>
      <div><strong>{item.label}</strong><small>{formatAge(item.purchasedAt)}</small></div>
    </li>)}</ul> : <p className="of-empty-context">No purchased media in this view.</p>}
  </div>;
}

function FanContext({detail}:{detail:ConversationDetail}) {
  return <div className="of-fan-context">
    <FanMemoryCategories key={`${detail.accountId}:${detail.conversationId}`} facts={detail.facts} displayName={fanName(detail.summary.fan)} />
  </div>;
}

/** Every outbound message and what the provider did with it. */
function DeliveryLedger({ messages }: { messages: ConversationMessage[] }) {
  const outbound = messages.filter((message) => message.direction === "outbound");
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Delivery</div>
      {outbound.length === 0 ? (
        <p className="mt-2 text-xs text-muted">Nothing has been sent to this fan yet.</p>
      ) : (
        <ul className="mt-2 space-y-1.5" data-of-delivery-ledger>
          {outbound.map((message) => (
            <li
              key={message.messageId}
              data-of-delivery-row={message.messageId}
              className="rounded-lg bg-[#fbfdfe] px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-medium text-muted">
                  {formatPreviewTime(message.occurredAt)}
                </span>
                <DeliveryPill outcome={message.delivery} />
              </div>
              <div className="mt-0.5 truncate text-xs text-ink">{onlyFansMessageText(message.body)}</div>
              <div className="mt-0.5 text-[10px] text-muted" title={message.evidenceRef ?? undefined}>
                {message.evidenceRef ? "Receipt recorded" : "No provider reference"}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function InboxView({
  draftPrincipal = "fixture",
  controls,
  accountControls,
  accountsState,
  activeAccount,
  activeAccountId,
  onSelectAccount,
  conversations,
  selectedConversationId,
  onSelectConversation,
  detailState,
  loadingOlder = false,
  onLoadOlder = () => {},
  viewer,
  onCommand,
  commandResult,
  pendingAction,
  drafts,
  onSearchChange,
  commandPending = false,
  onRetryCommand = () => {},
  nextCursor,
  loadingMore,
  onLoadMore,
  showPreviewChrome = true,
  handover,
  handoverHistory,
  onEngineAction,
  onEngineLoadMore,
  aiOnly = false,
  onAiFilterChange = () => {},
  inboxSearch = EMPTY_INBOX_SEARCH,
  onInboxSearchChange = () => {},
}: {
  draftPrincipal?: string;
  controls?: ReactNode;
  accountControls?: ReactNode;
  handover?: ReactNode;
  handoverHistory?: Handover | null;
  onEngineAction?: EngineActionHandler;
  onEngineLoadMore?: EnginePageLoader;
  /**
   * False on a live surface: the sample-data badge and the developer controls
   * describe fixture data and must not appear over real reads.
   */
  showPreviewChrome?: boolean;
  accountsState: RequestState<OfAccount[]>;
  activeAccount: OfAccount | null;
  activeAccountId: string | null;
  onSelectAccount: (accountId: string) => void;
  conversations: RequestState<CursorPage<ConversationSummary>>;
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  detailState: RequestState<ConversationDetail> | null;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
  viewer: PreviewViewer;
  onCommand: (action: AvailableAction, payload: CommandPayload) => void;
  commandResult: CommandResult | null;
  commandPending?: boolean;
  pendingAction?: string | null;
  drafts?: Map<string, { text: string; item: string }>;
  onSearchChange?: (query: string) => void;
  onRetryCommand?: () => void;
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
  aiOnly?: boolean;
  onAiFilterChange?: (enabled: boolean) => void;
  inboxSearch?: InboxSearch;
  onInboxSearchChange?: (search: InboxSearch) => void;
}) {
  const [mobilePanel, setMobilePanel] = useState<"conversations" | "chat" | "controls">("conversations");
  // The fan panel is a third column only where there is room for it (1280px+).
  // Narrower desktops start with it closed and can open it; closing it never
  // touches the selected conversation, which lives outside this component.
  const [profileOpen, setProfileOpen] = useState(true);
  useEffect(() => { if (typeof window.matchMedia === "function" && window.matchMedia("(max-width: 1279px)").matches) setProfileOpen(false); }, []);
  // Below lg the fan info tab opens as a sheet over the chat. The chat, its draft and
  // its scroll stay mounted underneath, so closing the sheet loses nothing.
  const [narrow, setNarrow] = useState(false);
  const sheetClose = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(max-width: 1023px)");
    const sync = () => setNarrow(query.matches);
    sync(); query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const sheetOpen = narrow && mobilePanel === "controls";
  // The Reply control (Pause, Stop further contact, hold copy) renders once: in the fan panel or sheet while that shows,
  // otherwise in the chat column under the thread, so a brake is displayed whenever Send is (G09).
  const panelShowsReplyControl = narrow ? sheetOpen : profileOpen;
  useEffect(() => {
    if (!sheetOpen) return;
    sheetClose.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMobilePanel("chat"); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);
  const {setIdentity}=useInboxIdentity();
  const creatorId=activeAccount?.binding.creatorId, creatorName=activeAccount?.binding.creatorName, creatorHandle=activeAccount?.binding.handle;
  useEffect(()=>{ setIdentity(creatorId && creatorName && creatorHandle ? {creatorId,creatorName,handle:creatorHandle} : null); return ()=>setIdentity(null); },[creatorId,creatorName,creatorHandle,setIdentity]);
  const accounts =
    accountsState.status === "ready" || accountsState.status === "stale" ? accountsState.data : [];

  const detail =
    detailState && (detailState.status === "ready" || detailState.status === "stale")
      ? detailState.data
      : null;

  const actionSet =
    activeAccount && detail
      ? availableActions({
          account: activeAccount,
          summary: detail.summary,
          viewer,
          deliveryIncident: detail.deliveryIncident,
        })
      : null;

  const connectionReason =
    activeAccount && activeAccount.health !== "connected" ? activeAccount.healthReason : null;
  const syncNotice = inboxSyncNotice(activeAccount,
    conversations.status === "stale" ? conversations.freshness : null,
    detailState?.status === "stale" ? detailState.freshness : null);

  const replyControl = activeAccount && detail && actionSet ? (
    <section className="of-reply-control" aria-label="Reply control"><h2 className="of-section-heading">Reply control</h2>
    {detail.summary.automationMode === "automated" ? <p className="of-reply-status" role="status">{effectiveAiStatus(detail.summary, activeAccount)}</p> : null}
    {handover ?? <p className="of-reply-status" role="status">{detail.summary.takeoverState === "requested" ? "Takeover pending" : detail.summary.automationMode === "automated" ? "AI replies enabled" : detail.summary.automationMode === "human_controlled" ? "Manual control" : detail.summary.automationMode === "no_contact" ? "Further contact stopped" : "AI replies paused"}</p>}
    <ActionColumn
      engineAware={parseEngineStatus(detail.engineStatus, detail.accountId, detail.conversationId)?.state === "current"}
      actionSet={actionSet}
      viewer={viewer}
      result={commandResult}
      pending={commandPending}
      pendingAction={pendingAction}
      onRetry={onRetryCommand}
      incident={detail.deliveryIncident}
      onCommand={onCommand}
      onResolve={(attemptId, decision, providerMessageId) =>
        onCommand("resolve_delivery_evidence", {
          kind: "delivery_resolution",
          providerMessageId,
          attemptId,
          decision,
        })
      }
    />
    </section>
  ) : null;

  return (
    <div className={`${styles.workspace} users-workspace lg:h-full`} data-of-surface="onlyfans-inbox">
      <header className="of-inbox-heading">
        <h1>OnlyFans inbox</h1>
        <div className="of-account-switcher">
          <RequestStateBlock showStaleWarning={false} state={accountsState} label="account scope"
            render={(list) => <AccountChips accounts={list} activeAccountId={activeAccountId} onSelectAccount={onSelectAccount} />} />
          <a href="/onlyfans/accounts" className="of-manage-accounts">Manage accounts <ArrowUpRight size={14} aria-hidden="true" /></a>
        </div>
      </header>
      {syncNotice ? <div className="of-sync-notice" role="status" data-of-sync-warning><AlertTriangle size={16} aria-hidden="true" /><span className="of-sync-copy"><strong>{syncNotice.title}</strong> {syncNotice.detail}{syncNotice.asOf ? <> Last complete sync: <time dateTime={syncNotice.asOf}>{formatAge(syncNotice.asOf)}</time>.</> : null}</span><a href={syncNotice.href}>View account status <ArrowUpRight size={13} aria-hidden="true" /></a></div> : null}
      {!viewer.canManage && !viewer.canChat ? (
        <div
          data-of-readonly
          className="mb-3 rounded-xl border border-[#dce8fb] bg-[#edf3fc] p-3 text-xs leading-5 text-[#2f6fed]"
        >
          Read-only access. You can review assigned accounts and conversations. A team manager handles changes and replies.
        </div>
      ) : null}

      {showPreviewChrome ? <PreviewNotice controls={controls} /> : null}
      {accountControls}

      <nav aria-label="Inbox panels" className="of-panel-switch relative z-[41] mb-3 grid grid-cols-3 gap-1 rounded-xl border border-line bg-panel p-1 lg:hidden">
        {([ ["conversations", "Conversations"], ["chat", "Chat"], ["controls", "Fan info"] ] as const).map(([key, label]) =>
          <button key={key} type="button" data-of-mobile-panel={key} aria-pressed={mobilePanel === key}
            onClick={() => setMobilePanel(key)} disabled={key !== "conversations" && !selectedConversationId}
            className={`rounded-lg px-1 py-2 text-xs font-semibold disabled:opacity-40 ${mobilePanel === key ? "bg-accent/10 text-accent-deep" : "text-muted"}`}>{label}</button>)}
      </nav>
      <div className="of-layout" data-of-inbox-layout data-profile={profileOpen ? "open" : "closed"}>
        <Card size="sm" className={`users-panel users-panel-list h-[min(34rem,65dvh)] flex-col overflow-hidden p-0 lg:h-full ${mobilePanel === "conversations" ? "flex" : "hidden lg:flex"}`}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ConversationList
              conversations={conversations}
              account={activeAccount}
              selectedConversationId={selectedConversationId}
              onSelectConversation={id => { onSelectConversation(id); setMobilePanel("chat"); }}
              nextCursor={nextCursor}
              loadingMore={loadingMore}
              onLoadMore={onLoadMore}
              aiOnly={aiOnly}
              onAiFilterChange={onAiFilterChange}
              inboxSearch={inboxSearch}
              onInboxSearchChange={onInboxSearchChange}
            />
          </div>
        </Card>

        <Card size="sm" className={`users-panel users-panel-chat h-[min(42rem,75dvh)] flex-col overflow-hidden p-0 lg:h-full ${mobilePanel !== "conversations" ? "flex" : "hidden lg:flex"}`}>
          {!activeAccount || !detail ? (
            <div className="flex flex-1 items-center justify-center gap-2 p-6 text-sm text-muted">
              {detailState ? <RequestStateBlock state={detailState} label="conversation" render={() => null} /> : <><MessageCircle className="size-4" />Select a conversation to read it.</>}
            </div>
          ) : (
            <>
              <div className="of-chat-header flex items-center gap-2.5 border-b border-line px-3.5 py-2.5">
                <OnlyFansAvatar
                  name={fanName(detail.summary.fan)}
                  avatarUrl={detail.summary.fan.avatarUrl}
                  className="h-9 w-9 text-[11px]"
                />
                <div className="min-w-[7rem] flex-1">
                  <div className="truncate text-sm font-semibold text-ink">
                    {fanName(detail.summary.fan)}
                  </div>
                  <div className="truncate text-[11px] text-muted">
                    <span className="creator-name">{activeAccount.binding.creatorName}</span> · @{activeAccount.binding.handle}
                  </div>
                </div>
                <span className="of-chat-badges"><OwnershipBadges conversation={detail.summary} account={activeAccount} handover={handoverHistory} /></span>
                <button type="button" data-of-profile-toggle aria-expanded={profileOpen} onClick={() => setProfileOpen(open => !open)}
                  className="hidden min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-semibold text-muted hover:text-ink lg:inline-flex">
                  <UserRound className="size-3.5" aria-hidden="true" />{profileOpen ? "Hide fan details" : "Fan details"}</button>
              </div>

              <Thread detail={detail} principal={draftPrincipal} handoverHistory={handoverHistory} loadingOlder={loadingOlder} onLoadOlder={onLoadOlder} />

              {!panelShowsReplyControl && replyControl ? <div className="of-chat-reply-control max-h-[40%] shrink-0 overflow-y-auto border-t border-line p-2" data-of-chat-reply-control>{replyControl}</div> : null}
              {actionSet ? (
                <Composer
                  key={draftKey(draftPrincipal, activeAccount.accountId, detail.conversationId)}
                  draftId={draftKey(draftPrincipal, activeAccount.accountId, detail.conversationId)}
                  actionSet={actionSet}
                  viewer={viewer}
                  account={activeAccount}
                  detail={detail}
                  onTakeover={() => onCommand("request_takeover", NO_PAYLOAD)}
                  onSubmit={(body, catalogItemId, media) => onCommand("send_manual_message", { kind: "manual_message", body,
                    ...(catalogItemId === undefined ? {} : { catalogItemId }), ...(media ? { media } : {}) })}
                  disabledReason={connectionReason ?? (!commandResult?.simulated && commandResult?.outcome === "unconfirmed"
                    ? "Resolve the previous request outcome or retry that same request before composing another." : null)}
                  simulated={showPreviewChrome}
                  pending={commandPending}
                  pendingAction={pendingAction}
                  result={commandResult}
                />
              ) : null}
            </>
          )}
        </Card>

        {sheetOpen ? <button type="button" className="of-sheet-backdrop" tabIndex={-1} aria-label="Close fan info" onClick={() => setMobilePanel("chat")} /> : null}
        <Card size="sm" data-sheet={mobilePanel === "controls" ? "open" : "closed"} role={sheetOpen ? "dialog" : undefined} aria-modal={sheetOpen ? true : undefined} aria-label={sheetOpen ? "Fan info" : undefined}
          className={`users-panel users-panel-profile overflow-y-auto p-4 lg:h-full ${mobilePanel === "controls" ? "block" : "hidden"} ${profileOpen ? "lg:block" : "lg:hidden"}`}>
          <div className="of-sheet-bar lg:hidden"><strong>Fan info</strong><button type="button" ref={sheetClose} data-of-sheet-close onClick={() => setMobilePanel("chat")}>Close</button></div>
          {!activeAccount || !detail || !actionSet ? (
            <div className="flex h-full items-center justify-center text-center text-xs text-muted">
              Pick a conversation to see the fan and the controls.
            </div>
          ) : (
            <div className="of-fan-sidebar flex min-w-0 flex-col gap-5">
              <h2 className="of-section-heading">Fan profile</h2>
              <div className="of-profile-identity flex min-w-0 items-center gap-3">
                <OnlyFansAvatar
                  name={fanName(detail.summary.fan)}
                  avatarUrl={detail.summary.fan.avatarUrl}
                  className="h-11 w-11 text-xs"
                />
                <div className="min-w-0">
                  <div className="truncate font-semibold text-ink">
                    {fanName(detail.summary.fan)}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span>{detail.summary.fan.username ? `@${detail.summary.fan.username} · ` : ""}Ref {detail.summary.fan.shortRef}</span>
                  </div>
                </div>
              </div>

              <FanRelationship detail={detail} />
              {panelShowsReplyControl ? replyControl : null}

              <EngineStatus key={detail.conversationId} value={detail.engineStatus} accountId={detail.accountId} conversationId={detail.conversationId} onAction={onEngineAction} onLoadMore={onEngineLoadMore}
                onTakeover={canSubmitCommand(viewer, actionSet, "request_takeover") ? () => onCommand("request_takeover", NO_PAYLOAD) : undefined} takeoverPending={commandPending} />
              <FanContext detail={detail} />
              <FanMetrics detail={detail} />
              {!showPreviewChrome ? <FanMemory key={`${activeAccount.accountId}:${detail.summary.fan.fanId}`} accountId={activeAccount.accountId} fanId={detail.summary.fan.fanId} canCorrect={viewer.canManage || viewer.canChat === true} /> : null}
              <details open={!!detail.deliveryIncident}><summary className="text-sm font-semibold">Delivery history</summary><DeliveryLedger messages={detail.messages} /></details>
              <FanHistory key={`h:${activeAccount.accountId}:${detail.summary.fan.fanId}`} detail={detail} accountId={activeAccount.accountId} canCorrect={viewer.canManage || viewer.canChat === true} showMemory={!showPreviewChrome} />
            </div>
          )}
        </Card>
      </div>


    </div>
  );
}


