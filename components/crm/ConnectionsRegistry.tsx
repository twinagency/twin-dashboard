"use client";

import React, { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Cable, Check, CircleOff, KeyRound, Link2, Plus, RefreshCcw, Search, ServerCog, ShieldAlert } from "lucide-react";
import { disconnectCrmChannelConnectionAction, upsertCrmChannelConnectionAction } from "@/app/actions/crm-foundation";
import { Field, FieldLabel, Info, selectCls } from "@/components/clone/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { crmFoundationSummary, type CrmConnectionDisplayStatus, type CrmCreatorView, type CrmFoundationResult } from "@/lib/crm-foundation-model";

type StatusFilter = "all" | CrmConnectionDisplayStatus;
type MutationResult = { ok: true } | { ok: false; error: { code?: string; message: string } };
type OperatorConnection = CrmCreatorView["connections"][number] & { revision?: number | null; handle?: string | null; displayName?: string | null };
const PROVIDERS = [
  ["telegram", "Telegram"],
  ["onlyfans", "OnlyFans"],
  ["fanvue", "Fanvue"],
  ["fansly", "Fansly"],
  ["mym", "MYM"],
] as const;

const statusStyle = (status: CrmConnectionDisplayStatus) => status === "connected" ? "border-good/25 bg-good/10 text-good" : status === "authentication_required" ? "border-warn/30 bg-warn/10 text-warn" : status === "sync_issue" ? "border-crit/25 bg-crit/10 text-crit" : "border-line bg-elev text-muted";
const StatusIcon = ({ status }: { status: CrmConnectionDisplayStatus }) => status === "connected" ? <Check className="h-3.5 w-3.5" /> : status === "authentication_required" ? <KeyRound className="h-3.5 w-3.5" /> : status === "sync_issue" ? <RefreshCcw className="h-3.5 w-3.5" /> : <CircleOff className="h-3.5 w-3.5" />;
const activityLabel = (value: string | null) => !value ? "No verification recorded" : `Verified ${new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value))}`;

function OperatorForm({ run, submitLabel, disabled = false, confirmMessage, variant = "default", className = "space-y-3", children }: { run: (formData: FormData) => Promise<MutationResult>; submitLabel: string; disabled?: boolean; confirmMessage?: string; variant?: "default" | "outline" | "destructive"; className?: string; children: React.ReactNode }) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "good" | "bad"; message: string } | null>(null);
  return <form className={className} onSubmit={(event) => {
    event.preventDefault();
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    const data = new FormData(event.currentTarget);
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await run(data);
        if (!result.ok) return setFeedback({ tone: "bad", message: result.error.message });
        setFeedback({ tone: "good", message: "Saved" });
        window.location.reload();
      } catch {
        setFeedback({ tone: "bad", message: "The change could not be saved. Refresh and try again." });
      }
    });
  }}>{children}<div className="flex flex-wrap items-center gap-2"><Button type="submit" variant={variant} disabled={disabled || pending}>{pending ? "Saving" : submitLabel}</Button>{feedback ? <span className={`flex items-center gap-1 text-xs font-semibold ${feedback.tone === "good" ? "text-good" : "text-crit"}`} role="status">{feedback.tone === "good" ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}{feedback.message}</span> : null}</div></form>;
}

function RevisionGate({ available }: { available: boolean }) {
  return available ? null : <div className="flex items-center gap-2 rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-xs font-medium text-warn"><AlertTriangle className="h-3.5 w-3.5" />Reload after the Sprint 2 migration to enable safe writes.</div>;
}

function ConnectionStatusFields({ connection }: { connection?: OperatorConnection }) {
  const metadataOnly = Boolean(connection && connection.provider !== "telegram");
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <Field label="Account label" name="display_name" defaultValue={connection?.displayName ?? connection?.accountLabel} placeholder="Internal account label" />
    <Field label="Handle" name="handle" defaultValue={connection?.handle} placeholder="@handle" />
    <label className="block min-w-0"><FieldLabel label="Connection state" hint={metadataOnly ? "Recorded metadata only. This does not authenticate or activate the provider adapter." : "Recorded health state for this Telegram connection."} /><select name="connection_status" defaultValue={connection?.connectionStatus ?? "unknown"} className={selectCls}><option value="unknown">Unknown</option><option value="auth_required">Authentication required</option><option value="connected">{metadataOnly ? "Recorded connected, metadata only" : "Connected"}</option><option value="degraded">Degraded</option><option value="disconnected">Disconnected</option><option value="unavailable">Unavailable</option></select></label>
    <label className="block min-w-0"><FieldLabel label="Sync state" hint={metadataOnly ? "Manual registry state. No live sync is started from this control." : "Recorded Telegram sync state."} /><select name="sync_status" defaultValue={connection?.syncStatus ?? "unknown"} className={selectCls}><option value="unknown">Unknown</option><option value="idle">Idle</option><option value="syncing">Syncing</option><option value="current">Current</option><option value="error">Error</option><option value="unavailable">Unavailable</option></select></label>
    <Field label="Last verified (ISO)" name="last_verified_at" defaultValue={connection?.lastVerifiedAt} placeholder="2026-09-16T00:00:00Z" hint="Optional ISO 8601 time. Keeping the timezone avoids shifting the recorded moment." />
    <Field label="Last synced (ISO)" name="last_synced_at" defaultValue={connection?.lastSyncedAt} placeholder="2026-09-16T00:00:00Z" hint="Optional ISO 8601 time. Keeping the timezone avoids shifting the recorded moment." />
  </div>;
}

function NewConnection({ creators }: { creators: CrmCreatorView[] }) {
  const [provider, setProvider] = useState("telegram");
  return <Card className="gap-0 rounded-xl border border-line py-0 shadow-[var(--shadow-card)]"><div className="flex items-center gap-2 border-b border-line px-4 py-3"><Plus className="h-4 w-4 text-accent" /><h2 className="font-semibold text-ink">Add connection record</h2><Info text="Creates a credential-free registry record. Only Telegram has an active runtime adapter in this sprint." /></div><div className="p-4"><OperatorForm run={upsertCrmChannelConnectionAction} submitLabel="Add connection" disabled={creators.length === 0}>
    <input type="hidden" name="revision" value="0" />
    <div className="grid gap-3 sm:grid-cols-2"><label className="block min-w-0"><FieldLabel label="Creator" /><select name="creator_id" required className={selectCls} defaultValue={creators[0]?.id ?? ""}>{creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.displayName}</option>)}</select></label><label className="block min-w-0"><FieldLabel label="Provider" hint="Platforms other than Telegram are metadata records until a verified adapter is implemented." /><select name="provider" value={provider} onChange={(event) => setProvider(event.target.value)} className={selectCls}>{PROVIDERS.map(([value, label]) => <option key={value} value={value}>{label}{value === "telegram" ? "" : " (metadata only)"}</option>)}</select></label></div>
    <ConnectionStatusFields />
    {provider !== "telegram" ? <div className="flex items-center gap-2 rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-xs font-medium text-warn"><ShieldAlert className="h-3.5 w-3.5" />This records operational metadata. It does not connect to, authenticate with, sync from or send through {PROVIDERS.find(([value]) => value === provider)?.[1]}.</div> : null}
  </OperatorForm></div></Card>;
}

function UnavailableConnections({ result }: { result: Extract<CrmFoundationResult, { status: "unavailable" }> }) {
  return <Card className="rounded-xl border border-line py-0 shadow-[var(--shadow-card)]"><CardContent className="flex min-h-56 flex-col items-center justify-center px-6 py-12 text-center"><div className="grid h-11 w-11 place-items-center rounded-lg border border-warn/25 bg-warn/10 text-warn"><AlertTriangle className="h-5 w-5" /></div><h2 className="mt-4 text-base font-semibold text-ink">{result.reason === "not_migrated" ? "Foundation not applied" : "Connections unavailable"}</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted">{result.message}</p></CardContent></Card>;
}

function ConnectionRow({ connection, canManage }: { connection: OperatorConnection; canManage: boolean }) {
  const revision = typeof connection.revision === "number" ? connection.revision : null;
  const metadataOnly = connection.provider !== "telegram";
  return <div className="border-t border-line px-4 py-4 first:border-t-0">
    <div className="grid gap-4 lg:grid-cols-[minmax(9rem,0.8fr)_minmax(12rem,1fr)_minmax(16rem,1.35fr)_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><div className="font-semibold text-ink">{connection.providerLabel}</div>{metadataOnly ? <Badge variant="outline" className="h-5 rounded border-line bg-elev px-1.5 text-[10px] text-muted">Registry only</Badge> : null}</div><div className="mt-1 max-w-56 truncate text-xs text-muted">{connection.accountLabel ?? "Account label unavailable"}</div></div><div><Badge variant="outline" className={`h-7 rounded-md px-2.5 ${statusStyle(connection.displayStatus)}`}><StatusIcon status={connection.displayStatus} />{metadataOnly ? `Recorded: ${connection.displayStatusLabel}` : connection.displayStatusLabel}</Badge><div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">Sync: {connection.syncStatus.replaceAll("_", " ")}</div></div><div>{connection.capabilities.length ? <div className="flex flex-wrap gap-1.5">{connection.capabilities.map((capability) => <Badge key={capability.capability} variant="outline" title={capability.detail ?? capability.stateLabel} className={`h-6 rounded-md border-line bg-panel ${capability.state === "supported" ? "text-ink" : capability.state === "degraded" ? "text-warn" : "text-muted"}`}><span className={`h-1.5 w-1.5 rounded-full ${capability.state === "supported" ? "bg-good" : capability.state === "degraded" ? "bg-warn" : "bg-muted"}`} />{capability.label}</Badge>)}</div> : <span className="text-sm text-muted">Capabilities not recorded</span>}</div><div className="font-mono text-xs text-muted lg:text-right">{activityLabel(connection.lastVerifiedAt)}</div></div>
    {canManage ? <details className="mt-3 rounded-lg border border-line bg-bg/40"><summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-ink">Manage connection</summary><div className="border-t border-line p-3"><OperatorForm run={upsertCrmChannelConnectionAction} submitLabel="Save connection" disabled={revision === null}><input type="hidden" name="creator_id" value={connection.creatorId} /><input type="hidden" name="provider" value={connection.provider} /><input type="hidden" name="revision" value={revision ?? ""} /><ConnectionStatusFields connection={connection} />{metadataOnly ? <div className="flex items-center gap-2 rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-xs font-medium text-warn"><ShieldAlert className="h-3.5 w-3.5" />Status and timestamps are registry metadata only. No provider adapter is activated.</div> : null}<RevisionGate available={revision !== null} /></OperatorForm><div className="mt-4 border-t border-line pt-3"><OperatorForm run={disconnectCrmChannelConnectionAction} submitLabel="Mark disconnected" variant="destructive" disabled={revision === null} confirmMessage={`Mark the ${connection.providerLabel} record as disconnected?`} className="space-y-2"><input type="hidden" name="creator_id" value={connection.creatorId} /><input type="hidden" name="provider" value={connection.provider} /><input type="hidden" name="revision" value={revision ?? ""} /></OperatorForm></div></div></details> : null}
  </div>;
}

export default function ConnectionsRegistry({ result, canManage = false }: { result: CrmFoundationResult; canManage?: boolean }) {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const creators = result.status === "available" ? result.creators : [];
  const summary = useMemo(() => crmFoundationSummary(creators), [creators]);
  const providers = useMemo(() => [...new Map(creators.flatMap((creator) => creator.connections).map((connection) => [connection.provider, connection.providerLabel])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [creators]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return creators.map((creator) => ({ ...creator, connections: creator.connections.filter((connection) => (provider === "all" || connection.provider === provider) && (status === "all" || connection.displayStatus === status) && (!needle || `${creator.displayName} ${creator.agency?.name ?? ""} ${connection.providerLabel} ${connection.accountLabel ?? ""}`.toLowerCase().includes(needle))) })).filter((creator) => creator.connections.length > 0);
  }, [creators, provider, query, status]);
  if (result.status === "unavailable") return <UnavailableConnections result={result} />;
  return <div data-crm-foundation="connections-registry" className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3"><Card className="gap-0 rounded-xl border border-line py-0 shadow-[var(--shadow-card)]"><CardContent className="flex items-center justify-between px-4 py-4"><div><div className="font-mono text-2xl font-semibold tabular-nums text-ink">{summary.totalConnections}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">Connections</div></div><Cable className="h-5 w-5 text-accent" /></CardContent></Card><Card className="gap-0 rounded-xl border border-line py-0 shadow-[var(--shadow-card)]"><CardContent className="flex items-center justify-between px-4 py-4"><div><div className="font-mono text-2xl font-semibold tabular-nums text-ink">{summary.connected}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">Recorded connected</div></div><Check className="h-5 w-5 text-good" /></CardContent></Card><Card className="gap-0 rounded-xl border border-line py-0 shadow-[var(--shadow-card)]"><CardContent className="flex items-center justify-between px-4 py-4"><div><div className="font-mono text-2xl font-semibold tabular-nums text-ink">{summary.attention}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">Needs attention</div></div><ServerCog className="h-5 w-5 text-warn" /></CardContent></Card></div>
    <div className="flex items-start gap-3 rounded-xl border border-accent/20 bg-accent/[0.045] px-4 py-3"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent" /><div><div className="text-sm font-semibold text-ink">Provider boundary</div><div className="mt-0.5 text-xs leading-5 text-muted">Telegram uses the existing Twin runtime. OnlyFans, Fanvue, Fansly and MYM entries are credential-free operational records in this sprint. They do not authenticate, sync or send.</div></div></div>
    {canManage ? <NewConnection creators={creators.filter((creator) => creator.mappingStatus === "resolved" && Boolean(creator.agency))} /> : null}
    <Card className="gap-0 rounded-xl border border-line py-0 shadow-[var(--shadow-card)]"><div className="flex flex-col gap-3 border-b border-line px-4 py-3 lg:flex-row lg:items-center lg:justify-between"><div className="relative w-full lg:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search creator, agency or account" aria-label="Search connections" className="h-9 bg-panel pl-9" /></div><div className="flex flex-wrap gap-2"><label className="sr-only" htmlFor="connections-provider-filter">Provider</label><select id="connections-provider-filter" value={provider} onChange={(event) => setProvider(event.target.value)} className="h-9 rounded-lg border border-line bg-panel px-3 text-sm font-medium text-ink outline-none focus:border-accent-2"><option value="all">All providers</option>{providers.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><label className="sr-only" htmlFor="connections-status-filter">Connection status</label><select id="connections-status-filter" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="h-9 rounded-lg border border-line bg-panel px-3 text-sm font-medium text-ink outline-none focus:border-accent-2"><option value="all">All statuses</option><option value="connected">Connected</option><option value="authentication_required">Authentication required</option><option value="sync_issue">Sync issue</option><option value="not_connected">Not connected</option><option value="unavailable">Unavailable</option></select></div></div>
      {summary.totalConnections === 0 ? <div className="flex min-h-56 flex-col items-center justify-center px-6 py-12 text-center"><Link2 className="h-6 w-6 text-muted" /><h2 className="mt-3 text-base font-semibold text-ink">No connections recorded</h2><p className="mt-1 text-sm text-muted">Connection records will appear here after a provider is linked.</p></div> : visible.length === 0 ? <div className="flex min-h-40 items-center justify-center px-6 py-10 text-sm text-muted">No connections match the current filters.</div> : <div className="divide-y divide-line bg-bg/35 p-3">{visible.map((creator) => <section key={creator.id} className="mb-3 overflow-hidden rounded-lg border border-line bg-panel last:mb-0"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-elev/55 px-4 py-3"><div><h2 className="font-semibold text-ink">{creator.displayName}</h2><p className="mt-0.5 text-xs text-muted">{creator.agency?.name ?? "No agency assigned"}{creator.twin ? ` / Twin: ${creator.twin.name}` : ""}</p></div>{creator.mappingStatus === "conflict" ? <Badge variant="outline" className="rounded-md border-warn/30 bg-warn/10 text-warn"><AlertTriangle className="h-3 w-3" />Mapping needs review</Badge> : null}</div>{creator.connections.map((connection) => <ConnectionRow key={connection.id} connection={connection} canManage={canManage} />)}</section>)}</div>}
    </Card>
  </div>;
}
