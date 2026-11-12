/**
 * Synthetic InboxView fixtures for W3 lane 4 (ui-onlyfans-preview-2), built on lib/onlyfans-preview/fixtures. Import AFTER
 * ./w3-preview2-dom. Ids are synthetic ("acct-a", "conv-1", attempt "attempt-a1"); nothing cookie or token shaped.
 */
import React from "react";
import { accounts, conversationDetails } from "../../lib/onlyfans-preview/fixtures";
import { NO_PAYLOAD, type CommandPayload, type CommandResult, type ConversationDetail, type OfAccount, type PreviewViewer } from "../../lib/onlyfans-preview/types";
import { HANDOVER_SCHEMA, type Handover } from "../../lib/onlyfans/handover";
import InboxView from "../../components/onlyfans-preview/InboxView";

type Summary = ConversationDetail["summary"];
export const PRINCIPAL = "agency-test:staff-test";
export const MANAGER: PreviewViewer = { kind: "operator", label: "Manager", canManage: true, canChat: true, scopedAccountIds: [] };
export const CHATTER: PreviewViewer = { kind: "operator", label: "Chatter", canManage: false, canChat: true, scopedAccountIds: [] };

/** A connected account with every capability available. */
export function liveAccount(accountId: string, patch: Partial<OfAccount> = {}): OfAccount {
  const base = accounts[0];
  const capabilities = { ...base.capabilities };
  for (const key of Object.keys(capabilities) as (keyof OfAccount["capabilities"])[]) capabilities[key] = "available";
  return { ...base, accountId, health: "connected", healthReason: null,
    binding: { ...base.binding, bindingId: `bind-${accountId}`, creatorId: `creator-${accountId}`, creatorName: `Creator ${accountId}`, handle: `handle_${accountId.replace(/[^a-z0-9]/gi, "")}` },
    capabilities, ...patch };
}

/** A detail on `accountId`/`conversationId` with `messageCount` messages; summary/incident patches on top. */
export function detailFor(accountId: string, conversationId: string, opts: { summary?: Partial<Summary>; incident?: ConversationDetail["deliveryIncident"]; messageCount?: number; revision?: number } = {}): ConversationDetail {
  const base = Object.values(conversationDetails)[0];
  const count = opts.messageCount ?? 2;
  const messages = Array.from({ length: count }, (_, i) => ({ ...base.messages[i % base.messages.length], messageId: `${conversationId}-m${i + 1}`, conversationId,
    occurredAt: new Date(Date.parse("2026-10-17T08:00:00.000Z") + i * 60_000).toISOString(), body: `message ${i + 1} in ${conversationId}` }));
  return { ...base, accountId, conversationId, messages, deliveryIncident: opts.incident ?? null, engineStatus: undefined,
    summary: { ...base.summary, accountId, conversationId, revision: opts.revision ?? base.summary.revision, automationMode: "human_controlled", takeoverState: "effective", delivery: "sent", ...opts.summary } } satisfies ConversationDetail;
}
export const incident = (attemptId: string): NonNullable<ConversationDetail["deliveryIncident"]> => ({ attemptId, outcome: "unknown", recordedAt: "2026-10-17T08:40:55.000Z", detail: `Synthetic held send ${attemptId}.` });

export function handover(accountId: string, conversationId: string, revision: number, events: Handover["events"], patch: Partial<Handover> = {}): Handover {
  return { schemaVersion: HANDOVER_SCHEMA, accountId, conversationId, revision, mode: "human_controlled", takeoverState: "effective",
    owner: "you", canActAsOwner: true, hasMore: false, events, ...patch };
}

/** A live (non-simulated) control result for `command`. A send carries the manual_message payload the composer builds. */
export function liveResult(command: CommandResult["request"]["command"], outcome: "recorded" | "refused" | "unconfirmed", accountId: string, conversationId: string): CommandResult {
  const payload: CommandPayload = command === "send_manual_message" ? { kind: "manual_message", body: "Synthetic reply." } : NO_PAYLOAD;
  return { simulated: false, applied: outcome === "recorded", accepted: outcome === "recorded", outcome, note: `Synthetic ${outcome} ${command}.`,
    request: { commandId: "cmd-1", idempotencyKey: "idem-test-1", command, accountId, conversationId, expectedRevision: 1, payload } };
}

export type InboxProps = Partial<React.ComponentProps<typeof InboxView>> & { account: OfAccount; detail: ConversationDetail; allAccounts?: OfAccount[] };
/** InboxView with one ready conversation selected. `showPreviewChrome` defaults to false (the live surface). */
export function inbox({ account, detail, allAccounts, ...rest }: InboxProps) {
  return <InboxView draftPrincipal={PRINCIPAL} accountsState={{ status: "ready", data: allAccounts ?? [account] }} activeAccount={account} activeAccountId={account.accountId}
    onSelectAccount={() => {}} conversations={{ status: "ready", data: { items: [detail.summary], nextCursor: null } }} selectedConversationId={detail.conversationId}
    onSelectConversation={() => {}} detailState={{ status: "ready", data: detail }} viewer={MANAGER} onCommand={() => {}} commandResult={null}
    nextCursor={null} loadingMore={false} onLoadMore={() => {}} showPreviewChrome={false} {...rest} />;
}
