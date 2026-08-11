"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { botFor, BotBadge } from "./bot-identity";
import { KINDS, AREAS, SEVERITIES, ageLabel, type TrackerBatch, type TrackerBoard as Board, type TrackerItem } from "@/lib/tracker";
import {
  addCommit,
  addNote,
  createItem,
  deleteItem,
  removeFromBatch,
  startBatch,
  updateBatch,
  updateItem,
} from "./actions";

// The board. Three zones top to bottom:
//   ARCHIVE   shipped + verified batches, collapsed, one row each
//   IN FLIGHT the batch being fixed right now
//   OPEN      everything reported and not yet picked up
//
// No em dashes in UI copy anywhere in this repo (see dashboard/CLAUDE.md).

const KIND_COLOR: Record<string, string> = {
  bug: "bg-rose-100 text-rose-700",
  feature: "bg-violet-100 text-violet-700",
  config: "bg-amber-100 text-amber-700",
  prompt: "bg-sky-100 text-sky-700",
  design: "bg-slate-200 text-slate-700",
  dashboard: "bg-indigo-100 text-indigo-700",
  deploy: "bg-teal-100 text-teal-700",
  test: "bg-lime-100 text-lime-700",
  question: "bg-neutral-200 text-neutral-700",
  content: "bg-pink-100 text-pink-700",
};

const STATUS_STEPS = ["open", "fixed", "pushed", "live"] as const;

function Chip({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}>{children}</span>;
}

function Screenshot({ path, filename }: { path: string; filename: string }) {
  const [url, setUrl] = useState<string | null>(null);
  // The media bucket is private, so every view needs a fresh signed url from
  // the existing /api/media-sign route. Fetched on click rather than on render
  // so a report with eight screenshots does not fire eight signing calls just
  // to be scrolled past.
  async function open() {
    if (url) return;
    const res = await fetch(`/api/media-sign?path=${encodeURIComponent(path)}`);
    const json = await res.json();
    if (json.url) setUrl(json.url);
  }
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      <img src={url} alt={filename} className="max-h-64 rounded-lg border border-black/10" />
    </a>
  ) : (
    <button onClick={open} className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
      show {filename || "screenshot"}
    </button>
  );
}

// ── one item, collapsed row + expanded detail ────────────────────────────────
function ItemRow({
  item,
  selectable,
  selected,
  onSelect,
  batches,
  batchLabel,
}: {
  item: TrackerItem;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: string, on: boolean) => void;
  batches: TrackerBatch[];
  batchLabel?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div id={`item-${item.number}`} className={`scroll-mt-24 rounded-xl border ${selected ? "border-sky-400 bg-sky-50/50" : "border-black/8 bg-white"}`}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        {selectable && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={(e) => onSelect?.(item.id, e.target.checked)}
            className="h-4 w-4 shrink-0 accent-sky-600"
            aria-label={`select #${item.number}`}
          />
        )}
        <button onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="w-11 shrink-0 font-mono text-xs text-neutral-400">#{item.number}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900">{item.title}</span>
          {botFor(item.submittedBy) && <BotBadge bot={botFor(item.submittedBy)!} />}
          {batchLabel && <Chip className="bg-sky-100 text-sky-700">{batchLabel}</Chip>}
          {item.severity === "money" && <Chip className="bg-red-600 text-white">MONEY</Chip>}
          {item.severity === "high" && <Chip className="bg-orange-100 text-orange-700">high</Chip>}
          <Chip className={KIND_COLOR[item.kind] ?? "bg-neutral-200 text-neutral-700"}>{item.kind}</Chip>
          {item.attachments.length > 0 && <span className="text-xs text-neutral-400">{item.attachments.length} img</span>}
          <span className="w-14 shrink-0 text-right text-xs text-neutral-400">{ageLabel(item.createdAt)}</span>
        </button>
      </div>

      {open && (
        <div className="space-y-4 border-t border-black/6 px-4 py-4">
          <div className="text-xs text-neutral-500">
            reported {new Date(item.createdAt).toLocaleDateString()} by {item.submittedBy} · {item.area}
          </div>

          {item.body && <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">{item.body}</p>}

          {item.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.attachments.map((a) => (
                <Screenshot key={a.id} path={a.path} filename={a.filename} />
              ))}
            </div>
          )}

          {/* Lifecycle. Four steps because on this project "fixed" has meant
              code written, code pushed, image deployed and actually running,
              and collapsing them has cost real money three times. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_STEPS.map((s) => (
              <button
                key={s}
                disabled={pending}
                onClick={() =>
                  start(() => {
                    const fd = new FormData();
                    fd.set("status", s);
                    updateItem(item.id, fd);
                  })
                }
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  item.status === s ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {s}
              </button>
            ))}
            <span className="mx-1 text-neutral-300">|</span>
            <button
              disabled={pending}
              onClick={() =>
                start(() => {
                  const fd = new FormData();
                  fd.set("status", "wontfix");
                  updateItem(item.id, fd);
                })
              }
              className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-500 hover:bg-neutral-200"
            >
              not a bug
            </button>
          </div>

          {/* What was actually fixed, in plain english. A commit hash tells the
              person reading the archive in a month nothing at all. */}
          <form
            action={(fd) => start(() => void updateItem(item.id, fd))}
            className="space-y-2 rounded-lg bg-emerald-50/60 p-3"
          >
            <label className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">what was fixed</label>
            <textarea
              name="fix_note"
              defaultValue={item.fixNote}
              rows={3}
              placeholder="plain english. what was wrong, what changed, how we know it works."
              className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400"
            />
            <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">save</button>
          </form>

          {item.commits.length > 0 && (
            <div className="space-y-1">
              {item.commits.map((c) => (
                <div key={c.id} className="font-mono text-xs text-neutral-500">
                  <span className="text-neutral-400">{c.repo}</span> {c.sha.slice(0, 7)} {c.subject}
                </div>
              ))}
            </div>
          )}

          <form action={(fd) => start(() => void addCommit(item.id, fd))} className="flex flex-wrap gap-2">
            <select name="repo" className="rounded-lg border border-black/10 px-2 py-1.5 text-xs">
              <option value="bot">bot</option>
              <option value="dashboard">dashboard</option>
              <option value="ops">ops</option>
              <option value="docs">docs</option>
            </select>
            <input name="sha" placeholder="commit sha" className="w-32 rounded-lg border border-black/10 px-2 py-1.5 font-mono text-xs" />
            <input name="subject" placeholder="commit subject" className="flex-1 rounded-lg border border-black/10 px-2 py-1.5 text-xs" />
            <button className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white">attach commit</button>
          </form>

          {item.notes.length > 0 && (
            <div className="space-y-2 border-t border-black/6 pt-3">
              {item.notes.map((n) => (
                <div key={n.id} className="text-sm">
                  <span className="text-xs font-semibold text-neutral-500">{n.author}</span>{" "}
                  <span className="text-xs text-neutral-400">{new Date(n.createdAt).toLocaleDateString()}</span>
                  <p className="whitespace-pre-wrap text-neutral-700">{n.body}</p>
                </div>
              ))}
            </div>
          )}

          <form action={(fd) => start(() => void addNote(item.id, fd))} className="flex gap-2">
            <input name="body" placeholder="add a note" className="flex-1 rounded-lg border border-black/10 px-3 py-1.5 text-sm" />
            <button className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-200">note</button>
          </form>

          <div className="flex flex-wrap items-center gap-2 border-t border-black/6 pt-3">
            {item.batchId ? (
              <button
                onClick={() => start(() => void removeFromBatch(item.id))}
                className="text-xs font-medium text-neutral-500 hover:text-neutral-800"
              >
                move back to open
              </button>
            ) : (
              batches
                .filter((b) => b.status !== "live")
                .map((b) => (
                  <button
                    key={b.id}
                    onClick={() =>
                      start(() => {
                        const fd = new FormData();
                        fd.append("item_ids", item.id);
                        startBatch(fd);
                      })
                    }
                    className="rounded-lg bg-sky-100 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-200"
                  >
                    add to batch {String(b.number).padStart(2, "0")}
                  </button>
                ))
            )}
            <button
              onClick={() => {
                if (confirm(`Delete #${item.number} for good?`)) start(() => void deleteItem(item.id));
              }}
              className="ml-auto text-xs text-neutral-400 hover:text-red-600"
            >
              delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// A slim bar for the batch currently being worked. Not its own zone: its items
// stay in the open list below, so there is exactly one place to look for
// outstanding work. This is only the controls for moving it along.
function BatchControls({ batch }: { batch: TrackerBatch }) {
  const [pending, start] = useTransition();
  return (
    <form
      action={(fd) => start(() => void updateBatch(batch.id, fd))}
      className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2.5"
    >
      <span className="text-sm font-semibold text-sky-900">BATCH {String(batch.number).padStart(2, "0")}</span>
      <span className="text-xs text-sky-700">
        {batch.items.length} picked, {batch.status === "shipped" ? "shipped, waiting on verification" : "being fixed"}
      </span>
      <input
        name="deploy_note"
        defaultValue={batch.deployNote}
        placeholder="how it shipped, eg deployed bot 16 Aug, verified in container"
        className="min-w-52 flex-1 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-xs"
      />
      <button name="status" value="shipped" disabled={pending} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600">
        mark shipped
      </button>
      <button name="status" value="live" disabled={pending} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
        verified live, move to done
      </button>
    </form>
  );
}

// ── one batch ────────────────────────────────────────────────────────────────
function BatchBlock({ batch, batches, defaultOpen }: { batch: TrackerBatch; batches: TrackerBatch[]; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [pending, start] = useTransition();
  const label = `BATCH ${String(batch.number).padStart(2, "0")}`;
  const date = batch.liveAt ?? batch.shippedAt ?? batch.createdAt;

  return (
    <div className="rounded-xl border border-black/8 bg-white">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="text-neutral-400">{open ? "▾" : "▸"}</span>
        <span className="font-semibold text-neutral-900">{label}</span>
        <span className="text-sm text-neutral-500">
          {batch.items.length} item{batch.items.length === 1 ? "" : "s"}
        </span>
        <span className="text-sm text-neutral-400">{new Date(date).toLocaleDateString()}</span>
        {batch.title && <span className="truncate text-sm text-neutral-500">{batch.title}</span>}
        <span className="ml-auto">
          {batch.status === "live" ? (
            <Chip className="bg-emerald-100 text-emerald-700">LIVE</Chip>
          ) : batch.status === "shipped" ? (
            <Chip className="bg-amber-100 text-amber-700">SHIPPED, NOT VERIFIED</Chip>
          ) : (
            <Chip className="bg-sky-100 text-sky-700">IN PROGRESS</Chip>
          )}
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-black/6 px-4 py-4">
          {batch.deployNote && <p className="text-xs text-neutral-500">{batch.deployNote}</p>}

          {batch.items.map((i) => (
            <div key={i.id}>
              <ItemRow item={i} batches={batches} />
              {batch.status === "live" && i.fixNote && (
                <p className="whitespace-pre-wrap px-4 pt-1.5 text-xs leading-relaxed text-neutral-600">{i.fixNote}</p>
              )}
            </div>
          ))}
          {!batch.items.length && <p className="text-sm text-neutral-400">nothing in this batch yet</p>}

          {batch.status !== "live" && (
            <form action={(fd) => start(() => void updateBatch(batch.id, fd))} className="flex flex-wrap items-center gap-2 pt-2">
              <input
                name="deploy_note"
                defaultValue={batch.deployNote}
                placeholder="how it shipped, eg deployed bot 16 Aug, verified in container"
                className="min-w-56 flex-1 rounded-lg border border-black/10 px-3 py-1.5 text-xs"
              />
              <button
                name="status"
                value="shipped"
                disabled={pending}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
              >
                mark shipped
              </button>
              <button
                name="status"
                value="live"
                disabled={pending}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                verified live, archive it
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// ── the whole board ──────────────────────────────────────────────────────────
export function TrackerBoard({ board }: { board: Board }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reporting, setReporting] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [pending, start] = useTransition();

  const archive = board.batches.filter((b) => b.status === "live");
  const inFlight = board.batches.filter((b) => b.status !== "live");
  const batchNumber = new Map(board.batches.map((b) => [b.id, b.number]));
  const open = filter === "all" ? board.open : board.open.filter((i) => i.kind === filter);
  const money = board.open.filter((i) => i.severity === "money").length;

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Tracker</h1>
          <p className="text-sm text-neutral-500">
            {board.open.length} open{money > 0 && <span className="font-semibold text-red-600">, {money} losing money</span>} ·{" "}
            {archive.reduce((n, b) => n + b.items.length, 0)} fixed and live
          </p>
        </div>
        <Link href="/tracker/bots" className="ml-auto text-sm font-medium text-neutral-500 hover:text-neutral-900">
          bots
        </Link>
        <button
          onClick={() => setReporting((v) => !v)}
          className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          {reporting ? "cancel" : "+ new report"}
        </button>
      </header>

      {reporting && (
        <form
          action={(fd) =>
            start(() => {
              createItem(fd);
              setReporting(false);
            })
          }
          className="space-y-3 rounded-2xl border border-black/8 bg-white p-5"
        >
          <input
            name="title"
            required
            placeholder="one line. eg bot isnt remembering names"
            className="w-full rounded-lg border border-black/10 px-3 py-2.5 text-sm font-medium outline-none focus:border-sky-400"
          />
          <textarea
            name="body"
            rows={6}
            placeholder="the whole story. what she said, what should have happened, which clone, which fan. as long as you like."
            className="w-full rounded-lg border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-sky-400"
          />
          <div className="flex flex-wrap gap-2">
            <select name="kind" className="rounded-lg border border-black/10 px-3 py-2 text-sm">
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <select name="area" className="rounded-lg border border-black/10 px-3 py-2 text-sm">
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <select name="severity" defaultValue="normal" className="rounded-lg border border-black/10 px-3 py-2 text-sm">
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s === "money" ? "money leak" : s}
                </option>
              ))}
            </select>
            <input
              name="submitted_by"
              defaultValue="ronan"
              className="w-28 rounded-lg border border-black/10 px-3 py-2 text-sm"
              aria-label="who is reporting"
            />
          </div>
          <label className="block text-sm text-neutral-600">
            screenshots, optional
            <input name="screenshots" type="file" accept="image/*" multiple className="mt-1 block w-full text-sm" />
          </label>
          <button disabled={pending} className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700">
            submit report
          </button>
        </form>
      )}

      {/* ARCHIVE. Collapsed by default, one row per ship. */}
      {archive.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Done</h2>
          {archive.map((b) => (
            <BatchBlock key={b.id} batch={b} batches={board.batches} defaultOpen={false} />
          ))}
        </section>
      )}

      {/* OPEN. An unfinished batch is NOT a third zone: its items stay in this
          list, tagged, until the batch is verified live. Only its controls sit
          up here, so there is one place to look for outstanding work. */}
      <section className="space-y-2">
        {inFlight.map((b) => (
          <BatchControls key={b.id} batch={b} />
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Open ({board.open.length})</h2>
          <div className="ml-auto flex flex-wrap gap-1">
            {["all", ...KINDS].map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  filter === k ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        {selected.size > 0 && (
          <form
            action={(fd) =>
              start(() => {
                startBatch(fd);
                setSelected(new Set());
              })
            }
            className="flex flex-wrap items-center gap-2 rounded-xl bg-sky-50 p-3"
          >
            {[...selected].map((id) => (
              <input key={id} type="hidden" name="item_ids" value={id} />
            ))}
            <span className="text-sm font-medium text-sky-900">{selected.size} picked</span>
            <input name="title" placeholder="what this batch is about, optional" className="flex-1 rounded-lg border border-sky-200 px-3 py-1.5 text-sm" />
            <button className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
              {inFlight.length ? "add to the current batch" : "start a batch"}
            </button>
          </form>
        )}

        {open.map((i) => (
          <ItemRow
            key={i.id}
            item={i}
            batches={board.batches}
            batchLabel={i.batchId ? `batch ${String(batchNumber.get(i.batchId) ?? 0).padStart(2, "0")}` : null}
            selectable
            selected={selected.has(i.id)}
            onSelect={toggle}
          />
        ))}
        {!open.length && <p className="rounded-xl border border-dashed border-black/10 px-4 py-8 text-center text-sm text-neutral-400">nothing open here</p>}
      </section>

      {board.dropped.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Ruled out ({board.dropped.length})</h2>
          {board.dropped.map((i) => (
            <ItemRow key={i.id} item={i} batches={board.batches} />
          ))}
        </section>
      )}
    </div>
  );
}
