"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPlanCClient, type PlanCClient } from "@/lib/onlyfans/plan-c-client";
import { canApprove, isExpired, minutesLeft, validateEditedParts, validateEvidenceRef, validateRejectReason,
  type PlanCCommandResult, type PlanCConversation, type PlanCConversationAction, type PlanCDraft, type PlanCUnresolvedItem } from "@/lib/onlyfans/plan-c";

const usd = (cents: number | null, currency: string | null) => cents === null ? "no price" : `${currency ?? "USD"} ${(cents / 100).toFixed(2)}`;
const place = (conversationId: string, accountId: string) => `Fan ${conversationId.startsWith(`${accountId}:`) ? conversationId.slice(accountId.length + 1) : conversationId}`;
const kindLabel = (kind: string) => ({ unknown_send: "Unknown send", unlinked_transaction: "Unlinked transaction", unreconciled_access: "Unreconciled access evidence" } as Record<string, string>)[kind] ?? kind.replace(/_/g, " ");

const CONVERSATION_COPY: Record<PlanCConversationAction, { label: string; confirm: string; help: string }> = {
  stop: { label: "Stop", confirm: "Confirm stop", help: "Stops engine sending for this conversation." },
  takeover: { label: "Take over", confirm: "Confirm take over", help: "You write from now on. Pending drafts for this fan are invalidated." },
  handback: { label: "Hand back to engine", confirm: "Confirm hand back", help: "The engine may plan a new draft. It never sends an old draft, and every new draft still needs your approval." } };

/** Two clicks: the button, then an explicit confirmation. Nothing here runs by itself. */
function ConversationControls({ conversation, canAct, onCommand }: { conversation: PlanCConversation; canAct: boolean;
  onCommand: (conversation: PlanCConversation, action: PlanCConversationAction) => Promise<PlanCCommandResult> }) {
  const [confirming, setConfirming] = useState<PlanCConversationAction | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  const inflight = useRef(false);
  const run = async (action: PlanCConversationAction) => {
    if (busy || inflight.current) return;
    inflight.current = true; setBusy(true); setMessage(null);
    try { const result = await onCommand(conversation, action); setMessage(result.ok ? `${CONVERSATION_COPY[action].label} recorded.` : result.error); }
    catch { setMessage("The outcome is unconfirmed. Reload before acting again."); }
    finally { inflight.current = false; setBusy(false); setConfirming(null); }
  };
  return <li className="rounded-lg border border-line p-3 text-sm" data-plan-c-conversation={conversation.conversationId}>
    <p className="font-semibold">{conversation.label} <span className="font-normal text-muted">({conversation.conversationId}{conversation.revision === null ? "" : `, revision ${conversation.revision}`})</span></p>
    {conversation.revision === null ? <p className="text-xs text-muted">The backend did not report this conversation's revision, so it cannot be changed from here.</p> :
      <div className="mt-2 flex flex-wrap gap-2">
        {(Object.keys(CONVERSATION_COPY) as PlanCConversationAction[]).map(action => confirming === action ?
          <span key={action} className="flex flex-wrap items-center gap-2" data-plan-c-confirm={action}>
            <span className="text-xs text-muted">{CONVERSATION_COPY[action].help}</span>
            <button type="button" className="of-control-button of-primary" disabled={busy || !canAct} data-plan-c-conversation-confirm={action} onClick={() => void run(action)}>{busy ? "Saving…" : CONVERSATION_COPY[action].confirm}</button>
            <button type="button" className="of-control-button of-secondary" disabled={busy} onClick={() => setConfirming(null)}>Cancel</button>
          </span> :
          <button key={action} type="button" className="of-control-button of-secondary" disabled={busy || !canAct || confirming !== null} data-plan-c-conversation-action={action} onClick={() => setConfirming(action)}>{CONVERSATION_COPY[action].label}</button>)}
      </div>}
    {message ? <p role="status" className="mt-1 text-xs">{message}</p> : null}
  </li>;
}

function DraftCard({ draft, accountId, now, canAct, onApprove, onReject, onEdit }: { draft: PlanCDraft; accountId: string; now: number; canAct: boolean;
  onApprove: (draft: PlanCDraft) => Promise<PlanCCommandResult>; onReject: (draft: PlanCDraft, reason: string) => Promise<PlanCCommandResult>;
  onEdit: (draft: PlanCDraft, parts: string[]) => Promise<PlanCCommandResult> }) {
  const [mode, setMode] = useState<"reject" | "edit" | null>(null), [reason, setReason] = useState(""), [texts, setTexts] = useState(() => draft.parts.map(part => part.text));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  const expired = isExpired(draft, now), left = minutesLeft(draft.expiresAt, now);
  const inflight = useRef(false);
  const run = async (action: () => Promise<PlanCCommandResult>, done: string) => {
    if (busy || inflight.current) return;
    inflight.current = true; setBusy(true); setMessage(null);
    try { const result = await action(); setMessage(result.ok ? done : result.error); if (result.ok) setMode(null); }
    catch { setMessage("The outcome is unconfirmed. Reload before acting again."); }
    finally { inflight.current = false; setBusy(false); }
  };
  const rejectProblem = validateRejectReason(reason), editProblem = validateEditedParts(draft, texts);
  return <li className="rounded-lg border border-line p-3 text-sm" data-plan-c-draft={`${draft.requestId}:${draft.generation}`} data-plan-c-status={draft.status} data-plan-c-version={draft.draftVersion}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <strong>{place(draft.conversationId, accountId)} <span className="font-normal text-muted">({draft.conversationId})</span></strong>
      <span className="flex gap-1 text-[11px] font-semibold">
        <span className="rounded-full bg-elev px-2 py-0.5" data-plan-c-action-badge>{draft.action}</span>
        <span className="rounded-full bg-elev px-2 py-0.5" data-plan-c-status-badge>{draft.status === "awaiting" ? "awaiting approval" : draft.status}</span>
        {expired ? <span className="rounded-full bg-elev px-2 py-0.5" data-plan-c-expired>expired</span> : null}
      </span>
    </div>
    <p className="text-xs text-muted" data-plan-c-meta>Version {draft.draftVersion} · generation {draft.generation} · hash {draft.draftHash.slice(0, 12)} · {expired ? "expired" : `expires in ${Math.max(left, 0)} min`} ({new Date(draft.expiresAt).toLocaleString()})</p>
    {draft.approvedBy ? <p className="text-xs text-muted" data-plan-c-approved-by>Approved by {draft.approvedBy}{draft.approvedAt ? ` at ${new Date(draft.approvedAt).toLocaleString()}` : ""}. Waiting for delivery checks.</p> : null}

    <p className="mt-2 text-xs font-semibold">Exact text, in send order</p>
    <ol className="mt-1 space-y-1" data-plan-c-parts>
      {draft.parts.map(part => <li key={part.index} className="rounded border border-line p-2" data-plan-c-part={part.index}>
        <p className="text-xs text-muted">Part {part.index + 1} of {draft.parts.length} · {part.action}{part.action === "offer" ? ` · ${part.mediaIds.length} media · ${usd(part.priceCents, part.currency)}` : ""}</p>
        <p className="whitespace-pre-wrap break-words" data-plan-c-part-text>{part.text}</p>
      </li>)}
    </ol>
    {draft.offer ? <p className="mt-1" data-plan-c-offer>Offer: product {draft.offer.productId ?? "unknown"} · {draft.offer.mediaCount} media · <strong>{usd(draft.offer.priceCents, draft.offer.currency)}</strong>
      {draft.offer.mediaIds.length ? <span className="break-all text-xs text-muted"> · media {draft.offer.mediaIds.join(", ")}</span> : null}</p> : null}
    {draft.evidence ? <p className="mt-1 text-xs" data-plan-c-evidence><span className="font-semibold">Unresolved evidence:</span> {draft.evidence}</p> : null}

    <details className="mt-2" data-plan-c-context><summary className="cursor-pointer text-xs font-semibold">Recent conversation ({draft.messages.length})</summary>
      {draft.messages.length ? <ul className="mt-1 space-y-1">{draft.messages.map((entry, index) => <li key={index} className="text-xs" data-plan-c-message>
        <span className="font-semibold">{entry.who}</span>{entry.at ? <span className="text-muted"> {new Date(entry.at).toLocaleString()}</span> : null}: <span className="whitespace-pre-wrap break-words">{entry.text}</span></li>)}</ul>
        : <p className="text-xs text-muted">The backend sent no recent messages.</p>}
    </details>

    {mode === "reject" ? <div className="mt-2 space-y-1">
      <label className="block text-xs">Reason for rejecting<input aria-label="Reason for rejecting" className="mt-1 w-full rounded border border-line px-2 py-1 text-base" maxLength={200} value={reason} onChange={event => setReason(event.target.value)} /></label>
      <div className="flex gap-2"><button type="button" data-plan-c-reject-confirm className="of-control-button of-primary" disabled={busy || !canAct || !!rejectProblem} onClick={() => void run(() => onReject(draft, reason), "Rejected.")}>Confirm reject</button>
        <button type="button" className="of-control-button of-secondary" disabled={busy} onClick={() => setMode(null)}>Cancel</button></div>
      {reason && rejectProblem ? <p className="text-xs text-muted">{rejectProblem}</p> : null}
    </div> : null}
    {mode === "edit" ? <div className="mt-2 space-y-2">
      <p className="text-xs text-muted">Saving an edit cancels any earlier approval. The edited draft returns here as a new version and needs a fresh approval.</p>
      {texts.map((value, index) => <label key={index} className="block text-xs">Part {index + 1} text{draft.parts[index].action === "offer" ? " (lead-in; the card line is rebuilt by the system)" : ""}
        <textarea aria-label={`Part ${index + 1} text`} className="mt-1 w-full rounded border border-line px-2 py-1 text-base" rows={3} maxLength={2000} value={value}
          onChange={event => setTexts(current => current.map((item, at) => at === index ? event.target.value : item))} /></label>)}
      <div className="flex gap-2"><button type="button" data-plan-c-edit-confirm className="of-control-button of-primary" disabled={busy || !canAct || !!editProblem} onClick={() => void run(() => onEdit(draft, texts), "Edit saved. Reloading the new version for approval.")}>Save edit</button>
        <button type="button" className="of-control-button of-secondary" disabled={busy} onClick={() => { setMode(null); setTexts(draft.parts.map(part => part.text)); }}>Cancel</button></div>
      {editProblem && texts.some((value, index) => value !== draft.parts[index].text) ? <p className="text-xs text-muted">{editProblem}</p> : null}
    </div> : null}

    {mode === null ? <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" data-plan-c-approve className="of-control-button of-primary" disabled={busy || !canAct || !canApprove(draft, now)}
        onClick={() => void run(() => onApprove(draft), `Approved version ${draft.draftVersion}. Delivery checks run before anything is sent.`)}>{draft.status === "approved" ? "Already approved" : "Approve this version"}</button>
      <button type="button" data-plan-c-edit className="of-control-button of-secondary" disabled={busy || !canAct} onClick={() => setMode("edit")}>Edit</button>
      <button type="button" data-plan-c-reject className="of-control-button of-secondary" disabled={busy || !canAct} onClick={() => setMode("reject")}>Reject</button>
    </div> : null}
    {message ? <p role="status" className="mt-1 text-xs" data-plan-c-message-status>{message}</p> : null}
  </li>;
}

function UnresolvedRow({ item, accountId, canAct, onReconcile }: { item: PlanCUnresolvedItem; accountId: string; canAct: boolean;
  onReconcile: (item: PlanCUnresolvedItem, evidence: string) => Promise<PlanCCommandResult> }) {
  const [evidence, setEvidence] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  const problem = validateEvidenceRef(evidence);
  const inflight = useRef(false);
  const submit = async () => {
    if (busy || problem || inflight.current) return;
    inflight.current = true; setBusy(true); setMessage(null);
    try { const result = await onReconcile(item, evidence); setMessage(result.ok ? "Reconciled. Reloading." : result.error); if (result.ok) setEvidence(""); }
    catch { setMessage("The outcome is unconfirmed. Reload before acting again."); }
    finally { inflight.current = false; setBusy(false); }
  };
  return <li className="rounded-lg border border-line p-3 text-sm" data-plan-c-unresolved={item.id}>
    <p className="font-semibold">{kindLabel(item.kind)} <span className="font-normal text-muted">({item.conversationId ? place(item.conversationId, accountId) : "account"})</span></p>
    {item.summary ? <p className="whitespace-pre-wrap break-words">{item.summary}</p> : null}
    <p className="text-muted" data-plan-c-owner>Owner: {item.owner}. Next step: {item.nextStep.replace(/_/g, " ")}.</p>
    {item.createdAt ? <p className="text-xs text-muted">Since {new Date(item.createdAt).toLocaleString()}</p> : null}
    <div className="mt-2 space-y-1">
      <label className="block text-xs">Evidence reference (what you checked)<input aria-label="Evidence reference" className="mt-1 w-full rounded border border-line px-2 py-1 text-base" maxLength={108} value={evidence} onChange={event => setEvidence(event.target.value)} /></label>
      <button type="button" data-plan-c-reconcile className="of-control-button of-secondary" disabled={busy || !canAct || !!problem} onClick={() => void submit()}>Mark reconciled</button>
      {evidence && problem ? <p className="text-xs text-muted">{problem}</p> : null}
    </div>
    {message ? <p role="status" className="mt-1 text-xs">{message}</p> : null}
  </li>;
}

type Load<T> = { kind: "loading" } | { kind: "error"; error: string } | { kind: "ready"; value: T };

/**
 * Plan C approvals. Reads and writes go through this dashboard's own routes; the backend token never reaches the browser.
 * There is no polling approve, no "approve all" and no automatic hand back: every command is one click on one item.
 */
export default function PlanCConsole({ accountId, canAct, client: injected, fetchImpl }: { accountId: string; canAct: boolean; client?: PlanCClient; fetchImpl?: typeof fetch }) {
  const client = useMemo(() => injected ?? createPlanCClient({ accountId, fetchImpl }), [injected, accountId, fetchImpl]);
  const [drafts, setDrafts] = useState<Load<PlanCDraft[]>>({ kind: "loading" }), [unresolved, setUnresolved] = useState<Load<PlanCUnresolvedItem[]>>({ kind: "loading" });
  const [notice, setNotice] = useState<string | null>(null), [confirmation, setConfirmation] = useState<string | null>(null), [held, setHeld] = useState<Record<string, number>>({}), [now, setNow] = useState(() => Date.now());
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++generation.current;
    const [d, u] = await Promise.all([client.listDrafts(), client.listUnresolved()]);
    if (mine !== generation.current) return;
    setNow(Date.now());
    setDrafts(d.ok ? { kind: "ready", value: d.data.drafts } : { kind: "error", error: d.error });
    setUnresolved(u.ok ? { kind: "ready", value: u.data.items } : { kind: "error", error: u.error });
  }, [client]);
  useEffect(() => { void reload(); return () => { generation.current++; }; }, [reload]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);

  /** After any command the lists are re-read. A conflict says so and shows the current draft; it never retries on its own. */
  const settle = async (result: PlanCCommandResult, label: string) => {
    setNotice(result.ok ? null : result.reload ? result.error : null);
    setConfirmation(result.ok ? `${label}${result.replayed ? " (this exact command had already been recorded)" : ""}. Lists reloaded.` : null);
    await reload();
    return result;
  };
  const conversations = useMemo<PlanCConversation[]>(() => {
    const byId = new Map<string, PlanCConversation>();
    const add = (conversationId: string, revision: number | null) => { const existing = byId.get(conversationId);
      if (!existing) byId.set(conversationId, { conversationId, revision, label: place(conversationId, accountId) });
      else if (existing.revision === null && revision !== null) existing.revision = revision; };
    if (drafts.kind === "ready") for (const draft of drafts.value) add(draft.conversationId, draft.conversationRevision);
    if (unresolved.kind === "ready") for (const item of unresolved.value) if (item.conversationId) add(item.conversationId, item.conversationRevision);
    for (const [conversationId, revision] of Object.entries(held)) add(conversationId, revision);
    return [...byId.values()];
  }, [drafts, unresolved, held, accountId]);

  const onConversation = async (conversation: PlanCConversation, action: PlanCConversationAction) => {
    if (conversation.revision === null) return { ok: false, outcome: "refused", reload: false, error: "This conversation's revision is unknown." } as PlanCCommandResult;
    const result = await settle(await client.conversationCommand(conversation.conversationId, action, conversation.revision), `${CONVERSATION_COPY[action].label} recorded for ${conversation.conversationId}`);
    // A takeover leaves no draft to hang the hand back on, so remember it for this session. A hand back clears it.
    if (result.ok && action === "takeover" && result.recordedRevision !== null) setHeld(current => ({ ...current, [conversation.conversationId]: result.recordedRevision! }));
    if (result.ok && action === "handback") setHeld(current => { const next = { ...current }; delete next[conversation.conversationId]; return next; });
    return result;
  };

  return <section aria-label="Plan C approvals" data-plan-c-console className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted">Nothing is sent until you approve a specific draft. Each approval covers one version of one draft. Handing a chat back never sends an old draft.</p>
      <button type="button" data-plan-c-reload className="of-control-button of-secondary" onClick={() => { setNotice(null); setConfirmation(null); void reload(); }}>Reload</button>
    </div>
    {confirmation ? <p role="status" className="rounded-lg border border-line p-2 text-sm" data-plan-c-confirmation>{confirmation}</p> : null}
    {notice ? <p role="alert" className="rounded-lg border border-line p-2 text-sm" data-plan-c-notice>{notice}</p> : null}

    <section aria-label="Drafts awaiting approval"><h2 className="font-semibold">Drafts awaiting approval</h2>
      {drafts.kind === "loading" ? <p role="status" className="text-sm text-muted">Loading drafts…</p> : null}
      {drafts.kind === "error" ? <p role="status" className="text-sm text-muted" data-plan-c-drafts-error>{drafts.error} <button type="button" className="underline" onClick={() => void reload()}>Retry</button></p> : null}
      {drafts.kind === "ready" ? drafts.value.length ? <ul className="mt-2 space-y-2">{drafts.value.map(draft =>
        <DraftCard key={`${draft.requestId}:${draft.generation}:${draft.draftVersion}:${draft.status}`} draft={draft} accountId={accountId} now={now} canAct={canAct}
          onApprove={async item => settle(await client.approveDraft(item), `Approved version ${item.draftVersion} for ${item.conversationId}`)} onReject={async (item, reason) => settle(await client.rejectDraft(item, reason), `Rejected version ${item.draftVersion} for ${item.conversationId}`)}
          onEdit={async (item, parts) => settle(await client.editDraft(item, parts), `Edit saved for ${item.conversationId}; the new version needs a fresh approval`)} />)}</ul>
        : <p className="mt-2 text-sm" data-plan-c-no-drafts>No drafts are waiting for approval.</p> : null}
    </section>

    <section aria-label="Conversation controls"><h2 className="font-semibold">Conversation controls</h2>
      {conversations.length ? <ul className="mt-2 space-y-2">{conversations.map(conversation => <ConversationControls key={`${conversation.conversationId}:${conversation.revision}`} conversation={conversation} canAct={canAct} onCommand={onConversation} />)}</ul>
        : <p className="mt-2 text-sm text-muted">No conversation has a draft or unresolved work right now.</p>}
    </section>

    <section aria-label="Unresolved work"><h2 className="font-semibold">Unresolved work</h2>
      {unresolved.kind === "loading" ? <p role="status" className="text-sm text-muted">Loading unresolved work…</p> : null}
      {unresolved.kind === "error" ? <p role="status" className="text-sm text-muted" data-plan-c-unresolved-error>{unresolved.error} <button type="button" className="underline" onClick={() => void reload()}>Retry</button></p> : null}
      {unresolved.kind === "ready" ? unresolved.value.length ? <ul className="mt-2 space-y-2">{unresolved.value.map(item =>
        <UnresolvedRow key={item.id} item={item} accountId={accountId} canAct={canAct} onReconcile={async (row, evidence) => settle(await client.reconcile(row, evidence), `Reconciled ${row.id}`)} />)}</ul>
        : <p className="mt-2 text-sm" data-plan-c-no-unresolved>Nothing is unresolved.</p> : null}
    </section>
  </section>;
}
