"use client";
import { readWithRecovery } from "@/lib/onlyfans/read-recovery";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDashboardAccess } from "@/components/DashboardAccessProvider";
import { usesTwinAgencyRefresh } from "@/lib/twin-agency-refresh";
import { Card } from "@/components/ui/card";
import { Info, inputCls } from "@/components/clone/fields";
import { CAMPAIGN_ACTIONS, RECIPIENT_STATUSES, campaignObject, parseCampaignAck, parseCampaignDetail, parseCampaignList, validCampaignPayload, type Campaign, type CampaignAction, type CampaignChange, type CampaignPayload, type CampaignRecipient } from "@/lib/onlyfans/campaigns";
import type { ConversationSummary } from "@/lib/onlyfans-preview/types";
import OnlyFansAvatar from "./OnlyFansAvatar";
import { inboxSearchParams } from "@/lib/onlyfans/inbox-search";
import { ALL_MODE_HINT, ALL_MODE_LABEL, AUDIENCE_LIMIT, NO_SENDER_TEXT, POPULATION_HINT, POPULATION_TEXT, ageText, canQueue, clearSelection, forgetDraft, lastSyncAt, mergePage, recallDraft, rememberDraft, selectPage, senderLine, type Sender } from "@/lib/onlyfans/campaign-audience";
import { parseWorkspace, formatRecordedMoney, type CatalogRead } from "@/lib/onlyfans/workspace";
import { forgetHeldKeys, heldKeyStore } from "@/lib/onlyfans/plan-c-client";
import { uuidRequestKey } from "@/lib/onlyfans-preview/actions";

type Write = { kind: "create"; body: CampaignPayload } | { kind: "change"; campaignId: string; body: CampaignChange };
const inputClass = `${inputCls} disabled:opacity-50`;
const buttonClass = "rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink transition hover:bg-elev disabled:cursor-not-allowed disabled:opacity-50";
const LABELS = { pending: "Waiting", queued: "Queued", dispatching: "Sending", accepted: "Accepted", notAccepted: "Not accepted", unknown: "Uncertain", cancelled: "Cancelled", refused: "Refused", skipped: "Skipped" };
const REASONS: Record<string, string> = {
  campaign_cancelled: "Cancelled by an operator.",
  contact_or_owner_unavailable: "Contact permissions or reply ownership exclude this recipient.",
  catalogue_snapshot_changed: "The selected content changed. Review it and create a new campaign.",
  catalogue_media_already_owned: "Skipped: already purchased.",
  ownership_evidence_unavailable: "Purchase ownership needs review before sending.",
  unresolved_delivery: "An earlier delivery is uncertain and needs review.",
  history_not_current: "Conversation synchronization must complete before sending.",
  account_disabled: "Account processing is paused.",
  contact_blocked: "Contact is paused or excluded.",
  owner_changed: "Reply ownership changed before delivery.",
  control_revision_changed: "Conversation controls changed before delivery.",
  policy_changed: "Delivery permissions changed before sending.",
  expired: "The delivery request expired before sending.",
};
/**
 * A stored create this build can resend unchanged. Held creates live in the key store (G04c2), per operator scope and account, across a
 * reload but not a re-sign-in. A change is never stored: the route keys it by its expectedRevision, so it needs no requestKey.
 */
const heldWrite = (value: unknown): value is Write => campaignObject(value) && value.kind === "create" && validCampaignPayload(value.body);
const UNCONFIRMED_TEXT = "The outcome is not confirmed. Retry this same request before making another change.";
const reasonText = (reason: string | null, providerId: string | null) => reason ? REASONS[reason] ?? "Delivery requires review in Operations." : providerId ? "Provider reference recorded" : "—";
const when = (value: string) => new Date(value).toLocaleString();

/** The sender is always explicit. Without exactly one chosen account nothing can be queued. */
export default function CampaignManager({ accountId, sender = null, readOnly = false, operatorScope }: { accountId: string | null; sender?: Sender | null; readOnly?: boolean; operatorScope?: string }) {
  if (!accountId) return <div className="space-y-5" data-of-campaign-manager><Card className="p-4"><h2 className="font-semibold">New campaign</h2><p role="status" data-of-campaign-sender className="mt-2 text-sm font-medium">{NO_SENDER_TEXT}</p></Card></div>;
  return <CampaignManagerForAccount key={accountId} accountId={accountId} sender={sender} readOnly={readOnly} operatorScope={operatorScope} />;
}

function CampaignManagerForAccount({ accountId, sender, readOnly, operatorScope }: { accountId: string; sender: Sender | null; readOnly: boolean; operatorScope?: string }) {
  // A write in flight or unconfirmed, on an earlier page load or mount too, is the only action offered until its outcome is known.
  const keys = heldKeyStore("of-campaign-keys", accountId, operatorScope), held = useRef(keys.pending().find(heldWrite) ?? null).current;
  const initialDraft = useRef(recallDraft(accountId)).current;
  const router = useRouter();
  const { audience, agencyName } = useDashboardAccess();
  const pathname = usePathname();
  const twinRefresh = pathname.startsWith("/onlyfans/") || usesTwinAgencyRefresh(audience, agencyName, pathname);
  const endpoint = `/api/onlyfans-campaigns/accounts/${encodeURIComponent(accountId)}/campaigns`;
  const [campaigns, setCampaigns] = useState<Campaign[]>([]), [truncated, setTruncated] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ campaign: Campaign; recipients: CampaignRecipient[] } | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [denied, setDenied] = useState(false);
  const [listReady, setListReady] = useState(false);
  const [notice, setNotice] = useState(held ? UNCONFIRMED_TEXT : ""), [retry, setRetry] = useState<Write | null>(held);
  const [name, setName] = useState(initialDraft.name), [body, setBody] = useState(initialDraft.body), [scheduled, setScheduled] = useState(initialDraft.scheduled);
  const [audienceKind, setAudienceKind] = useState<"explicit" | "all_known">(initialDraft.audienceKind);
  const [fans, setFans] = useState<ConversationSummary[]>([]), [fanIds, setFanIds] = useState<Set<string>>(() => new Set(initialDraft.fanIds));
  const [fanQuery, setFanQuery] = useState(initialDraft.query), [appliedQuery, setAppliedQuery] = useState(initialDraft.query), [fansLoaded, setFansLoaded] = useState(false), fanSeq = useRef(0);
  const [fanCursor, setFanCursor] = useState<string | null>(null), [fansBusy, setFansBusy] = useState(false), [fanError, setFanError] = useState("");
  const [catalogue, setCatalogue] = useState<CatalogRead["items"]>([]), [catalogueCursor, setCatalogueCursor] = useState<string | null>(null);
  const [catalogueBusy, setCatalogueBusy] = useState(false), [catalogueError, setCatalogueError] = useState(""), [catalogItemId, setCatalogItemId] = useState(initialDraft.catalogItemId);
  useEffect(() => { rememberDraft(accountId, { name, body, scheduled, audienceKind, fanIds: [...fanIds], catalogItemId, query: fanQuery }); }, [accountId, name, body, scheduled, audienceKind, fanIds, catalogItemId, fanQuery]);
  useEffect(() => { const timer = window.setTimeout(() => setAppliedQuery(fanQuery.trim()), 300); return () => window.clearTimeout(timer); }, [fanQuery]);
  const catalogueRequest = useRef(false);
  const active = useRef(true), sending = useRef(false), fanRequest = useRef(false), selection = useRef<string | null>(null), sessionDenied = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const sessionLost = useCallback(() => {
    forgetHeldKeys(operatorScope); // even when unmounted: a held write must not outlive the session (codex final)
    if (!active.current) return;
    sessionDenied.current = true;
    setDenied(true); setListReady(false); setBusy(false); setCampaigns([]); setDetail(null); setFans([]); setFanIds(new Set()); setCatalogue([]); setCatalogItemId(""); setName(""); setBody(""); setRetry(null); forgetDraft(accountId);
    setNotice("This session cannot manage campaigns. Sign in again."); router.refresh();
  }, [router, accountId, operatorScope]);
  const read = useCallback(async (id?: string | null) => {
    try {
      const response = await fetch(id ? `${endpoint}/${encodeURIComponent(id)}` : endpoint, { credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
      if ([401, 403].includes(response.status)) { sessionLost(); return false; }
      if (!response.ok) throw new Error("Campaigns could not be refreshed. Check the account connection and try again.");
      const value: unknown = await response.json();
      if (!active.current || sessionDenied.current) return false;
      if (id) { const parsed = parseCampaignDetail(value, accountId, id); if (!parsed) throw new Error("The campaign response was invalid."); if (selection.current === id) setDetail(parsed); }
      else { const parsed = parseCampaignList(value, accountId); if (!parsed) throw new Error("The campaign response was invalid."); setCampaigns(parsed.campaigns); setTruncated(parsed.truncated); setListReady(true); }
      return true;
    } catch (error) { if (active.current) setNotice(error instanceof Error ? error.message : "Campaigns could not be refreshed."); return false; }
  }, [endpoint, accountId, sessionLost]);
  const loadFans = useCallback(async (cursor: string | null = null, query = "") => {
    if (cursor && fanRequest.current) return;
    const seq = ++fanSeq.current; fanRequest.current = true; setFansBusy(true); setFanError("");
    if (!cursor) { setFansLoaded(false); setFans([]); setFanCursor(null); }
    try {
      const params = inboxSearchParams(false, query); if (cursor) params.set("cursor", cursor);
      const response = await readWithRecovery(`/api/onlyfans/accounts/${encodeURIComponent(accountId)}/conversations${params.size ? `?${params}` : ""}`, { credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
      if ([401, 403].includes(response.status)) { sessionLost(); return; }
      if (!response.ok) throw new Error(`Synchronized conversations could not be loaded (HTTP ${response.status}) after bounded recovery. Retry; if this persists, ask the release owner to inspect the account list request.`);
      const value = await response.json();
      if (!Array.isArray(value.page?.items) || value.page.items.some((item: ConversationSummary) => item.accountId !== accountId || typeof item.conversationId !== "string" || !item.fan || typeof item.fan.displayName !== "string")) throw new Error("The audience response was invalid.");
      if (active.current && !sessionDenied.current && seq === fanSeq.current) { setFans(previous => cursor ? mergePage(previous, value.page.items) : value.page.items); setFanCursor(typeof value.page.nextCursor === "string" ? value.page.nextCursor : null); setFansLoaded(true); }
    } catch (error) { if (active.current && seq === fanSeq.current) setFanError(error instanceof Error ? error.message : "Synchronized conversations could not be loaded."); }
    finally { if (seq === fanSeq.current) { fanRequest.current = false; if (active.current) setFansBusy(false); } }
  }, [accountId, sessionLost]);
  const loadCatalogue = useCallback(async (cursor: string | null = null) => {
    if (catalogueRequest.current) return; catalogueRequest.current = true; setCatalogueBusy(true); setCatalogueError("");
    try {
      const response = await fetch(`/api/onlyfans/accounts/${encodeURIComponent(accountId)}/workspace/content${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
      if ([401, 403].includes(response.status)) { sessionLost(); return; }
      if (!response.ok) throw new Error("The saved content catalogue could not be loaded.");
      const value = await response.json(), parsed = parseWorkspace(value.workspace, accountId, "content");
      if (!parsed || parsed.section !== "content") throw new Error("The catalogue response was invalid.");
      if (active.current && !sessionDenied.current) { setCatalogue(previous => cursor ? [...new Map([...previous, ...parsed.items].map(item => [item.itemId, item])).values()] : parsed.items); setCatalogueCursor(parsed.nextCursor); }
    } catch (error) { if (active.current) setCatalogueError(error instanceof Error ? error.message : "The content catalogue could not be loaded."); }
    finally { catalogueRequest.current = false; if (active.current) setCatalogueBusy(false); }
  }, [accountId, sessionLost]);
  useEffect(() => { void read().finally(() => { if (active.current) setLoading(false); }); void loadCatalogue(); }, [read, loadCatalogue]);
  useEffect(() => { void loadFans(null, appliedQuery); }, [loadFans, appliedQuery]);
  useEffect(() => { selection.current = selected; setDetail(null); if (selected) void read(selected); }, [selected, read]);
  useEffect(() => { const timer = window.setInterval(() => { if (!document.hidden && !sending.current && !denied) { void read(); if (selection.current) void read(selection.current); } }, 5000); return () => window.clearInterval(timer); }, [read, denied]);
  async function write(request: Write) {
    if (sending.current || denied || readOnly) return; sending.current = true; setBusy(true); setNotice("");
    // The exact create is held with its requestKey; once any attempt went unconfirmed only a recorded ack releases it (keys.settle). The
    // backend refusal code is not forwarded by the campaign routes (campaigns-backend.ts), so no refusal can prove a create did not commit.
    const create = request.kind === "create", intent = JSON.stringify(request), requestKey = create ? uuidRequestKey(keys.keyFor(intent, request)) : null;
    let outcome: "ack" | "refused" | null = null;
    try {
      const response = await fetch(request.kind === "create" ? endpoint : `${endpoint}/${encodeURIComponent(request.campaignId)}`, { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000), headers: { "Content-Type": "application/json" }, body: JSON.stringify(create ? { requestKey, ...request.body } : request.body) });
      if ([401, 403].includes(response.status)) { outcome = "refused"; sessionLost(); return; } // settled below even if unmounted mid-flight
      // campaignRefuse (lib/onlyfans/campaign-route.ts) labels every definite refusal outcome "refused"; a bare or non-JSON status (a proxy 503) may follow a forwarded write.
      if ([400, 404, 409, 413, 503].includes(response.status) && (await response.json().catch(() => null))?.outcome === "refused") { outcome = "refused"; if (active.current) setNotice(response.status === 409 ? "The campaign changed or an account hold prevents this action. Review the refreshed details." : "The request was not accepted. Review the audience, schedule and account."); }
      else if (response.ok) {
        const ack = parseCampaignAck(await response.json(), { accountId, ...(request.kind === "change" ? { campaignId: request.campaignId, action: request.body.action, expectedRevision: request.body.expectedRevision } : {}) });
        if (ack) outcome = "ack";
        if (ack && active.current) { setSelected(ack.campaignId); selection.current = ack.campaignId;
          if (request.kind === "create") { setName(""); setBody(""); setScheduled(""); setFanIds(new Set()); setCatalogItemId(""); setFanQuery(""); forgetDraft(accountId); }
          setNotice(request.kind === "create" ? "Campaign saved. Recipient delivery is tracked below." : "Campaign change saved. Current delivery is being refreshed."); }
      }
    } catch { /* Keep exact original write identity for an explicit retry. */ }
    finally {
      const uncertain = create ? keys.settle(intent, outcome ?? "unconfirmed") : !outcome;
      // The oldest held create stays offered whatever this write was, so a brake used meanwhile never hides it.
      if (active.current && !sessionDenied.current) { setRetry(keys.pending().find(heldWrite) ?? (uncertain ? request : null)); if (uncertain) setNotice(UNCONFIRMED_TEXT); await read(); if (selection.current) await read(selection.current); setBusy(false); }
      sending.current = false;
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault(); if (busy || retry || denied || readOnly || !sender) return;
    let scheduledAt: string | null = null;
    try { scheduledAt = scheduled ? new Date(scheduled).toISOString() : null; } catch { setNotice("Choose a valid schedule."); return; }
    const create = { name, body, audience: audienceKind === "all_known" ? { kind: "all_known" as const } : { kind: "explicit" as const, conversationIds: [...fanIds].sort() }, scheduledAt,
      ...(catalogItemId ? { catalogItemId: Number(catalogItemId) } : {}) };
    // Validated before a key is taken, so a refused draft never leaves a held key behind.
    if (!validCampaignPayload(create)) { setNotice("Enter a name, message and at least one synchronized conversation. Messages may contain up to 20,000 UTF-8 bytes."); return; }
    void write({ kind: "create", body: create });
  }
  const locked = busy || !!retry || denied || readOnly;
  const campaign = detail?.campaign;
  const actionAllowed = (action: CampaignAction) => !!campaign && (action === "pause" ? ["scheduled", "running"].includes(campaign.status) : action === "resume" ? campaign.status === "paused" : !["cancelled", "completed"].includes(campaign.status));
  return <div className="space-y-5" data-of-campaign-manager>
    <Card className={twinRefresh ? "twin-campaign-compose" : "p-4"}><h2 className="font-semibold">New campaign</h2>
      <p data-of-campaign-sender className="mt-2 text-sm font-medium">{senderLine(sender)}</p>
      <p className="mt-1 text-xs leading-5 text-muted">Each recipient receives an individual message through the shared delivery queue. Pausing stops further recipients; an attempt already in progress may finish.</p>
      <form className="mt-4 space-y-4" onSubmit={submit}><fieldset disabled={locked} className="space-y-4">
        <label className="block text-sm font-medium">Campaign name<input className={`${inputClass} mt-1`} value={name} maxLength={128} onChange={event => setName(event.target.value)} required /></label>
        <label className="block text-sm font-medium">Message<textarea data-of-campaign-body className={`${inputClass} mt-1 min-h-28`} value={body} onChange={event => setBody(event.target.value)} required /><span className="mt-1 block text-xs font-normal text-muted">{new TextEncoder().encode(body).length.toLocaleString()} / 20,000 bytes</span></label>
        <div><label className="block text-sm font-medium">Attach saved paid content<select data-of-campaign-offer className={`${inputClass} mt-1`} value={catalogItemId} onChange={event => setCatalogItemId(event.target.value)}><option value="">Text only</option>{catalogue.filter(item => item.readiness === "terms_checked" && item.priceCents !== null && item.priceCents >= 300 && item.priceCents <= 20000).map(item => <option key={item.itemId} value={item.itemId}>{item.label} · {formatRecordedMoney(item.priceCents!, item.currency)}</option>)}</select></label><p className="mt-1 text-xs leading-5 text-muted">The saved item’s price, media and free previews are frozen when the campaign is created and checked again before delivery. Change saved prices from Content.</p>{catalogueError ? <p className="mt-2 text-xs text-muted" role="status">{catalogueError} Text campaigns remain available.</p> : null}{catalogueCursor || catalogueError ? <button type="button" className={`${buttonClass} mt-2`} disabled={locked || catalogueBusy} onClick={() => void loadCatalogue(catalogueCursor)}>{catalogueBusy ? "Loading…" : catalogueCursor ? "Load more content" : "Retry catalogue"}</button> : null}</div>
        <label className="block text-sm font-medium">Send time<input type="datetime-local" className={`${inputClass} mt-1 max-w-sm`} value={scheduled} onChange={event => setScheduled(event.target.value)} /><span className="mt-1 block text-xs font-normal text-muted">Leave empty to queue now. Scheduled times use your device timezone.</span></label>
        <div><h3 className="flex items-center gap-1 text-sm font-medium">Audience<Info text={POPULATION_HINT} /></h3><p className="mt-1 text-xs text-muted" data-of-campaign-population>{POPULATION_TEXT}</p><div className="mt-2 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name={`audience-${accountId}`} checked={audienceKind === "explicit"} onChange={() => setAudienceKind("explicit")} />Choose conversations</label>
          <label className="flex items-center gap-2"><input type="radio" name={`audience-${accountId}`} checked={audienceKind === "all_known"} onChange={() => setAudienceKind("all_known")} />{ALL_MODE_LABEL}<Info text={ALL_MODE_HINT} /></label></div>
          {audienceKind === "explicit" ? <div className="mt-3" data-of-campaign-audience>
            <input type="search" data-of-campaign-search aria-label="Search conversations" className={`${inputClass} mb-2`} placeholder="Search fan name, username or ID" maxLength={200} value={fanQuery} onChange={event => setFanQuery(event.target.value)} />
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted"><span data-of-campaign-selected>{fanIds.size.toLocaleString()} selected{fanIds.size >= AUDIENCE_LIMIT ? " (limit reached)" : ""}</span>
              <button type="button" className={`${buttonClass} !px-2 !py-1 !text-xs`} disabled={locked || !fans.length} onClick={() => setFanIds(previous => selectPage(previous, fans))}>Select this page</button>
              <button type="button" className={`${buttonClass} !px-2 !py-1 !text-xs`} disabled={locked || !fanIds.size} onClick={() => setFanIds(clearSelection())}>Clear</button></div>
            <div className="overflow-y-auto rounded-lg border border-line" style={{ maxHeight: "min(28rem, 60vh)" }}>{fans.map(fan => <label key={fan.conversationId} className="flex items-center gap-3 border-b border-line px-3 py-2 text-sm last:border-b-0"><input type="checkbox" data-of-campaign-recipient={fan.conversationId} checked={fanIds.has(fan.conversationId)} disabled={locked || (fanIds.size >= AUDIENCE_LIMIT && !fanIds.has(fan.conversationId))} onChange={event => setFanIds(previous => { const next = new Set(previous); event.target.checked ? next.add(fan.conversationId) : next.delete(fan.conversationId); return next; })} /><OnlyFansAvatar name={fan.fan.displayName} avatarUrl={fan.fan.avatarUrl} id={fan.fan.fanId} className="h-8 w-8 text-[11px]" /><span className="min-w-0 flex-1"><span className="block truncate">{fan.fan.displayName}</span><span className="block truncate text-xs text-muted">{fan.fan.username ? `@${fan.fan.username}` : fan.fan.shortRef}</span></span><span className="shrink-0 text-right text-xs text-muted">{fan.automationMode === "no_contact" ? <span className="block">No contact</span> : null}{ageText(fan.lastActivityAt)}</span></label>)}
              {!fans.length ? <p className="p-3 text-xs text-muted" role="status" data-of-campaign-audience-state={fansBusy ? "loading" : fanError ? "error" : fansLoaded ? "empty" : "idle"}>{fansBusy ? "Loading synchronized conversations…" : fanError ? "Conversations could not be loaded." : fansLoaded ? (appliedQuery ? "No synchronized conversation matches this search." : "No synchronized conversations yet for this account.") : "No conversations loaded."}</p> : null}</div>
            <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted" data-of-campaign-loaded>Showing {fans.length.toLocaleString()} loaded conversations{fanCursor ? ". More are available, load more to see them." : fansLoaded && !fanError ? ". That is every match." : "."}{lastSyncAt(fans) ? ` Last synchronized ${ageText(lastSyncAt(fans))}.` : ""}<Info text="Selected conversations stay selected while you search or load more pages. Total subscribers and eligible recipients are not known here." /></p>
            {fanError ? <p role="alert" className="mt-2 text-xs text-muted">{fanError}</p> : null}{fanCursor || fanError ? <button type="button" className={`${buttonClass} mt-2`} disabled={fansBusy || locked} onClick={() => void (fanCursor ? loadFans(fanCursor, appliedQuery) : loadFans(null, appliedQuery))}>{fansBusy ? "Loading…" : fanCursor ? "Load more conversations" : "Retry audience"}</button> : null}</div> : null}
        </div>
        <button data-of-create-campaign type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!canQueue({ accountId: sender ? accountId : null, locked, name, body, audienceKind, selected: fanIds.size })}>{busy ? "Saving…" : scheduled ? "Schedule campaign" : "Queue campaign"}</button>
      </fieldset></form>
      {twinRefresh && <aside className="twin-campaign-preview" aria-label="Campaign preview"><h3>Message preview</h3><p className="twin-help">OnlyFans · {name || "Untitled campaign"}</p><div className="twin-preview-bubble">{body || "Your message will appear here as you type."}</div><dl><div><dt>Saved content</dt><dd>{catalogue.find(item => item.itemId === catalogItemId)?.label || "Text only"}</dd></div><div><dt>Audience</dt><dd>{audienceKind === "explicit" ? `${fanIds.size} selected conversations` : "All synchronized conversations, up to 1,000 (refused above that)"}</dd></div><div><dt>Send time</dt><dd>{scheduled ? "Scheduled for your selected time" : "Queues when you submit"}</dd></div></dl><p className="twin-help">This preview does not send a message. Review the audience and send time before submitting.</p></aside>}
    </Card>
    {notice ? <div role="status" className="rounded-xl border border-line bg-elev p-4 text-sm" data-of-campaign-notice>{notice}{retry ? <button type="button" className={`${buttonClass} ml-3 bg-white`} disabled={busy} onClick={() => void write(retry)}>Retry same request</button> : null}</div> : null}
    <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Saved campaigns</h2><button className={buttonClass} disabled={busy || denied || loading} onClick={() => { void read(); if (selected) void read(selected); }}>Refresh</button></div>
    {loading ? <p role="status" className="text-sm text-muted">Loading campaigns…</p> : !listReady ? <p className="text-sm text-muted">Campaign history is unavailable.</p> : !campaigns.length ? <p className="text-sm text-muted">No campaigns are recorded for this account.</p> : <div className="grid gap-3 md:grid-cols-2">{campaigns.map(item => <button type="button" key={item.campaignId} onClick={() => setSelected(item.campaignId)} className={`min-w-0 rounded-xl border p-4 text-left ${selected === item.campaignId ? "border-accent bg-accent/5" : "border-line bg-white"}`} data-of-campaign={item.campaignId}><div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{item.name}</span><span className="rounded-full bg-elev px-2 py-1 text-xs capitalize text-muted">{item.status}</span></div><p className="mt-2 line-clamp-2 text-sm text-muted">{item.body}</p><p className="mt-3 text-xs text-muted">{item.recipientCount} recipients · {item.counts.accepted} accepted · {item.counts.unknown} uncertain</p><p className="mt-1 text-xs text-muted">Scheduled {when(item.scheduledAt)}</p></button>)}</div>}
    {truncated ? <p className="text-xs text-muted">Showing the latest 100 campaigns.</p> : null}
    {selected && !detail ? <p role="status" className="text-sm text-muted">Loading campaign detail…</p> : null}
    {campaign && detail ? <Card className="min-w-0 p-4" data-of-campaign-detail={campaign.campaignId}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{campaign.name}</h2><p className="mt-1 text-xs text-muted"><span data-of-campaign-status>{campaign.status}</span> · {campaign.recipientCount} saved recipients · Scheduled {when(campaign.scheduledAt)}</p></div><div className="flex flex-wrap gap-2">{CAMPAIGN_ACTIONS.filter(actionAllowed).map(action => <button type="button" key={action} className={buttonClass} disabled={busy || denied || readOnly} onClick={() => void write({ kind: "change", campaignId: campaign.campaignId, body: { action, expectedRevision: campaign.revision } })}>{action === "pause" ? "Pause" : action === "resume" ? "Resume" : "Cancel remaining"}</button>)}</div></div>
      <p className="mt-4 whitespace-pre-wrap break-words rounded-lg bg-elev p-3 text-sm">{campaign.body}</p>
      {campaign.offer ? <div className="mt-3 rounded-lg border border-line p-3 text-sm"><div className="font-semibold">{campaign.offer.label} · {formatRecordedMoney(campaign.offer.priceCents, campaign.offer.currency)}</div><p className="mt-1 text-xs text-muted">{campaign.offer.mediaIds.length} saved media · {campaign.offer.previewIds.length} free previews · Frozen catalogue terms</p></div> : null}
      <div className="mt-4 grid grid-cols-3 gap-2 lg:grid-cols-5">{RECIPIENT_STATUSES.map(status => <div key={status} className="rounded-lg border border-line p-3"><div className="text-xs text-muted">{LABELS[status]}</div><div className="mt-1 text-lg font-semibold">{campaign.counts[status]}</div></div>)}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-of-campaign-reporting>
        <div className="rounded-lg border border-line p-3"><div className="flex items-center gap-1 text-xs text-muted">Fans replied within 24h<Info text="Distinct recipients with an incoming message within 24 hours after their accepted campaign send. This measures responses after sending; it does not prove the campaign caused them. Unavailable until conversation history is current." /></div><div className="mt-1 text-lg font-semibold">{campaign.reporting.replies ?? "Unavailable"}</div></div>
        <div className="rounded-lg border border-line p-3"><div className="flex items-center gap-1 text-xs text-muted">Linked purchases<Info text="Purchases linked by exact provider message evidence to this campaign’s paid sends. Includes pending payouts. Other spending by these fans is excluded." /></div><div className="mt-1 text-lg font-semibold">{campaign.reporting.purchases ?? "Unavailable"}</div></div>
        <div className="rounded-lg border border-line p-3"><div className="flex items-center gap-1 text-xs text-muted">Cleared gross revenue<Info text="USD gross amount of exact linked purchases with cleared payout status. Refunded, charged-back and pending transactions are excluded. Platform fees are not deducted." /></div><div className="mt-1 text-lg font-semibold">{campaign.reporting.revenueCents === null ? "Unavailable" : formatRecordedMoney(campaign.reporting.revenueCents, "USD")}</div></div>
        <div className="rounded-lg border border-line p-3"><div className="flex items-center gap-1 text-xs text-muted">Refunded purchases<Info text="Exact linked purchases currently recorded as refunded or charged back." /></div><div className="mt-1 text-lg font-semibold">{campaign.reporting.refundedPurchases ?? "Unavailable"}</div></div>
      </div>
      <div className="mt-3 flex items-center gap-1 text-xs text-muted">{campaign.reporting.ledgerAsOf ? `Payment data checked ${when(campaign.reporting.ledgerAsOf)}` : "Payment reporting needs current, verified purchase evidence."}<Info text="Accepted delivery is not an open or purchase. Missing, stale or ambiguous purchase data remains unavailable. Open tracking is not exposed." /></div>
      <div className="mt-4 max-h-96 overflow-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-line text-muted"><th className="p-2">Conversation</th><th className="p-2">Delivery</th><th className="p-2">Detail</th></tr></thead><tbody>{detail.recipients.map(recipient => <tr key={recipient.conversationId} className="border-b border-line"><td className="break-all p-2">{recipient.conversationId}</td><td className="p-2">{LABELS[recipient.status]}</td><td className="max-w-xs break-words p-2 text-muted">{reasonText(recipient.reason, recipient.providerMessageId)}</td></tr>)}</tbody></table></div>
    </Card> : null}
  </div>;
}

