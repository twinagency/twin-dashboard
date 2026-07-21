"use client";

import { Fragment, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TECH_LABEL, type Tech } from "./tech";

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
                <TableCell className="whitespace-nowrap text-muted">{new Date(r.ts).toLocaleString()}</TableCell>
                <TableCell>
                  <LevelChip level={r.level} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <span title={r.source}>{TECH_LABEL[r.tech]}</span>
                  <span className="ml-1.5 text-[11px] text-muted">{r.source}</span>
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
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-muted">
                      {JSON.stringify(r.detail, null, 2)}
                    </pre>
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
