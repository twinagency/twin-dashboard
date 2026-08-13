"use client";

import { useState } from "react";
import Link from "next/link";
import { botFor, BotMark } from "../bot-identity";

// What the bots actually did, newest first. Every run writes lines here: what
// it checked, what it found, what it filed, what it skipped as already known,
// and anything that failed.
//
// This exists so a bot cannot quietly do nothing. A scheduled job that silently
// stops is indistinguishable from a scheduled job that finds no problems, and
// on this project the second reading has been wrong far more often than the
// first.

export type LogRow = {
  id: string;
  bot: string;
  ts: string;
  level: "info" | "found" | "deduped" | "warn" | "error";
  message: string;
  item_number: number | null;
  fan_label: string;
  link_href: string;
};

const LEVEL: Record<LogRow["level"], { dot: string; label: string }> = {
  info: { dot: "bg-neutral-300", label: "checked" },
  found: { dot: "bg-rose-500", label: "found" },
  deduped: { dot: "bg-neutral-400", label: "already known" },
  warn: { dot: "bg-amber-500", label: "warning" },
  error: { dot: "bg-red-600", label: "failed" },
};

function when(ts: string): string {
  const d = new Date(ts);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return d.toLocaleDateString();
}

// TEN, THEN A BUTTON. Same rule as the OPEN list in TrackerBoard.tsx
// (operator ask, 2026-08-13): a page of hundreds of log lines is not
// something anyone reads, and the newest ten are what's being asked about.
const LOG_PAGE = 10;

export function BotLog({ rows }: { rows: LogRow[] }) {
  const [only, setOnly] = useState<string>("all");
  const [showAll, setShowAll] = useState(false);
  const bots = [...new Set(rows.map((r) => r.bot))];
  const filtered = only === "all" ? rows : rows.filter((r) => r.bot === only);
  const shown = showAll ? filtered : filtered.slice(0, LOG_PAGE);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Log</h2>
        <p className="text-xs text-neutral-400">what each bot checked, and what it did about it</p>
        {bots.length > 1 && (
          <div className="ml-auto flex flex-wrap gap-1">
            {["all", ...bots].map((b) => (
              <button
                key={b}
                onClick={() => setOnly(b)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  only === b ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {botFor(b)?.label ?? b}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-black/8 bg-white">
        {shown.map((r, i) => {
          const bot = botFor(r.bot);
          const lvl = LEVEL[r.level] ?? LEVEL.info;
          return (
            <div
              key={r.id}
              className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-2.5 text-sm ${i > 0 ? "border-t border-black/5" : ""}`}
            >
              <span className="flex items-center gap-1.5 font-semibold">
                {bot && (
                  <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-white ${bot.disc}`}>
                    <BotMark bot={bot} className="h-2.5 w-2.5" />
                  </span>
                )}
                <span className={bot ? "" : "text-neutral-700"}>{(bot?.label ?? r.bot).toUpperCase()}:</span>
              </span>

              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${lvl.dot}`} aria-label={lvl.label} />

              <span className="min-w-0 flex-1 text-neutral-800">
                {r.message}
                {r.fan_label && (
                  <>
                    {" "}
                    {r.link_href ? (
                      <Link href={r.link_href} className="font-medium text-sky-700 hover:underline">
                        {r.fan_label}
                      </Link>
                    ) : (
                      <span className="font-medium text-neutral-500">{r.fan_label}</span>
                    )}
                  </>
                )}
              </span>

              {r.item_number != null && (
                <Link
                  href={`/tracker#item-${r.item_number}`}
                  className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-200"
                >
                  #{r.item_number}
                </Link>
              )}
              <span className="w-16 shrink-0 text-right text-xs text-neutral-400">{when(r.ts)}</span>
            </div>
          );
        })}

        {!shown.length && (
          <p className="px-4 py-8 text-center text-sm text-neutral-400">
            nothing yet. A line lands here every time a bot runs, whether it finds anything or not.
          </p>
        )}
      </div>
      {filtered.length > LOG_PAGE && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-full rounded-xl border border-dashed border-black/12 px-4 py-2.5 text-sm font-semibold text-neutral-600 hover:border-black/25 hover:text-neutral-900"
        >
          {showAll ? "show less" : `show more (${filtered.length - LOG_PAGE} more)`}
        </button>
      )}
    </section>
  );
}
