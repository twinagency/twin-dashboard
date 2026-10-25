"use client";

// The OnlyFans inbox. Presentation refresh; backend command and ownership gates remain authoritative.
//
// The fan profile and reply controls stay visible on desktop. The existing
// capability, ownership and delivery gates decide which commands can be used.
// Compact rendering changes presentation only; stale reads remain visible.

import { FormEvent, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowUpRight, Check, ImagePlus, MessageCircle, Pause, Search, Send, Sparkles, UserRound } from "lucide-react";
import styles from "./InboxView.module.css";
import CreatorPortrait from "./CreatorPortrait";
import { useInboxIdentity } from "./InboxIdentity";
import { Card } from "@/components/ui/card";
import FanAvatar from "@/components/FanAvatar";
import { MAX_MANUAL_MESSAGE_LENGTH, availableActions, canSubmitCommand } from "@/lib/onlyfans-preview/actions";
import type { ActionSet } from "@/lib/onlyfans-preview/actions";
import { formatAge, formatPreviewTime } from "@/lib/onlyfans-preview/fixtures";
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
  PreviewViewer,
  RequestState,
  CommandResult,
} from "@/lib/onlyfans-preview/types";
import { NO_PAYLOAD } from "@/lib/onlyfans-preview/types";
import {
  DeliveryPill,
  SimulatedTag,
  TakeoverPill,
  formatMoney,
} from "./labels";
import { FreshnessLine } from "./PreviewChrome";
import PreviewNotice from "./PreviewNotice";
import { RequestStateBlock } from "./RequestStateBlock";
import { parseWorkspace, formatRecordedMoney, type CatalogRead } from "@/lib/onlyfans/workspace";

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
        <span className="creator-name"><CreatorPortrait creatorId={account.binding.creatorId} name={account.binding.creatorName} /></span>
        <span className="of-account-copy"><strong className="creator-name">{account.binding.creatorName}</strong><small>@{account.binding.handle}</small></span>
        <span className="of-health" data-health={account.health} aria-label={account.health} title={account.healthReason ?? account.health} />
      </button>)}
    </div>
  );
}

function ConversationList({
  conversations,
  selectedConversationId,
  onSelectConversation,
  nextCursor,
  loadingMore,
  onLoadMore,
}: {
  conversations: RequestState<CursorPage<ConversationSummary>>;
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "attention">("all");
  const matches = (conversation: ConversationSummary) =>
    (!query.trim() || `${conversation.fan.displayName} ${conversation.fan.shortRef} ${conversation.lastMessagePreview}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) &&
    (filter === "all" || (filter === "unread" ? conversation.unreadCount > 0 : conversation.requiresAttention));
  return (
    <div className="of-list-content">
    <div className="of-list-heading"><h1>Inbox</h1></div>
    <label className="of-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search loaded conversations</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search conversations" /></label>
    <div className="of-filters" aria-label="Filter loaded conversations">{([ ["all", "All"], ["unread", "Unread"], ["attention", "Needs reply"] ] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div>
    {(query || filter !== "all") && nextCursor ? <p className="of-filter-note">Filtering loaded conversations. Load more to search further.</p> : null}
    <RequestStateBlock
      showStaleWarning={false}
      state={conversations}
      label="conversations"
      render={(page) =>
        page.items.length === 0 && !nextCursor ? (
          <div className="px-3.5 py-6 text-xs leading-5 text-muted">
            No conversations in scope for this account.
          </div>
        ) : (
          <div data-of-conversation-list>
            {page.items.length > 0 && !page.items.some(matches) ? <p className="of-filter-note px-4 py-6" role="status">No matching conversations in the loaded results.</p> : null}
            <div className="divide-y divide-line/80">
              {page.items.filter(matches).map((conversation) => {
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
                    <FanAvatar
                      cloneId=""
                      telegramId={null}
                      name={conversation.fan.displayName}
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
                            {conversation.priority === "normal" ? "Needs reply" : priority.label}
                          </span>
                        ) : null}
                        {["failed", "partial", "unknown", "refused"].includes(conversation.delivery) ? <DeliveryPill outcome={conversation.delivery} /> : null}
                        {conversation.unreadCount > 0 ? <span className="of-unread" aria-label={`${conversation.unreadCount} unread messages`}>{conversation.unreadCount}</span> : null}
                        <TakeoverPill state={conversation.takeoverState} />
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
function Thread({ detail }: { detail: ConversationDetail }) {
  const lastIndex = detail.messages.length - 1;
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Open on the newest message, the way the Telegram thread does: a bottom-anchored
  // run inside a scroll box that starts at the top would otherwise show nothing but
  // wallpaper when the operator switches to a fan.
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [detail.conversationId, detail.messages.length]);

  return (
    <div
      ref={scrollRef}
      className="tg-thread min-h-[16rem] flex-1 overflow-y-auto px-3 py-3"
      data-of-thread
    >
      {/* A short thread sits at the bottom of the panel, the way a chat does,
          instead of leaving the wallpaper dangling under three bubbles. */}
      <div className="flex min-h-full flex-col justify-start">
      {detail.messages.length === 0 ? (
        <div className="mx-auto w-fit rounded-full bg-black/25 px-3 py-1 text-[11px] font-medium text-white">
          No messages in this view
        </div>
      ) : (
        detail.messages.map((message, index) => {
          const inbound = message.direction === "inbound";
          const previous = detail.messages[index - 1];
          const next = detail.messages[index + 1];
          const startsRun = index === 0 || previous.direction !== message.direction;
          const endsRun = index === lastIndex || next.direction !== message.direction;
          return (
            <div key={message.messageId}>
              {index === 0 || new Date(previous.occurredAt).toDateString() !== new Date(message.occurredAt).toDateString() ? <div className="of-message-day">{new Date(message.occurredAt).toLocaleDateString(undefined, {day:"numeric",month:"short",year:"numeric"})}</div> : null}

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
                    <span className="whitespace-pre-wrap">{message.body}</span>
                    <span className="tg-meta">{formatPreviewTime(message.occurredAt)}</span>
                  </div>
                  {!inbound ? (
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
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
  );
}

function Composer({
  actionSet,
  viewer,
  account,
  onSubmit,
  disabledReason,
  simulated,
  pending,
  result,
}: {
  actionSet: ActionSet;
  viewer: PreviewViewer;
  account: OfAccount;
  onSubmit: (body: string, catalogItemId?: number) => void;
  disabledReason: string | null;
  simulated: boolean;
  pending: boolean;
  result: CommandResult | null;
}) {
  const [text, setText] = useState("");
  const [catalogue, setCatalogue] = useState<CatalogRead["items"]>([]), [catalogItemId, setCatalogItemId] = useState("");
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
  const canSend = canSubmitCommand(viewer, actionSet, "send_manual_message") && !disabledReason && !pending;
  const sendBlockedReason = disabledReason ?? actionSet.blocked.find(entry => entry.action === "send_manual_message")?.reason;
  useEffect(() => {
    if (result && !result.simulated && result.outcome === "recorded" && result.intentId &&
        result.request.payload.kind === "manual_message") { setText(""); setCatalogItemId(""); }
  }, [result]);
  const bodyProblem =
    text.trim().length === 0
      ? null
      : new TextEncoder().encode(text).length > MAX_MANUAL_MESSAGE_LENGTH
        ? `Longer than the ${MAX_MANUAL_MESSAGE_LENGTH} byte limit.`
        : null;
  const submittable = canSend && bodyProblem === null && !!text.trim();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!submittable) return;
    onSubmit(text, catalogItemId ? Number(catalogItemId) : undefined);
  }

  return (
    <div className="of-composer border-t border-line p-3">
      <form onSubmit={handleSubmit} className="space-y-2">
        {!simulated && account.capabilities.sendManualMessage === "available" ? <details className="of-paid-content" open={catalogItemId ? true : undefined}><summary><ImagePlus size={15} aria-hidden="true" />{catalogItemId ? "Paid content selected" : "Attach paid content"}</summary><div className="space-y-1">
          <label className="block text-[11px] font-medium text-muted">Paid content
            <select data-of-manual-offer value={catalogItemId} onChange={event => setCatalogItemId(event.target.value)} disabled={!canSend}
              className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ink disabled:bg-elev disabled:text-muted">
              <option value="">Text reply only</option>
              {catalogue.filter(item => item.readiness === "terms_checked" && item.priceCents !== null && item.priceCents >= 300 && item.priceCents <= 20000 && /^[1-9][0-9]*$/.test(item.itemId) && Number(item.itemId) < 2 ** 31).map(item => <option key={item.itemId} value={item.itemId}>{item.label} · {formatRecordedMoney(item.priceCents!, item.currency)}</option>)}
            </select>
          </label>
          {catalogueError ? <p className="text-[11px] text-muted" role="status">{catalogueError}</p> : null}
          {catalogueCursor || catalogueError ? <button type="button" className="text-[11px] font-semibold text-accent disabled:text-muted" disabled={!canSend || catalogueBusy} onClick={() => void loadCatalogue(catalogueCursor)}>{catalogueBusy ? "Loading…" : catalogueCursor ? "Load more saved content" : "Retry saved content"}</button> : null}
          {catalogItemId ? <p className="text-[11px] text-muted">This reply will include the saved item at its catalogue price and previews.</p> : null}
        </div></details> : null}
        <div className="of-input flex items-start gap-3 rounded-xl border border-line bg-white px-3 py-2.5">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Manual message</span>
            <textarea
              data-of-composer
              value={text}
              onChange={(event) => setText(event.target.value)}
              disabled={!canSend}
              rows={1}
              placeholder={canSend ? "Write a reply as the creator…" : pending ? "Submitting…"
                : sendBlockedReason === "Take over this conversation before sending a manual reply."
                  ? "Take over to reply" : "Reply unavailable — see reason below"}
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
            <Send className="size-3.5" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
          {simulated ? <SimulatedTag /> : null}
          <span>
            {disabledReason ??
              bodyProblem ??
              (simulated ? `Nothing is sent. @${account.binding.handle} is a fixture, and this preview has no delivery authority.`
                : actionSet.blocked.find(entry => entry.action === "send_manual_message")?.reason ??
                  null)}
          </span>
        </div>
      </form>
    </div>
  );
}

const RESOLUTION_OPTIONS: { value: DeliveryResolutionDecision; label: string }[] = [
  { value: "delivered", label: "The evidence shows it was delivered" },
  { value: "not_delivered", label: "The evidence shows it was not delivered" },
];

function ActionColumn({
  actionSet,
  viewer,
  result,
  incident,
  onCommand,
  onResolve,
  pending,
  onRetry,
}: {
  actionSet: ActionSet;
  viewer: PreviewViewer;
  result: CommandResult | null;
  pending: boolean;
  onRetry: () => void;
  incident: ConversationDetail["deliveryIncident"];
  onCommand: (action: AvailableAction, payload: CommandPayload) => void;
  onResolve: (attemptId: string, decision: DeliveryResolutionDecision) => void;
}) {
  // What the operator read in the provider's evidence. The resolution command
  // carries it, so a decision cannot be submitted without one being made.
  const [decision, setDecision] = useState<DeliveryResolutionDecision | null>(null);

  return (
    <div className="flex flex-col gap-5">
      {incident ? (
        <div data-of-incident className="rounded-xl border border-[#f0c3cb] bg-[#fff5f6] p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#9b2f62]">
            <AlertTriangle className="size-4" />
            Delivery needs resolving
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
              {RESOLUTION_OPTIONS.map((option) => (
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

      <div className="of-reply-actions" data-of-actions>
        {actionSet.available.filter(entry => !["send_manual_message", "mark_no_contact"].includes(entry.action)).map(entry => {
          const resolution = entry.action === "resolve_delivery_evidence";
          const needsDecision = resolution && decision === null;
          const primary = resolution || ["request_takeover", "release_takeover", "resume_automation"].includes(entry.action);
          const label = entry.action === "pause_automation" ? "Pause AI" : entry.action === "resume_automation" ? "Resume AI" : entry.action === "release_takeover" ? "Hand back to AI" : entry.label;
          const Icon = entry.action === "request_takeover" ? UserRound : entry.action === "pause_automation" ? Pause : Sparkles;
          return <div key={entry.action}><button type="button" data-of-action={entry.action} disabled={needsDecision || pending}
            title={needsDecision ? "Choose what the evidence shows first." : undefined}
            onClick={() => resolution ? incident && decision && onResolve(incident.attemptId, decision) : onCommand(entry.action, NO_PAYLOAD)}
            className={`of-control-button ${primary ? "of-primary" : "of-secondary"}`}><Icon size={16} aria-hidden="true" />{pending ? "Saving…" : label}</button>
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

      {result ? (
        <div
          data-of-command-result
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


    </div>
  );
}

function FanMetrics({detail}: {detail:ConversationDetail}) {
  const currencies=Array.from(new Set(detail.ownedMedia.map(item=>item.price.currency)));
  return <div className="of-fan-metrics">
    <div><strong>{currencies.length ? currencies.map(currency=>formatMoney({currency,minorUnits:detail.ownedMedia.filter(item=>item.price.currency===currency).reduce((total,item)=>total+item.price.minorUnits,0)})).join(" · ") : "—"}</strong><span>Recorded spend</span></div>
    <div><strong>{detail.ownedMedia.length}</strong><span>Recorded purchases</span></div>
  </div>;
}
function FanContext({detail}:{detail:ConversationDetail}) {
  const notes=detail.facts.filter(fact=>/^(notes?|conversation notes?)$/i.test(fact.label.trim()));
  const facts=detail.facts.filter(fact=>!notes.includes(fact) && !(/^display name$/i.test(fact.label) && fact.value===fanName(detail.summary.fan)));
  return <div className="of-fan-context">
    <section><h3 className="of-section-heading">Saved facts</h3>
      {facts.length ? <ul className="of-fact-list">{facts.map(item=><li key={item.label+item.value} title={"Source: "+item.source}><span>{item.label}</span><p>{item.value}</p></li>)}</ul> : <p className="of-empty-context">Nothing saved yet.</p>}
    </section>
    <section><h3 className="of-section-heading">Notes</h3><div className="of-note">{notes.length ? notes.map(item=><p key={item.label+item.value}>{item.value}</p>) : <p className="of-empty-context">No notes available.</p>}</div></section>
    <section><h3 className="of-section-heading">Recent purchases</h3>
      {detail.ownedMedia.length ? <ul className="of-purchases">{detail.ownedMedia.map(item=><li key={item.mediaId}>
        <span className="of-purchase-icon" aria-hidden="true"><ImagePlus size={21}/></span>
        <div><strong>{item.label}</strong><small>{formatAge(item.purchasedAt)}</small></div><span>{formatMoney(item.price)}</span>
      </li>)}</ul> : <p className="of-empty-context">No purchases recorded in this view.</p>}
    </section>
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
              <div className="mt-0.5 truncate text-xs text-ink">{message.body}</div>
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
  controls,
  accountsState,
  activeAccount,
  activeAccountId,
  onSelectAccount,
  conversations,
  selectedConversationId,
  onSelectConversation,
  detailState,
  viewer,
  onCommand,
  commandResult,
  commandPending = false,
  onRetryCommand = () => {},
  nextCursor,
  loadingMore,
  onLoadMore,
  showPreviewChrome = true,
  handover,
}: {
  controls?: ReactNode;
  handover?: ReactNode;
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
  viewer: PreviewViewer;
  onCommand: (action: AvailableAction, payload: CommandPayload) => void;
  commandResult: CommandResult | null;
  commandPending?: boolean;
  onRetryCommand?: () => void;
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const [mobilePanel, setMobilePanel] = useState<"conversations" | "chat" | "controls">("conversations");
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

  return (
    <div className={`${styles.workspace} users-workspace lg:h-full`} data-of-surface="onlyfans-inbox">
      <aside className="of-creator-rail" aria-label="Creator accounts">          <RequestStateBlock
            showStaleWarning={false}
            state={accountsState}
            label="account scope"
            render={(list) => (
              <AccountChips accounts={list} activeAccountId={activeAccountId} onSelectAccount={onSelectAccount} />
            )}
          />
<a href="/onlyfans/accounts" className="of-add-account" aria-label="Add or manage creator accounts">+</a><a href="/onlyfans/settings" className="of-rail-settings" aria-label="OnlyFans settings"><Sparkles size={18}/></a></aside>
      {[accountsState.status, conversations.status, detailState?.status].includes("stale") ? <div className="of-sync-notice" role="status" data-of-sync-warning><AlertTriangle size={16} aria-hidden="true" /><span><strong>Sync needs attention.</strong> Newer activity may be missing.</span><a href="/onlyfans/accounts">Check connection <ArrowUpRight size={13} aria-hidden="true" /></a></div> : null}
      {!viewer.canManage ? (
        <div
          data-of-readonly
          className="mb-3 rounded-xl border border-[#dce8fb] bg-[#edf3fc] p-3 text-xs leading-5 text-[#2f6fed]"
        >
          Read-only access. You can review assigned accounts and conversations. A team manager handles changes and replies.
        </div>
      ) : null}

      {showPreviewChrome ? <PreviewNotice controls={controls} /> : null}

      <nav aria-label="Inbox panels" className="mb-3 grid grid-cols-3 gap-1 rounded-xl border border-line bg-panel p-1 lg:hidden">
        {([ ["conversations", "Conversations"], ["chat", "Chat"], ["controls", "Fan info"] ] as const).map(([key, label]) =>
          <button key={key} type="button" data-of-mobile-panel={key} aria-pressed={mobilePanel === key}
            onClick={() => setMobilePanel(key)} disabled={key !== "conversations" && !selectedConversationId}
            className={`rounded-lg px-1 py-2 text-xs font-semibold disabled:opacity-40 ${mobilePanel === key ? "bg-ink text-white" : "text-muted"}`}>{label}</button>)}
      </nav>
      <div className="of-layout" data-of-inbox-layout>
        <Card size="sm" className={`users-panel users-panel-list h-[min(34rem,65dvh)] flex-col overflow-hidden p-0 lg:h-full ${mobilePanel === "conversations" ? "flex" : "hidden lg:flex"}`}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ConversationList
              conversations={conversations}
              selectedConversationId={selectedConversationId}
              onSelectConversation={id => { onSelectConversation(id); setMobilePanel("chat"); }}
              nextCursor={nextCursor}
              loadingMore={loadingMore}
              onLoadMore={onLoadMore}
            />
          </div>
        </Card>

        <Card size="sm" className={`users-panel users-panel-chat h-[min(42rem,75dvh)] flex-col overflow-hidden p-0 lg:h-full ${mobilePanel === "chat" ? "flex" : "hidden lg:flex"}`}>
          {!activeAccount || !detail ? (
            <div className="flex flex-1 items-center justify-center gap-2 p-6 text-sm text-muted">
              {detailState ? <RequestStateBlock state={detailState} label="conversation" render={() => null} /> : <><MessageCircle className="size-4" />Select a conversation to read it.</>}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5">
                <FanAvatar
                  cloneId=""
                  telegramId={null}
                  name={fanName(detail.summary.fan)}
                  className="h-9 w-9 text-[11px]"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">
                    {fanName(detail.summary.fan)}
                  </div>
                  <div className="truncate text-[11px] text-muted">
                    <span className="creator-name">{activeAccount.binding.creatorName}</span> · @{activeAccount.binding.handle}
                  </div>
                </div>

              </div>

              <Thread detail={detail} />

              {actionSet ? (
                <Composer
                  key={detail.conversationId}
                  actionSet={actionSet}
                  viewer={viewer}
                  account={activeAccount}
                  onSubmit={(body, catalogItemId) => onCommand("send_manual_message", { kind: "manual_message", body,
                    ...(catalogItemId === undefined ? {} : { catalogItemId }) })}
                  disabledReason={connectionReason ?? (!commandResult?.simulated && commandResult?.outcome === "unconfirmed"
                    ? "Resolve the previous request outcome or retry that same request before composing another." : null)}
                  simulated={showPreviewChrome}
                  pending={commandPending}
                  result={commandResult}
                />
              ) : null}
            </>
          )}
        </Card>

        <Card size="sm" className={`users-panel users-panel-profile overflow-y-auto p-4 lg:h-full ${mobilePanel === "controls" ? "block" : "hidden lg:block"}`}>
          {!activeAccount || !detail || !actionSet ? (
            <div className="flex h-full items-center justify-center text-center text-xs text-muted">
              Pick a conversation to see the fan and the controls.
            </div>
          ) : (
            <div className="of-fan-sidebar flex flex-col gap-5">
              <h2 className="of-section-heading">Fan profile</h2>
              <div className="of-profile-identity flex items-center gap-3">
                <FanAvatar
                  cloneId=""
                  telegramId={null}
                  name={fanName(detail.summary.fan)}
                  className="h-11 w-11 text-xs"
                />
                <div className="min-w-0">
                  <div className="truncate font-semibold text-ink">
                    {fanName(detail.summary.fan)}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span>Ref {detail.summary.fan.shortRef}</span>
                  </div>
                </div>
              </div>

              <FanMetrics detail={detail} />
              <section className="of-reply-control" aria-label="Reply control"><h2 className="of-section-heading">Reply control</h2>
              {handover ?? <p className="of-reply-status" role="status">{detail.summary.takeoverState === "requested" ? "Takeover pending" : detail.summary.automationMode === "automated" ? "AI replies enabled" : detail.summary.automationMode === "human_controlled" ? "Manual control" : detail.summary.automationMode === "no_contact" ? "Further contact stopped" : "AI replies paused"}</p>}
              <ActionColumn
                actionSet={actionSet}
                viewer={viewer}
                result={commandResult}
                pending={commandPending}
                onRetry={onRetryCommand}
                incident={detail.deliveryIncident}
                onCommand={onCommand}
                onResolve={(attemptId, decision) =>
                  onCommand("resolve_delivery_evidence", {
                    kind: "delivery_resolution",
                    attemptId,
                    decision,
                  })
                }
              />
              </section>

              <FanContext detail={detail} />
              <details open={!!detail.deliveryIncident}><summary className="text-sm font-semibold">Delivery history</summary><DeliveryLedger messages={detail.messages} /></details>

              <div className="border-t border-line pt-3">
                <details className="of-freshness"><summary>Sync details</summary><FreshnessLine freshness={detail.freshness} /></details>
              </div>
            </div>
          )}
        </Card>
      </div>


    </div>
  );
}
