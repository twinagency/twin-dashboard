"use client";

// The OnlyFans inbox.
//
// The composition, the panels and the bubbles are the dashboard's own. The grid
// is the Fans screen's three-column `users-panel` layout, the bubbles use the
// same `tg-bubble` classes the Telegram thread renders with, and the page header
// is the standard `dashboard-page` + `h1 text-2xl font-semibold` block. This is
// the OnlyFans channel inside the existing product, not a second inbox design.
//
// Two things are deliberately unlike the Telegram thread, both for the same
// reason — an OnlyFans fan is not a Telegram fan:
//
//   * every outbound bubble carries its own receipt here, because a turn is
//     several actions and one of them can land while the next does not. The
//     shared ChatThread footer totals Telegram **Stars**, and OnlyFans money is
//     not Stars, so its thread component is not reused: the styling is, the
//     Stars-shaped content is not.
//   * the control column renders the actions the backend actually admits and
//     says why each unavailable one is unavailable. An unresolved send offers an
//     evidence path and never a resend.

import { FormEvent, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, MessageCircle, Send, Sparkles } from "lucide-react";
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
  HealthPill,
  ModePill,
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
    <div className="flex flex-wrap gap-1.5 border-b border-line px-3.5 py-2.5">
      {accounts.map((account) => {
        const selected = account.accountId === activeAccountId;
        return (
          <button
            key={account.accountId}
            type="button"
            data-of-account-chip={account.accountId}
            aria-pressed={selected}
            onClick={() => onSelectAccount(account.accountId)}
            title={`@${account.binding.handle}`}
            className={`flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
              selected
                ? "border-accent-2/40 bg-accent-2/[0.06] text-ink"
                : "border-line bg-white text-muted hover:bg-elev/70 hover:text-ink"
            }`}
          >
            <span className="min-w-0 truncate">@{account.binding.handle}</span>
            <HealthPill health={account.health} />
          </button>
        );
      })}
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
  return (
    <RequestStateBlock
      state={conversations}
      label="conversations"
      render={(page) =>
        page.items.length === 0 && !nextCursor ? (
          <div className="px-3.5 py-6 text-xs leading-5 text-muted">
            No conversations in scope for this account.
          </div>
        ) : (
          <div data-of-conversation-list>
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
                    className={`flex w-full gap-3 px-3.5 py-3 text-left transition ${
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
                          {conversation.fan.displayName}
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
                            {priority.label}
                          </span>
                        ) : null}
                        <DeliveryPill outcome={conversation.delivery} />
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
  );
}

/**
 * The thread. Same bubble classes as the Telegram Fans thread (`tg-bubble`,
 * `tg-bubble-in/out`, run tails, the day rule) so the two channels read as one
 * product, with the OnlyFans receipt attached under each outbound bubble.
 */
function Thread({ detail }: { detail: ConversationDetail }) {
  const lastIndex = detail.messages.length - 1;
  const outbound = detail.messages.filter((message) => message.direction === "outbound");
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
      <div className="flex min-h-full flex-col justify-end">
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
              {index === lastIndex && detail.messages.length > 1 ? (
                <div className="tg-newline my-2 -mx-3">
                  <span className="h-px flex-1 bg-white/40" />
                  latest message
                  <span className="h-px flex-1 bg-white/40" />
                </div>
              ) : null}
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
                      <DeliveryPill outcome={message.delivery} />
                      {message.evidenceRef ? (
                        <span title={`Delivery receipt: ${message.evidenceRef}`} className="text-[10px] text-white/90">Receipt recorded</span>
                      ) : null}
                      <span className="text-[10px] text-white/90">from {ORIGIN_LABEL[message.origin]}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })
      )}

      {outbound.length > 0 ? (
        <div className="mt-3 flex items-center gap-2.5 rounded-lg bg-black/20 px-3 py-2 text-[11px] text-white/90">
          <span>last active {formatAge(detail.summary.lastActivityAt)}</span>
          <span className="ml-auto tabular-nums">{outbound.length} outbound</span>
        </div>
      ) : null}
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
    <div className="border-t border-line p-3">
      <form onSubmit={handleSubmit} className="space-y-2">
        {!simulated && account.capabilities.sendManualMessage === "available" ? <div className="space-y-1">
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
        </div> : null}
        <div className="flex items-start gap-3 rounded-xl border border-line bg-white px-3 py-2.5">
          <Sparkles className="mt-1 size-4 shrink-0 text-love" />
          <label className="min-w-0 flex-1">
            <span className="sr-only">Manual message</span>
            <textarea
              data-of-composer
              value={text}
              onChange={(event) => setText(event.target.value)}
              disabled={!canSend}
              rows={1}
              placeholder={canSend ? "Write a reply as the creator…" : "Sending is not available"}
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
                  "Replies enter the delivery queue. Provider acceptance appears in the thread.")}
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

      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Actions</div>
        <div className="mt-2 space-y-2" data-of-actions>
          {actionSet.available.map((entry) => {
            if (entry.action === "send_manual_message") return null;
            const primary = entry.action === "resolve_delivery_evidence";
            const needsDecision = entry.action === "resolve_delivery_evidence" && decision === null;
            return (
              <div key={entry.action}>
                <button
                  type="button"
                  data-of-action={entry.action}
                  disabled={needsDecision || pending}
                  title={needsDecision ? "Choose what the evidence shows first." : undefined}
                  onClick={() =>
                    entry.action === "resolve_delivery_evidence"
                      ? incident && decision && onResolve(incident.attemptId, decision)
                      : onCommand(entry.action, NO_PAYLOAD)
                  }
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                    primary
                      ? "bg-accent text-white hover:bg-accent-deep"
                      : "border border-line text-ink hover:bg-elev/70"
                  } disabled:cursor-not-allowed disabled:bg-elev disabled:text-muted`}
                >
                  {entry.label}
                  <ArrowUpRight className="size-4 opacity-70" />
                </button>
                {needsDecision ? (
                  <p className="mt-1 text-[11px] leading-4 text-muted">
                    Choose what the evidence shows before resolving.
                  </p>
                ) : null}
              </div>
            );
          })}
          {actionSet.available.length === 0 ? (
            <p className="rounded-lg bg-[#fbfdfe] px-3 py-2 text-xs leading-5 text-muted">
              No action is available for this conversation right now.
            </p>
          ) : null}
        </div>
      </div>

      {actionSet.blocked.length > 0 ? (
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Not available here
          </div>
          <div className="mt-2 space-y-1.5">
            {actionSet.blocked.map((entry) => (
              <div key={entry.action} className="rounded-lg bg-[#fbfdfe] px-3 py-2">
                <div className="text-xs font-semibold text-muted">{entry.label}</div>
                <div className="mt-0.5 text-[11px] leading-4 text-muted">{entry.reason}</div>
              </div>
            ))}
          </div>
        </div>
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

      <div className="text-[11px] leading-5 text-muted">
        {viewer.canManage
          ? "Actions request a change. The backend decides whether it is allowed."
          : "This session is read only, so every action is refused before it is offered."}
      </div>
    </div>
  );
}

function FanContext({ detail }: { detail: ConversationDetail }) {
  return (
    <div className="flex flex-col gap-5">
      {detail.ownedMedia.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-[#e8f5f0] p-3">
            <div className="text-[11px] font-medium text-good">Owned items</div>
            <div className="mt-1 text-lg font-semibold text-good">{detail.ownedMedia.length}</div>
          </div>
          <div className="rounded-xl bg-[#fff6e5] p-3">
            <div className="text-[11px] font-medium text-[#9a6810]">Paid total</div>
            <div className="mt-1 text-lg font-semibold text-[#9a6810]">
              {formatMoney({
                currency: detail.ownedMedia[0].price.currency,
                minorUnits: detail.ownedMedia.reduce((total, item) => total + item.price.minorUnits, 0),
              })}
            </div>
          </div>
        </div>
      ) : null}

      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          Facts with provenance
        </div>
        <ul className="mt-2 space-y-2">
          {detail.facts.map((item) => (
            <li key={`${item.label}-${item.value}`} className="rounded-xl border border-line bg-[#fbfdfe] p-3">
              <div className="text-[11px] font-medium text-muted">{item.label}</div>
              <div className="mt-0.5 text-sm leading-5 text-ink">{item.value}</div>
              <div className="mt-1">
                <span className="rounded-full bg-elev px-2 py-0.5 text-[10px] font-medium text-muted">
                  {item.source}
                </span>
              </div>
            </li>
          ))}
          {detail.facts.length === 0 ? (
            <li className="text-xs text-muted">No stored facts for this fan yet.</li>
          ) : null}
        </ul>
      </div>

      {detail.ownedMedia.length > 0 ? (
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Owned media</div>
          <ul className="mt-2 space-y-2">
            {detail.ownedMedia.map((item) => (
              <li
                key={item.mediaId}
                className="flex items-center justify-between gap-2 rounded-xl border border-line p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{item.label}</div>
                  <div className="text-[11px] text-muted">{formatAge(item.purchasedAt)}</div>
                </div>
                <span className="shrink-0 text-sm font-semibold text-good">{formatMoney(item.price)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
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
}: {
  controls?: ReactNode;
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
    <div className="users-workspace lg:h-full" data-of-surface="onlyfans-inbox">
      {viewer.kind === "view_as" ? (
        <div
          data-of-readonly
          className="mb-3 rounded-xl border border-[#dce8fb] bg-[#edf3fc] p-3 text-xs leading-5 text-[#2f6fed]"
        >
          Read only. You are viewing as the creator. Every write action is refused, including from
          this session.
        </div>
      ) : null}

      {showPreviewChrome ? <PreviewNotice controls={controls} /> : null}

      <p className="mb-3 text-xs leading-5 text-muted">
        One account at a time: switching accounts changes the conversation list, the thread and every
        cached read, and nothing carries across. Every outbound bubble carries its own receipt,
        because one action in a turn can land while the next one does not.
      </p>

      <div className="grid min-h-0 gap-3 lg:h-full lg:grid-cols-3">
        <Card size="sm" className="users-panel users-panel-list flex h-[34rem] flex-col overflow-hidden p-0 lg:h-full">
          <RequestStateBlock
            state={accountsState}
            label="account scope"
            render={(list) => (
              <AccountChips accounts={list} activeAccountId={activeAccountId} onSelectAccount={onSelectAccount} />
            )}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ConversationList
              conversations={conversations}
              selectedConversationId={selectedConversationId}
              onSelectConversation={onSelectConversation}
              nextCursor={nextCursor}
              loadingMore={loadingMore}
              onLoadMore={onLoadMore}
            />
          </div>
        </Card>

        <Card size="sm" className="users-panel users-panel-chat flex h-[42rem] flex-col overflow-hidden p-0 lg:h-full">
          {!activeAccount || !detail ? (
            <div className="flex flex-1 items-center justify-center gap-2 p-6 text-sm text-muted">
              <MessageCircle className="size-4" />
              Select a conversation to read it.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5">
                <FanAvatar
                  cloneId=""
                  telegramId={null}
                  name={detail.summary.fan.displayName}
                  className="h-9 w-9 text-[11px]"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">
                    {detail.summary.fan.displayName}
                  </div>
                  <div className="truncate text-[11px] text-muted">
                    Ref {detail.summary.fan.shortRef} · revision {detail.summary.revision} ·{" "}
                    <span className="creator-name">{detail.summary.accountId}</span>
                  </div>
                </div>
                <ModePill mode={detail.summary.automationMode} />
                <span className="flex shrink-0 items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-muted">
                  OnlyFans
                </span>
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

        <Card size="sm" className="users-panel users-panel-profile overflow-y-auto p-4 lg:h-full">
          {!activeAccount || !detail || !actionSet ? (
            <div className="flex h-full items-center justify-center text-center text-xs text-muted">
              Pick a conversation to see the fan and the controls.
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <FanAvatar
                  cloneId=""
                  telegramId={null}
                  name={detail.summary.fan.displayName}
                  className="h-11 w-11 text-xs"
                />
                <div className="min-w-0">
                  <div className="truncate font-semibold text-ink">
                    {detail.summary.fan.displayName}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span>Ref {detail.summary.fan.shortRef}</span>
                  </div>
                </div>
              </div>

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

              <DeliveryLedger messages={detail.messages} />
              <FanContext detail={detail} />

              <div className="border-t border-line pt-3">
                <FreshnessLine freshness={detail.freshness} />
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white p-3 text-xs text-muted">
        <CheckCircle2 className="size-4 text-muted" />
        <span>
          A sent bubble means the provider accepted it. It never means read, and it never means
          purchased.
        </span>
      </div>
    </div>
  );
}
