"use client";

import { Fragment, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TECH_LABEL, fmtLogTime, fmtRelativeTime, friendlyKey, sourceLabel, type Tech } from "./tech";

export type LogRow = {
  key: string;
  ts: string;
  level: "info" | "warn" | "error";
  tech: Tech;
  source: string;
  cloneName: string | null;
  fan: string | null;
  message: string;
  detail: Record<string, unknown> | null;
};

function LevelChip({ level }: { level: LogRow["level"] }) {
  const tone =
    level === "error"
      ? "border-crit/40 bg-crit/10 text-crit"
      : level === "warn"
        ? "border-warn/40 bg-warn/10 text-warn"
        : "border-line bg-elev text-muted";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${tone}`}>
      {level}
    </span>
  );
}

// Unified newest-first log stream. Rows with a detail payload expand on click
// to show the pretty-printed JSON underneath.
export function LogsTable({ rows, showClone }: { rows: LogRow[]; showClone: boolean }) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const colCount = showClone ? 6 : 5;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Level</TableHead>
          <TableHead>Tech</TableHead>
          {showClone && <TableHead>Clone</TableHead>}
          <TableHead>Message</TableHead>
          <TableHead className="text-right">Fan</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const expandable = r.detail != null && Object.keys(r.detail).length > 0;
          const expanded = open.has(r.key);
          return (
            <Fragment key={r.key}>
              <TableRow
                className={`${r.level === "error" ? "bg-crit/5 hover:bg-crit/10" : ""} ${expandable ? "cursor-pointer" : ""}`}
                onClick={expandable ? () => toggle(r.key) : undefined}
              >
                <TableCell className="whitespace-nowrap text-muted">
                  <div>{fmtLogTime(r.ts)}</div>
                  {fmtRelativeTime(r.ts) && <div className="text-[11px] text-muted/70">{fmtRelativeTime(r.ts)}</div>}
                </TableCell>
                <TableCell>
                  <LevelChip level={r.level} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <div>{TECH_LABEL[r.tech]}</div>
                  <div className="text-[11px] text-muted" title={`raw source: ${r.source}`}>
                    {sourceLabel(r.source)}
                  </div>
                </TableCell>
                {showClone && <TableCell className="whitespace-nowrap">{r.cloneName ?? "-"}</TableCell>}
                <TableCell className="max-w-[480px]">
                  <span className="block truncate" title={r.message}>
                    {r.message}
                  </span>
                  {expandable && (
                    <span className="text-[11px] text-muted">{expanded ? "hide detail" : "show detail"}</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums text-muted whitespace-nowrap">
                  {r.fan ?? "-"}
                </TableCell>
              </TableRow>
              {expandable && expanded && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={colCount} className="bg-elev/50 py-2">
                    <DetailView detail={r.detail!} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={colCount} className="py-8 text-center text-muted">
              Nothing logged here yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

// Detail payload as a scannable key/value list instead of a raw JSON dump -
// same information (nothing dropped, nothing renamed in the underlying data),
// just formatted for someone who isn't reading it as code. Nested
// objects/arrays still fall back to a compact JSON string since there's no
// generic way to flatten them further; everything else prints as plain text.
function DetailView({ detail }: { detail: Record<string, unknown> }) {
  const entries = Object.entries(detail);
  if (entries.length === 0) return null;
  return (
    <dl className="grid max-h-64 gap-x-4 gap-y-1 overflow-auto text-xs sm:grid-cols-[max-content_1fr]">
      {entries.map(([key, value]) => (
        <Fragment key={key}>
          <dt className="whitespace-nowrap font-medium text-muted">{friendlyKey(key)}</dt>
          <dd className="whitespace-pre-wrap break-all text-ink/90">{formatDetailValue(value)}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
