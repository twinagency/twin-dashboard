"use client";

import React, { useMemo, useState } from "react";
import { AlertTriangle, Cable, Check, CircleOff, KeyRound, RefreshCcw, Search, ServerCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { crmFoundationSummary, type CrmConnectionDisplayStatus, type CrmCreatorView, type CrmFoundationResult } from "@/lib/crm-foundation-model";

type StatusFilter = "all" | CrmConnectionDisplayStatus;

const statusStyle = (status: CrmConnectionDisplayStatus) => {
  if (status === "connected") return "border-good/25 bg-good/10 text-good";
  if (status === "authentication_required") return "border-warn/30 bg-warn/10 text-warn";
  if (status === "sync_issue") return "border-crit/25 bg-crit/10 text-crit";
  return "border-line bg-elev text-muted";
};

const StatusIcon = ({ status }: { status: CrmConnectionDisplayStatus }) => {
  if (status === "connected") return <Check className="h-3.5 w-3.5" />;
  if (status === "authentication_required") return <KeyRound className="h-3.5 w-3.5" />;
  if (status === "sync_issue") return <RefreshCcw className="h-3.5 w-3.5" />;
  return <CircleOff className="h-3.5 w-3.5" />;
};

const activityLabel = (value: string | null) => {
  if (!value) return "No verification recorded";
  return `Verified ${new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value))}`;
};

function UnavailableConnections({ result }: { result: Extract<CrmFoundationResult, { status: "unavailable" }> }) {
  return (
    <Card className="rounded-xl border border-line py-0 shadow-[var(--shadow-card)]">
      <CardContent className="flex min-h-56 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="grid h-11 w-11 place-items-center rounded-lg border border-warn/25 bg-warn/10 text-warn"><AlertTriangle className="h-5 w-5" /></div>
        <h2 className="mt-4 text-base font-semibold text-ink">
          {result.reason === "not_migrated" ? "Foundation not applied" : "Connections unavailable"}
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted">{result.message}</p>
      </CardContent>
    </Card>
  );
}

function ConnectionRow({ connection }: { connection: CrmCreatorView["connections"][number] }) {
  return (
    <div className="grid gap-4 border-t border-line px-4 py-4 first:border-t-0 lg:grid-cols-[minmax(9rem,0.8fr)_minmax(12rem,1fr)_minmax(16rem,1.35fr)_auto] lg:items-center">
      <div>
        <div className="font-semibold text-ink">{connection.providerLabel}</div>
        <div className="mt-1 max-w-56 truncate text-xs text-muted">{connection.accountLabel ?? "Account label unavailable"}</div>
      </div>
      <div>
        <Badge variant="outline" className={`h-7 rounded-md px-2.5 ${statusStyle(connection.displayStatus)}`}>
          <StatusIcon status={connection.displayStatus} />{connection.displayStatusLabel}
        </Badge>
        <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">Sync: {connection.syncStatus.replaceAll("_", " ")}</div>
      </div>
      <div>
        {connection.capabilities.length ? (
          <div className="flex flex-wrap gap-1.5">
            {connection.capabilities.map((capability) => (
              <Badge
                key={capability.capability}
                variant="outline"
                title={capability.detail ?? capability.stateLabel}
                className={
                  "h-6 rounded-md border-line bg-panel " +
                  (capability.state === "supported" ? "text-ink" : capability.state === "degraded" ? "text-warn" : "text-muted")
                }
              >
                <span className={"h-1.5 w-1.5 rounded-full " + (capability.state === "supported" ? "bg-good" : capability.state === "degraded" ? "bg-warn" : "bg-muted")} />
                {capability.label}
              </Badge>
            ))}
          </div>
        ) : <span className="text-sm text-muted">Capabilities not recorded</span>}
      </div>
      <div className="font-mono text-xs text-muted lg:text-right">{activityLabel(connection.lastVerifiedAt)}</div>
    </div>
  );
}

export default function ConnectionsRegistry({ result }: { result: CrmFoundationResult }) {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const creators = result.status === "available" ? result.creators : [];
  const summary = useMemo(() => crmFoundationSummary(creators), [creators]);
  const providers = useMemo(
    () => [...new Map(creators.flatMap((creator) => creator.connections).map((connection) => [connection.provider, connection.providerLabel])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [creators],
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return creators
      .map((creator) => ({
        ...creator,
        connections: creator.connections.filter((connection) =>
          (provider === "all" || connection.provider === provider) &&
          (status === "all" || connection.displayStatus === status) &&
          (!needle || `${creator.displayName} ${creator.agency?.name ?? ""} ${connection.providerLabel} ${connection.accountLabel ?? ""}`.toLowerCase().includes(needle)),
        ),
      }))
      .filter((creator) => creator.connections.length > 0);
  }, [creators, provider, query, status]);

  if (result.status === "unavailable") return <UnavailableConnections result={result} />;

  return (
    <div data-crm-foundation="connections-registry" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="gap-0 rounded-xl border border-line py-0 shadow-[var(--shadow-card)]"><CardContent className="flex items-center justify-between px-4 py-4"><div><div className="font-mono text-2xl font-semibold tabular-nums text-ink">{summary.totalConnections}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">Connections</div></div><Cable className="h-5 w-5 text-accent" /></CardContent></Card>
        <Card className="gap-0 rounded-xl border border-line py-0 shadow-[var(--shadow-card)]"><CardContent className="flex items-center justify-between px-4 py-4"><div><div className="font-mono text-2xl font-semibold tabular-nums text-ink">{summary.connected}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">Connected</div></div><Check className="h-5 w-5 text-good" /></CardContent></Card>
        <Card className="gap-0 rounded-xl border border-line py-0 shadow-[var(--shadow-card)]"><CardContent className="flex items-center justify-between px-4 py-4"><div><div className="font-mono text-2xl font-semibold tabular-nums text-ink">{summary.attention}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">Needs attention</div></div><ServerCog className="h-5 w-5 text-warn" /></CardContent></Card>
      </div>

      <Card className="gap-0 rounded-xl border border-line py-0 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search creator, agency or account" aria-label="Search connections" className="h-9 bg-panel pl-9" />
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="connections-provider-filter">Provider</label>
            <select id="connections-provider-filter" value={provider} onChange={(event) => setProvider(event.target.value)} className="h-9 rounded-lg border border-line bg-panel px-3 text-sm font-medium text-ink outline-none focus:border-accent-2">
              <option value="all">All providers</option>
              {providers.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <label className="sr-only" htmlFor="connections-status-filter">Connection status</label>
            <select id="connections-status-filter" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="h-9 rounded-lg border border-line bg-panel px-3 text-sm font-medium text-ink outline-none focus:border-accent-2">
              <option value="all">All statuses</option>
              <option value="connected">Connected</option>
              <option value="authentication_required">Authentication required</option>
              <option value="sync_issue">Sync issue</option>
              <option value="not_connected">Not connected</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </div>
        </div>

        {summary.totalConnections === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-6 py-12 text-center">
            <Cable className="h-6 w-6 text-muted" />
            <h2 className="mt-3 text-base font-semibold text-ink">No connections recorded</h2>
            <p className="mt-1 text-sm text-muted">Connection records will appear here after a provider is linked.</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center px-6 py-10 text-sm text-muted">No connections match the current filters.</div>
        ) : (
          <div className="divide-y divide-line bg-bg/35 p-3">
            {visible.map((creator) => (
              <section key={creator.id} className="mb-3 overflow-hidden rounded-lg border border-line bg-panel last:mb-0">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-elev/55 px-4 py-3">
                  <div>
                    <h2 className="font-semibold text-ink">{creator.displayName}</h2>
                    <p className="mt-0.5 text-xs text-muted">{creator.agency?.name ?? "No agency assigned"}{creator.twin ? ` · Twin: ${creator.twin.name}` : ""}</p>
                  </div>
                  {creator.mappingStatus === "conflict" ? <Badge variant="outline" className="rounded-md border-warn/30 bg-warn/10 text-warn"><AlertTriangle className="h-3 w-3" />Mapping needs review</Badge> : null}
                </div>
                {creator.connections.map((connection) => <ConnectionRow key={connection.id} connection={connection} />)}
              </section>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
