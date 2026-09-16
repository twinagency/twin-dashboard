"use client";

import React, { useMemo, useState, useTransition } from "react";
import { Activity, AlertTriangle, Building2, Check, CircleCheck, Link2, PencilLine, Search, ShieldCheck, UserRound } from "lucide-react";
import { resolveCrmMappingConflictAction, setCrmCreatorBindingAction, updateCrmCreatorAction } from "@/app/actions/crm-foundation";
import { Field, FieldLabel, Info, selectCls } from "@/components/clone/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { crmFoundationSummary, type CrmCreatorView, type CrmFoundationReferences, type CrmFoundationResult } from "@/lib/crm-foundation-model";

type MappingFilter = "all" | CrmCreatorView["mappingStatus"];
type MutationResult = { ok: true } | { ok: false; error: { code?: string; message: string } };
type OperatorConflict = { id: string; revision?: number | null; conflictType?: string; conflictTypeLabel?: string; detectedAt?: string | null };
type OperatorActivity = { id: string; eventType?: string; eventLabel?: string; status?: string; occurredAt?: string | null };
type OperatorCreator = CrmCreatorView & {
  revision?: number;
  bindingRevision?: number;
  creatorAccountId?: string | null;
  cloneId?: string | null;
  binding?: { revision?: number; creatorAccountId?: string | null; cloneId?: string | null } | null;
  conflict?: OperatorConflict | null;
  mappingConflict?: OperatorConflict | null;
  conflicts?: OperatorConflict[];
};
type OperatorResult = CrmFoundationResult & { activity?: OperatorActivity[]; activities?: OperatorActivity[]; activityEvents?: OperatorActivity[]; references?: CrmFoundationReferences };

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
const dateLabel = (value: string | null | undefined) => {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(value));
};
const mappingBadgeClass = (status: CrmCreatorView["mappingStatus"]) => status === "resolved" ? "border-good/25 bg-good/10 text-good" : status === "conflict" ? "border-warn/30 bg-warn/10 text-warn" : "border-line bg-elev text-muted";
const connectionDotClass = (status: CrmCreatorView["connections"][number]["displayStatus"]) => status === "connected" ? "bg-good" : status === "authentication_required" ? "bg-warn" : status === "sync_issue" ? "bg-crit" : "bg-muted";
const creatorRevision = (creator: OperatorCreator) => typeof creator.revision === "number" ? creator.revision : null;
const bindingRevision = (creator: OperatorCreator) => typeof creator.bindingRevision === "number" ? creator.bindingRevision : typeof creator.binding?.revision === "number" ? creator.binding.revision : null;
const creatorAccountId = (creator: OperatorCreator) => creator.creatorAccountId ?? creator.binding?.creatorAccountId ?? null;
const cloneId = (creator: OperatorCreator) => creator.cloneId ?? creator.binding?.cloneId ?? creator.twin?.id ?? null;
const conflictsFor = (creator: OperatorCreator) => {
  const conflicts: OperatorConflict[] = [...creator.mappingConflicts, ...(creator.conflicts ?? [])];
  for (const conflict of [creator.mappingConflict, creator.conflict]) if (conflict && !conflicts.some((item) => item.id === conflict.id)) conflicts.push(conflict);
  return conflicts;
};
const activityFor = (result: OperatorResult) => result.activityEvents ?? result.activities ?? result.activity ?? [];

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <Card className="gap-0 rounded-xl border border-line py-0 shadow-[var(--shadow-card)]"><CardContent className="flex items-center justify-between px-4 py-4"><div><div className="font-mono text-2xl font-semibold tabular-nums text-ink">{value}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">{label}</div></div><div className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-elev text-accent">{icon}</div></CardContent></Card>;
}

function OperatorForm({ run, submitLabel, disabled = false, className = "space-y-3", children }: { run: (formData: FormData) => Promise<MutationResult>; submitLabel: string; disabled?: boolean; className?: string; children: React.ReactNode }) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "good" | "bad"; message: string } | null>(null);
  return (
    <form className={className} onSubmit={(event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      setFeedback(null);
      startTransition(async () => {
        try {
          const result = await run(formData);
          if (!result.ok) return setFeedback({ tone: "bad", message: result.error.message });
          setFeedback({ tone: "good", message: "Saved" });
          window.location.reload();
        } catch {
          setFeedback({ tone: "bad", message: "The change could not be saved. Refresh and try again." });
        }
      });
    }}>
      {children}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={disabled || pending}>{pending ? "Saving" : submitLabel}</Button>
        {feedback ? <span className={`flex items-center gap-1 text-xs font-semibold ${feedback.tone === "good" ? "text-good" : "text-crit"}`} role="status">{feedback.tone === "good" ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}{feedback.message}</span> : null}
      </div>
    </form>
  );
}

function RevisionGate({ available }: { available: boolean }) {
  if (available) return null;
  return <div className="flex items-center gap-2 rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-xs font-medium text-warn"><AlertTriangle className="h-3.5 w-3.5" />Reload after the Sprint 2 migration to enable safe writes.</div>;
}

function ReferenceSelect({ name, label, hint, value, options, emptyLabel }: { name: string; label: string; hint: string; value: string | null; options: CrmFoundationReferences["clones"]; emptyLabel: string }) {
  return <label className="block min-w-0"><FieldLabel label={label} hint={hint} /><select name={name} defaultValue={value ?? ""} className={selectCls}><option value="">{emptyLabel}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}{option.detail ? ` (${option.detail})` : ""}</option>)}</select></label>;
}

function CreatorOperations({ creator, references }: { creator: OperatorCreator; references?: CrmFoundationReferences }) {
  const recordRevision = creatorRevision(creator);
  const linkRevision = bindingRevision(creator);
  const conflicts = conflictsFor(creator);
  const mappingBlocked = creator.status === "mapping_conflict" || creator.mappingStatus === "conflict" || conflicts.length > 0;
  return (
    <Card className="gap-0 rounded-xl border border-line py-0 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-elev/45 px-4 py-3">
        <div><div className="flex items-center gap-2"><PencilLine className="h-4 w-4 text-accent" /><h2 className="font-semibold text-ink">Manage {creator.displayName}</h2></div><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted"><span>{creator.agency?.name ?? "No agency"}</span><span aria-hidden="true">/</span><span>{creator.twin?.name ?? "No Twin linked"}</span></div></div>
        <Badge variant="outline" className={`rounded-md ${mappingBadgeClass(creator.mappingStatus)}`}>{creator.mappingStatusLabel}</Badge>
      </div>
      <div className="grid xl:grid-cols-2">
        <section className="border-b border-line p-4 xl:border-b-0 xl:border-r">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-muted">Canonical record<Info text="Changes the shared creator label and operating state. It does not alter a creator login or channel credentials." /></h3>
          <OperatorForm run={updateCrmCreatorAction} submitLabel="Save creator" disabled={recordRevision === null || mappingBlocked || creator.mappingStatus !== "resolved" || !creator.agency}>
            <input type="hidden" name="creator_id" value={creator.id} /><input type="hidden" name="revision" value={recordRevision ?? ""} />
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Display name" name="display_name" defaultValue={creator.displayName} required /><label className="block min-w-0"><FieldLabel label="Status" hint="Archived records retain history. Paused records stay visible but are not considered active." /><select name="status" defaultValue={creator.status} className={selectCls}>{creator.status === "mapping_conflict" ? <option value="mapping_conflict" disabled>Mapping conflict</option> : null}<option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option></select></label></div>
            {mappingBlocked ? <div className="flex items-center gap-2 rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-xs font-medium text-warn"><AlertTriangle className="h-3.5 w-3.5" />Resolve every open mapping conflict before editing the canonical record.</div> : null}
            {!mappingBlocked && (creator.mappingStatus !== "resolved" || !creator.agency) ? <div className="flex items-center gap-2 rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-xs font-medium text-warn"><AlertTriangle className="h-3.5 w-3.5" />Assign and save a valid agency binding before editing the canonical record.</div> : null}
            <RevisionGate available={recordRevision !== null} />
          </OperatorForm>
        </section>
        <section className="border-b border-line p-4 xl:border-b-0">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-muted">Identity binding<Info text="Links this canonical creator to one existing creator account and one existing Twin. IDs must refer to real records in the current agency scope." /></h3>
          <OperatorForm run={setCrmCreatorBindingAction} submitLabel="Save binding" disabled={linkRevision === null || mappingBlocked}>
            <input type="hidden" name="creator_id" value={creator.id} /><input type="hidden" name="revision" value={linkRevision ?? ""} />
            <div className="grid gap-3 sm:grid-cols-3">{references ? <><ReferenceSelect name="agency_id" label="Agency" hint="Claims an unbound creator or confirms the existing agency scope." value={creator.agency?.id ?? null} options={references.agencies} emptyLabel="Select agency" /><ReferenceSelect name="creator_account_id" label="Creator account" hint="Select an existing account, or choose no account to unlink it." value={creatorAccountId(creator)} options={references.creatorAccounts} emptyLabel="No creator account" /><ReferenceSelect name="clone_id" label="Twin clone" hint="Select an existing Twin, or choose no Twin to unlink it." value={cloneId(creator)} options={references.clones} emptyLabel="No Twin clone" /></> : <><Field label="Agency ID" name="agency_id" defaultValue={creator.agency?.id} required hint="Advanced control. Paste an existing agency UUID." /><Field label="Creator account ID" name="creator_account_id" defaultValue={creatorAccountId(creator)} placeholder="Leave blank to unlink" hint="Advanced control. Paste an existing creator account UUID." /><Field label="Twin clone ID" name="clone_id" defaultValue={cloneId(creator)} placeholder="Leave blank to unlink" hint="Advanced control. Paste an existing Twin clone UUID." /></>}</div>
            {mappingBlocked ? <div className="flex items-center gap-2 rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-xs font-medium text-warn"><AlertTriangle className="h-3.5 w-3.5" />Use the conflict decision below so the verified links and audit decision are saved together.</div> : null}
            <RevisionGate available={linkRevision !== null} />
          </OperatorForm>
        </section>
      </div>
      {mappingBlocked ? (
        <section className="border-t border-line bg-warn/[0.035] p-4">
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-warn">Mapping conflict<Info text="Resolve only after checking the creator account, Twin and agency belong to the same person. Every decision is written to the audit ledger." /></h3>
          {creator.mappingWarning ? <div className="mt-2 text-sm font-medium text-ink">{creator.mappingWarning}</div> : null}
          {conflicts.length > 1 ? <div className="mt-2 text-xs font-medium text-muted">Resolve one review at a time. The registry reloads after each decision so the next review uses the latest binding revision.</div> : null}
          {conflicts.length ? <div className="mt-3 grid gap-3">{conflicts.map((conflict) => {
            const revision = typeof conflict.revision === "number" ? conflict.revision : null;
            return <div key={conflict.id} className="rounded-lg border border-warn/25 bg-panel p-3"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><div className="font-semibold text-ink">{conflict.conflictTypeLabel ?? conflict.conflictType?.replaceAll("_", " ") ?? "Identity mapping review"}</div><div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">Detected {dateLabel(conflict.detectedAt)}</div></div><Badge variant="outline" className="border-warn/30 bg-warn/10 text-warn">Open</Badge></div>
              <OperatorForm run={resolveCrmMappingConflictAction} submitLabel="Resolve mapping" disabled={revision === null || linkRevision === null}>
                <input type="hidden" name="conflict_id" value={conflict.id} /><input type="hidden" name="revision" value={revision ?? ""} /><input type="hidden" name="binding_revision" value={linkRevision ?? ""} /><input type="hidden" name="resolution_status" value="resolved" />
                <div className="grid gap-3 sm:grid-cols-2"><Field label="Resolution note" name="resolution_note" placeholder="Reason for this verified decision" required />{references ? <><ReferenceSelect name="agency_id" label="Agency" hint="Verified agency for this creator." value={creator.agency?.id ?? null} options={references.agencies} emptyLabel="Select agency" /><ReferenceSelect name="creator_account_id" label="Creator account" hint="Verified creator account for this identity." value={creatorAccountId(creator)} options={references.creatorAccounts} emptyLabel="No creator account" /><ReferenceSelect name="clone_id" label="Twin clone" hint="Verified Twin for this identity." value={cloneId(creator)} options={references.clones} emptyLabel="No Twin clone" /></> : <><Field label="Agency ID" name="agency_id" defaultValue={creator.agency?.id} /><Field label="Creator account ID" name="creator_account_id" defaultValue={creatorAccountId(creator)} /><Field label="Twin clone ID" name="clone_id" defaultValue={cloneId(creator)} /></>}</div>
                <RevisionGate available={revision !== null && linkRevision !== null} />
              </OperatorForm>
            </div>;
          })}</div> : <div className="mt-3 rounded-lg border border-warn/25 bg-panel px-3 py-2 text-xs font-medium text-warn">Conflict details are not loaded. Refresh after the Sprint 2 migration before resolving this mapping.</div>}
        </section>
      ) : null}
    </Card>
  );
}

function ActivityPanel({ result }: { result: OperatorResult }) {
  const events = activityFor(result).slice(0, 10);
  return (
    <Card className="gap-0 rounded-xl border border-line py-0 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3"><Activity className="h-4 w-4 text-accent" /><h2 className="font-semibold text-ink">Operator activity</h2><Info text="Append-only audit events for creator, binding, connection and conflict changes. Provider credentials are never included." /></div>
      {events.length ? <div className="divide-y divide-line">{events.map((event) => <div key={event.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(10rem,1fr)_minmax(8rem,0.7fr)_auto] sm:items-center"><div className="text-sm font-semibold text-ink">{event.eventLabel ?? event.eventType?.replaceAll("_", " ") ?? "Registry change"}</div><div className="text-xs capitalize text-muted">{event.status ?? "recorded"}</div><div className="font-mono text-[11px] text-muted sm:text-right">{dateLabel(event.occurredAt)}</div></div>)}</div> : <div className="flex min-h-28 items-center justify-center px-6 py-8 text-sm text-muted">No operator mutations recorded in this view yet.</div>}
    </Card>
  );
}

function UnavailableState({ result }: { result: Extract<CrmFoundationResult, { status: "unavailable" }> }) {
  return <Card className="rounded-xl border border-line py-0 shadow-[var(--shadow-card)]"><CardContent className="flex min-h-56 flex-col items-center justify-center px-6 py-12 text-center"><div className="grid h-11 w-11 place-items-center rounded-lg border border-warn/25 bg-warn/10 text-warn"><AlertTriangle className="h-5 w-5" /></div><h2 className="mt-4 text-base font-semibold text-ink">{result.reason === "not_migrated" ? "Foundation not applied" : "Registry unavailable"}</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted">{result.message}</p></CardContent></Card>;
}

export default function CreatorRegistry({ result, canManage = false }: { result: CrmFoundationResult; canManage?: boolean }) {
  const [query, setQuery] = useState("");
  const [mapping, setMapping] = useState<MappingFilter>("all");
  const [channel, setChannel] = useState("all");
  const creators = (result.status === "available" ? result.creators : []) as OperatorCreator[];
  const [selectedId, setSelectedId] = useState<string | null>(creators[0]?.id ?? null);
  const summary = useMemo(() => crmFoundationSummary(creators), [creators]);
  const channels = useMemo(() => [...new Set(creators.flatMap((creator) => creator.connections.map((connection) => connection.provider)))].sort(), [creators]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return creators.filter((creator) => {
      const haystack = [creator.displayName, creator.agency?.name, creator.twin?.name, creator.twin?.slug, ...creator.connections.map((connection) => `${connection.providerLabel} ${connection.accountLabel ?? ""}`)].filter(Boolean).join(" ").toLowerCase();
      return (!needle || haystack.includes(needle)) && (mapping === "all" || creator.mappingStatus === mapping) && (channel === "all" || creator.connections.some((connection) => connection.provider === channel));
    });
  }, [channel, creators, mapping, query]);
  const selected = creators.find((creator) => creator.id === selectedId) ?? filtered[0] ?? null;
  if (result.status === "unavailable") return <UnavailableState result={result} />;

  return (
    <div data-crm-foundation="creator-registry" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Canonical creators" value={summary.creators} icon={<UserRound className="h-4 w-4" />} /><Metric label="Recorded connected" value={summary.connected} icon={<Link2 className="h-4 w-4" />} /><Metric label="Connection attention" value={summary.attention} icon={<AlertTriangle className="h-4 w-4" />} /><Metric label="Mapping warnings" value={summary.mappingWarnings} icon={<ShieldCheck className="h-4 w-4" />} /></div>
      <Card className="gap-0 rounded-xl border border-line py-0 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 lg:flex-row lg:items-center lg:justify-between"><div className="relative w-full lg:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search creator, agency, Twin or channel" aria-label="Search creator registry" className="h-9 bg-panel pl-9" /></div><div className="flex flex-wrap gap-2"><label className="sr-only" htmlFor="registry-mapping-filter">Mapping status</label><select id="registry-mapping-filter" value={mapping} onChange={(event) => setMapping(event.target.value as MappingFilter)} className="h-9 rounded-lg border border-line bg-panel px-3 text-sm font-medium text-ink outline-none focus:border-accent-2"><option value="all">All mappings</option><option value="resolved">Resolved</option><option value="conflict">Needs review</option><option value="unbound">Not assigned</option><option value="unknown">Unverified</option></select><label className="sr-only" htmlFor="registry-channel-filter">Channel</label><select id="registry-channel-filter" value={channel} onChange={(event) => setChannel(event.target.value)} className="h-9 rounded-lg border border-line bg-panel px-3 text-sm font-medium text-ink outline-none focus:border-accent-2"><option value="all">All channels</option>{channels.map((provider) => <option key={provider} value={provider}>{creators.flatMap((creator) => creator.connections).find((item) => item.provider === provider)?.providerLabel ?? provider}</option>)}</select></div></div>
        {creators.length === 0 ? <div className="flex min-h-56 flex-col items-center justify-center px-6 py-12 text-center"><UserRound className="h-6 w-6 text-muted" /><h2 className="mt-3 text-base font-semibold text-ink">No canonical creators yet</h2><p className="mt-1 text-sm text-muted">The registry is ready. No creator records have been mapped.</p></div> : filtered.length === 0 ? <div className="flex min-h-40 items-center justify-center px-6 py-10 text-sm text-muted">No creators match the current filters.</div> : (
          <Table><TableHeader><TableRow className="bg-elev/65 hover:bg-elev/65"><TableHead className="h-9 px-4 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Creator</TableHead><TableHead className="h-9 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Agency</TableHead><TableHead className="h-9 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Twin identity</TableHead><TableHead className="h-9 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Channels</TableHead><TableHead className="h-9 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Mapping</TableHead><TableHead className="h-9 pr-4 text-right text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{canManage ? "Action" : "Updated"}</TableHead></TableRow></TableHeader><TableBody>{filtered.map((creator) => <TableRow key={creator.id} className={canManage && selected?.id === creator.id ? "bg-accent/[0.035]" : "hover:bg-elev/35"}>
            <TableCell className="px-4 py-3"><div className="flex items-center gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-xs font-bold text-white">{initials(creator.displayName)}</div><div className="min-w-0"><div className="max-w-52 truncate font-semibold text-ink">{creator.displayName}</div><div className="mt-0.5 text-xs text-muted">{creator.statusLabel}</div></div></div></TableCell>
            <TableCell className="py-3">{creator.agency ? <div className="flex items-center gap-2 text-sm font-medium text-ink"><Building2 className="h-4 w-4 text-muted" />{creator.agency.name}</div> : <span className="text-sm text-muted">Not assigned</span>}</TableCell>
            <TableCell className="py-3">{creator.twin ? <div><div className="font-medium text-ink">{creator.twin.name}</div><div className="mt-0.5 text-xs text-muted">{creator.twin.status}</div></div> : <span className="text-sm text-muted">No Twin linked</span>}</TableCell>
            <TableCell className="py-3">{creator.connections.length ? <div className="flex max-w-72 flex-wrap gap-1.5">{creator.connections.map((connection) => <Badge key={connection.id} variant="outline" title={connection.displayStatusLabel} className="h-6 gap-1.5 rounded-md border-line bg-panel text-ink"><span className={`h-1.5 w-1.5 rounded-full ${connectionDotClass(connection.displayStatus)}`} />{connection.providerLabel}</Badge>)}</div> : <span className="text-sm text-muted">No connections</span>}</TableCell>
            <TableCell className="py-3"><Badge variant="outline" className={`h-6 rounded-md ${mappingBadgeClass(creator.mappingStatus)}`}>{creator.mappingStatus === "resolved" ? <CircleCheck className="h-3 w-3" /> : null}{creator.mappingStatus === "conflict" ? <AlertTriangle className="h-3 w-3" /> : null}{creator.mappingStatusLabel}</Badge></TableCell>
            <TableCell className="py-3 pr-4 text-right">{canManage ? <Button type="button" size="sm" variant={selected?.id === creator.id ? "secondary" : "outline"} onClick={() => setSelectedId(creator.id)}>Manage</Button> : <span className="font-mono text-xs text-muted">{dateLabel(creator.updatedAt)}</span>}</TableCell>
          </TableRow>)}</TableBody></Table>
        )}
      </Card>
      {canManage && selected ? <CreatorOperations creator={selected} references={(result as OperatorResult).references} /> : null}
      {canManage ? <ActivityPanel result={result as OperatorResult} /> : null}
    </div>
  );
}
