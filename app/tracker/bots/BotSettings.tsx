"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateBot } from "./actions";
import { botFor, BotBadge, BotMark } from "../bot-identity";

export type BotRow = {
  slug: string;
  label: string;
  blurb: string;
  enabled: boolean;
  every_minutes: number;
  runs_after: string | null;
  model: string;
  lookback_hours: number;
  max_items: number;
  files_to_tracker: boolean;
  last_run_at: string | null;
  last_run_note: string;
};

// Common intervals, in minutes. 0 means on demand only, which is how Repro
// runs: it is pointed at one bug, not at a stream.
const EVERY = [
  { v: 0, label: "on demand only" },
  { v: 10, label: "every 10 minutes" },
  { v: 30, label: "every 30 minutes" },
  { v: 60, label: "every hour" },
  { v: 180, label: "every 3 hours" },
  { v: 360, label: "every 6 hours" },
  { v: 720, label: "twice a day" },
  { v: 1440, label: "once a day" },
];

// Only bots that call a model get a model picker. Ledger and Warden are
// arithmetic and ssh, and giving them a model box would imply their numbers
// come from one.
const USES_MODEL = new Set(["snitch", "triage", "repro"]);
const READS_A_WINDOW = new Set(["snitch", "ledger"]);

const MODELS = [
  "deepseek/deepseek-flash",
  "x-ai/grok-4.20",
  "deepseek/deepseek-v4-pro",
  "moonshot/mimo-v2.5",
];

function Row({ bot, all }: { bot: BotRow; all: BotRow[] }) {
  const [pending, start] = useTransition();
  const chained = !!bot.runs_after;

  return (
    <form
      action={(fd) => start(() => void updateBot(bot.slug, fd))}
      className={`rounded-2xl border p-5 ${bot.enabled ? "border-emerald-200 bg-white" : "border-black/8 bg-neutral-50/60"}`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {botFor(bot.slug) ? <BotBadge bot={botFor(bot.slug)!} size="lg" /> : <h3 className="text-base font-semibold text-neutral-900">{bot.label}</h3>}
            {bot.enabled ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">ON</span>
            ) : (
              <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-semibold text-neutral-500">OFF</span>
            )}
          </div>
          <p className="mt-1 text-sm text-neutral-600">{bot.blurb}</p>
          {bot.last_run_at && (
            <p className="mt-1 text-xs text-neutral-400">
              last run {new Date(bot.last_run_at).toLocaleString()}
              {bot.last_run_note ? ` · ${bot.last_run_note}` : ""}
            </p>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-neutral-700">
          <input type="checkbox" name="enabled" defaultChecked={bot.enabled} className="h-5 w-5 accent-emerald-600" />
          run it
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-4">
        <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          how often
          {chained ? (
            <p className="mt-1 rounded-lg bg-neutral-100 px-3 py-2 text-sm font-normal normal-case tracking-normal text-neutral-600">
              straight after {all.find((b) => b.slug === bot.runs_after)?.label ?? bot.runs_after}
            </p>
          ) : (
            <select name="every_minutes" defaultValue={bot.every_minutes} className="mt-1 block rounded-lg border border-black/10 px-3 py-2 text-sm font-normal normal-case tracking-normal">
              {EVERY.map((e) => (
                <option key={e.v} value={e.v}>
                  {e.label}
                </option>
              ))}
            </select>
          )}
        </label>

        {USES_MODEL.has(bot.slug) && (
          <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            model
            <select name="model" defaultValue={bot.model} className="mt-1 block rounded-lg border border-black/10 px-3 py-2 text-sm font-normal normal-case tracking-normal">
              {[...new Set([bot.model, ...MODELS])].filter(Boolean).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        )}

        {READS_A_WINDOW.has(bot.slug) && (
          <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            how far back
            <input
              name="lookback_hours"
              type="number"
              min={1}
              max={720}
              defaultValue={bot.lookback_hours}
              className="mt-1 block w-24 rounded-lg border border-black/10 px-3 py-2 text-sm font-normal normal-case tracking-normal"
            />
            <span className="mt-0.5 block text-[11px] font-normal normal-case tracking-normal text-neutral-400">hours</span>
          </label>
        )}

        <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          most it can file per run
          <input
            name="max_items"
            type="number"
            min={1}
            max={500}
            defaultValue={bot.max_items}
            className="mt-1 block w-24 rounded-lg border border-black/10 px-3 py-2 text-sm font-normal normal-case tracking-normal"
          />
        </label>
      </div>

      <button
        disabled={pending}
        className="mt-4 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        save
      </button>
    </form>
  );
}

export function BotSettings({ bots }: { bots: BotRow[] }) {
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Bots</h1>
          <Link href="/tracker" className="ml-auto text-sm font-medium text-sky-700 hover:underline">
            back to the tracker
          </Link>
        </div>
        {/* Said plainly, once, at the top. The question gets asked every time
            somebody new sees this page. */}
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">
          Every one of these only reads. They read message logs, payment rows or the boxes, and the only thing any of them
          writes is a report on the tracker. None of them edits a clone, a fan, a price, a prompt or any running code.
        </p>
        <p className="mt-1 text-xs text-neutral-400">
          A change here is picked up on that bot next run, not straight away.
        </p>
      </header>

      {bots.map((b) => (
        <Row key={b.slug} bot={b} all={bots} />
      ))}

      {!bots.length && <p className="text-sm text-neutral-400">no bots registered yet</p>}
    </div>
  );
}

// The compact strip that sits at the top of the tracker board. One tile per
// bot: its mark, whether it is on, and how often it runs. Clicking a tile
// opens its full settings without leaving the page, because a bot and the
// items it filed are the same subject and were never worth two routes.
export function BotStrip({ bots }: { bots: BotRow[] }) {
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  function everyLabel(b: BotRow): string {
    if (b.runs_after) return `after ${b.runs_after}`;
    const found = EVERY.find((e) => e.v === b.every_minutes);
    if (found) return found.label.replace(/^every /, "");
    return `${b.every_minutes}m`;
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {bots.map((b) => {
          const id = botFor(b.slug);
          const on = b.enabled;
          return (
            <button
              key={b.slug}
              onClick={() => setOpenSlug(openSlug === b.slug ? null : b.slug)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left ${
                openSlug === b.slug ? "border-neutral-900 bg-white" : on ? "border-black/10 bg-white" : "border-black/8 bg-neutral-100"
              }`}
            >
              {id && (
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-white ${on ? id.disc : "bg-neutral-300"}`}>
                  <BotMark bot={id} className="h-4 w-4" />
                </span>
              )}
              <span className="leading-tight">
                <span className={`block text-sm font-semibold ${on ? "text-neutral-900" : "text-neutral-400"}`}>{b.label}</span>
                <span className="block text-[11px] text-neutral-400">{on ? everyLabel(b) : "off"}</span>
              </span>
            </button>
          );
        })}
      </div>

      {openSlug && (
        <div className="pt-1">
          {bots.filter((b) => b.slug === openSlug).map((b) => (
            <Row key={b.slug} bot={b} all={bots} />
          ))}
          <p className="mt-1 text-xs text-neutral-400">
            Read only. The only thing any of these writes is a report on this board.
          </p>
        </div>
      )}
    </section>
  );
}
