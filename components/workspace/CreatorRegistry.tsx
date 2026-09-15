"use client";

import React, { useMemo, useState } from "react";
import { AlertTriangle, Building2, CircleCheck, Link2, Search, ShieldCheck, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { crmFoundationSummary, type CrmCreatorView, type CrmFoundationResult } from "@/lib/crm-foundation-model";

type MappingFilter = "all" | CrmCreatorView["mappingStatus"];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

const dateLabel = (value: string | null) => {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(value),
  );
};

const mappingBadgeClass = (status: CrmCreatorView["mappingStatus"]) => {
  if (status === "resolved") return "border-good/25 bg-good/10 text-good";
  if (status === "conflict") return "border-warn/30 bg-warn/10 text-warn";
  return "border-line bg-elev text-muted";
};

const connectionDotClass = (status: CrmCreatorView["connections"][number]["displayStatus"]) => {
  if (status === "connected") return "bg-good";
  if (status === "authentication_required") return "bg-warn";
  if (status === "sync_issue") return "bg-crit";
  return "bg-muted";
};

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card className="gap-0 rounded-xl border border-line py-0 shadow-[var(--shadow-card)]">
      <CardContent className="flex items-center justify-between px-4 py-4">
        <div>
          <div className="font-mono text-2xl font-semibold tabular-nums text-ink">{value}</div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">{label}</div>
        </div>
        <div className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-elev text-accent">{icon}</div>
      </CardContent>
    </Card>
  );
}

function UnavailableState({ result }: { result: Extract<CrmFoundationResult, { status: "unavailable" }> }) {
  return (
    <Card className="rounded-xl border border-line py-0 shadow-[var(--shadow-card)]">
      <CardContent className="flex min-h-56 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="grid h-11 w-11 place-items-center rounded-lg border border-warn/25 bg-warn/10 text-warn">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-ink">
          {result.reason === "not_migrated" ? "Foundation not applied" : "Registry unavailable"}
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted">{result.message}</p>
      </CardContent>
    </Card>
  );
}

export default function CreatorRegistry({ result }: { result: CrmFoundationResult }) {
  const [query, setQuery] = useState("");
  const [mapping, setMapping] = useState<MappingFilter>("all");
  const [channel, setChannel] = useState("all");

  const creators = result.status === "available" ? result.creators : [];
  const summary = useMemo(() => crmFoundationSummary(creators), [creators]);
  const channels = useMemo(
    () => [...new Set(creators.flatMap((creator) => creator.connections.map((connection) => connection.provider)))].sort(),
    [creators],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return creators.filter((creator) => {
      const haystack = [
        creator.displayName,
        creator.agency?.name,
        creator.twin?.name,
        creator.twin?.slug,
        ...creator.connections.map((connection) => `${connection.providerLabel} ${connection.accountLabel ?? ""}`),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        (!needle || haystack.includes(needle)) &&
        (mapping === "all" || creator.mappingStatus === mapping) &&
        (channel === "all" || creator.connections.some((connection) => connection.provider === channel))
      );
    });
  }, [channel, creators, mapping, query]);

  if (result.status === "unavailable") return <UnavailableState result={result} />;

  return (
    <div data-crm-foundation="creator-registry" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Canonical creators" value={summary.creators} icon={<UserRound className="h-4 w-4" />} />
        <Metric label="Connected accounts" value={summary.connected} icon={<Link2 className="h-4 w-4" />} />
        <Metric label="Connection attention" value={summary.attention} icon={<AlertTriangle className="h-4 w-4" />} />
        <Metric label="Mapping warnings" value={summary.mappingWarnings} icon={<ShieldCheck className="h-4 w-4" />} />
      </div>

      <Card className="gap-0 rounded-xl border border-line py-0 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search creator, agency, Twin or channel"
              aria-label="Search creator registry"
              className="h-9 bg-panel pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="registry-mapping-filter">Mapping status</label>
            <select
              id="registry-mapping-filter"
              value={mapping}
              onChange={(event) => setMapping(event.target.value as MappingFilter)}
              className="h-9 rounded-lg border border-line bg-panel px-3 text-sm font-medium text-ink outline-none focus:border-accent-2"
            >
              <option value="all">All mappings</option>
              <option value="resolved">Resolved</option>
              <option value="conflict">Needs review</option>
              <option value="unbound">Not assigned</option>
              <option value="unknown">Unverified</option>
            </select>
            <label className="sr-only" htmlFor="registry-channel-filter">Channel</label>
            <select
              id="registry-channel-filter"
              value={channel}
              onChange={(event) => setChannel(event.target.value)}
              className="h-9 rounded-lg border border-line bg-panel px-3 text-sm font-medium text-ink outline-none focus:border-accent-2"
            >
              <option value="all">All channels</option>
              {channels.map((provider) => {
                const label = creators.flatMap((creator) => creator.connections).find((item) => item.provider === provider)?.providerLabel;
                return <option key={provider} value={provider}>{label ?? provider}</option>;
              })}
            </select>
          </div>
        </div>

        {creators.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-6 py-12 text-center">
            <UserRound className="h-6 w-6 text-muted" />
            <h2 className="mt-3 text-base font-semibold text-ink">No canonical creators yet</h2>
            <p className="mt-1 text-sm text-muted">The registry is ready. No creator records have been mapped.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center px-6 py-10 text-sm text-muted">
            No creators match the current filters.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-elev/65 hover:bg-elev/65">
                <TableHead className="h-9 px-4 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Creator</TableHead>
                <TableHead className="h-9 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Agency</TableHead>
                <TableHead className="h-9 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Twin identity</TableHead>
                <TableHead className="h-9 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Channels</TableHead>
                <TableHead className="h-9 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Mapping</TableHead>
                <TableHead className="h-9 pr-4 text-right text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((creator) => (
                <TableRow key={creator.id} className="hover:bg-elev/35">
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-xs font-bold text-white">
                        {initials(creator.displayName)}
                      </div>
                      <div className="min-w-0">
                        <div className="max-w-52 truncate font-semibold text-ink">{creator.displayName}</div>
                        <div className="mt-0.5 text-xs text-muted">{creator.statusLabel}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-3">
                    {creator.agency ? (
                      <div className="flex items-center gap-2 text-sm font-medium text-ink">
                        <Building2 className="h-4 w-4 text-muted" />{creator.agency.name}
                      </div>
                    ) : <span className="text-sm text-muted">Not assigned</span>}
                  </TableCell>
                  <TableCell className="py-3">
                    {creator.twin ? (
                      <div>
                        <div className="font-medium text-ink">{creator.twin.name}</div>
                        <div className="mt-0.5 text-xs text-muted">{creator.twin.status}</div>
                      </div>
                    ) : <span className="text-sm text-muted">No Twin linked</span>}
                  </TableCell>
                  <TableCell className="py-3">
                    {creator.connections.length ? (
                      <div className="flex max-w-72 flex-wrap gap-1.5">
                        {creator.connections.map((connection) => (
                          <Badge key={connection.id} variant="outline" title={connection.displayStatusLabel} className="h-6 gap-1.5 rounded-md border-line bg-panel text-ink">
                            <span className={`h-1.5 w-1.5 rounded-full ${connectionDotClass(connection.displayStatus)}`} />
                            {connection.providerLabel}
                          </Badge>
                        ))}
                      </div>
                    ) : <span className="text-sm text-muted">No connections</span>}
                  </TableCell>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`h-6 rounded-md ${mappingBadgeClass(creator.mappingStatus)}`}>
                        {creator.mappingStatus === "resolved" ? <CircleCheck className="h-3 w-3" /> : null}
                        {creator.mappingStatus === "conflict" ? <AlertTriangle className="h-3 w-3" /> : null}
                        {creator.mappingStatusLabel}
                      </Badge>
                      {creator.mappingWarning ? <span className="sr-only">{creator.mappingWarning}</span> : null}
                    </div>
                  </TableCell>
                  <TableCell className="py-3 pr-4 text-right font-mono text-xs text-muted">{dateLabel(creator.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
