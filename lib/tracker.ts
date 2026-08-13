// The tracker: every bug, feature request and cock-up, plus the batches they
// get fixed in. Schema and the reasoning behind its shape live in
// ../bot/db/migrations/110_tracker.sql - read that first.
//
// This file is the ONE place that reads the tracker tables. The page, the
// server actions and the admin API route all come through here, so there is a
// single definition of "what an open item is" and a single shape on the wire.

import { supabaseAdmin } from "./supabase";

export const KINDS = ["bug", "code", "feature", "config", "prompt", "design", "dashboard", "deploy", "test", "question", "content"] as const;
export const AREAS = ["bot", "dashboard", "infra", "content", "unknown"] as const;
export const SEVERITIES = ["money", "high", "normal", "low"] as const;
// The lifecycle. Deliberately four steps between "reported" and "done", because
// on this project push, deploy and running-in-the-container have each been
// mistaken for "fixed" and each mistake cost real money.
export const STATUSES = ["open", "fixed", "pushed", "live", "closed", "wontfix"] as const;

export type Kind = (typeof KINDS)[number];
export type Area = (typeof AREAS)[number];
export type Severity = (typeof SEVERITIES)[number];
export type Status = (typeof STATUSES)[number];

export type TrackerCommit = {
  id: string;
  repo: string;
  sha: string;
  subject: string;
  authoredAt: string | null;
};

export type TrackerNote = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

export type TrackerAttachment = {
  id: string;
  path: string;
  filename: string;
  mime: string;
  bytes: number;
};

export type TrackerItem = {
  id: string;
  number: number;
  title: string;
  body: string;
  kind: Kind;
  area: Area;
  severity: Severity;
  status: Status;
  fixNote: string;
  batchId: string | null;
  submittedBy: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  commits: TrackerCommit[];
  notes: TrackerNote[];
  attachments: TrackerAttachment[];
};

export type TrackerBatch = {
  id: string;
  number: number;
  title: string;
  status: "working" | "shipped" | "live";
  /** migration 117: the high-level "what changed" line, read before the items */
  summary: string;
  deployNote: string;
  shippedAt: string | null;
  liveAt: string | null;
  createdAt: string;
  items: TrackerItem[];
};

// Two zones only, DONE and OPEN. An item is OPEN until the batch carrying it
// has actually gone live on the boxes. Being picked up into a batch does not
// make it done, and a separate "being fixed now" zone was just a third place
// to look: an item in an unfinished batch stays in the open list, tagged.
export function isOpen(item: TrackerItem, liveBatchIds: Set<string>): boolean {
  if (item.status === "closed" || item.status === "wontfix") return false;
  return item.batchId === null || !liveBatchIds.has(item.batchId);
}

// Whole days since a timestamp. Used for the "4d" age badge on an open row,
// which is the only number that reliably shames anyone into fixing something.
export function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function ageLabel(iso: string): string {
  const d = daysSince(iso);
  if (d === 0) return "today";
  if (d === 1) return "1d";
  return `${d}d`;
}

// Severity first (money leaks jump the queue), then oldest first. Age is the
// tiebreak rather than newest-first on purpose: the point of the open list is
// to surface what has been rotting, not what was typed most recently.
const SEVERITY_RANK: Record<Severity, number> = { money: 0, high: 1, normal: 2, low: 3 };

export function sortOpen(items: TrackerItem[]): TrackerItem[] {
  return [...items].sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    // NEWEST FIRST inside a severity band (changed 2026-08-13). It used to be
    // oldest first, on the reasoning that the longest-waiting item deserves the
    // top. With 457 open items that is unusable: seven items filed by hand
    // landed at the BOTTOM of their bands, several hundred rows down, and the
    // operator's reasonable conclusion from looking at the page was that they
    // had never been filed at all. A board you cannot find today's report on is
    // not a board. Severity still wins, so MONEY is still above everything.
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

type ItemRow = {
  id: string;
  number: number;
  title: string;
  body: string;
  kind: Kind;
  area: Area;
  severity: Severity;
  status: Status;
  fix_note: string;
  batch_id: string | null;
  submitted_by: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

function mapItem(row: ItemRow): TrackerItem {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    body: row.body ?? "",
    kind: row.kind,
    area: row.area,
    severity: row.severity,
    status: row.status,
    fixNote: row.fix_note ?? "",
    batchId: row.batch_id,
    submittedBy: row.submitted_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    commits: [],
    notes: [],
    attachments: [],
  };
}

export type BotJob = { id: string; bot: string; itemId: string | null; status: string; result: string };

export type TrackerBoard = {
  open: TrackerItem[];
  batches: TrackerBatch[];
  // Closed without a fix. Kept off the board but not deleted, because "we
  // already decided this one is not a bug" is exactly the knowledge that gets
  // lost and re-investigated three sessions later (see ../BACKLOG.txt).
  dropped: TrackerItem[];
  jobs: BotJob[];
};

// One read for the whole board. Four flat selects and a join in memory rather
// than nested PostgREST embeds: the tables are small, and a flat select cannot
// silently drop children the way an embed with a bad foreign-key hint does.
export async function loadBoard(): Promise<TrackerBoard> {
  const [itemsRes, batchesRes, commitsRes, notesRes, attsRes, jobsRes] = await Promise.all([
    supabaseAdmin.from("tracker_items").select("*").order("number", { ascending: false }),
    supabaseAdmin.from("tracker_batches").select("*").order("number", { ascending: false }),
    supabaseAdmin.from("tracker_commits").select("*").order("authored_at", { ascending: true }),
    supabaseAdmin.from("tracker_notes").select("*").order("created_at", { ascending: true }),
    supabaseAdmin.from("tracker_attachments").select("*").order("created_at", { ascending: true }),
    supabaseAdmin.from("tracker_bot_jobs").select("id,bot,item_id,status,result").order("created_at", { ascending: false }).limit(200),
  ]);

  const items = (itemsRes.data ?? []).map((r) => mapItem(r as ItemRow));
  const byId = new Map(items.map((i) => [i.id, i]));

  for (const c of commitsRes.data ?? []) {
    byId.get(c.item_id)?.commits.push({
      id: c.id,
      repo: c.repo,
      sha: c.sha,
      subject: c.subject ?? "",
      authoredAt: c.authored_at,
    });
  }
  for (const n of notesRes.data ?? []) {
    byId.get(n.item_id)?.notes.push({ id: n.id, author: n.author, body: n.body, createdAt: n.created_at });
  }
  for (const a of attsRes.data ?? []) {
    byId.get(a.item_id)?.attachments.push({
      id: a.id,
      path: a.path,
      filename: a.filename ?? "",
      mime: a.mime ?? "",
      bytes: a.bytes ?? 0,
    });
  }

  const batches: TrackerBatch[] = (batchesRes.data ?? []).map((b) => ({
    id: b.id,
    number: b.number,
    title: b.title ?? "",
    status: b.status,
    summary: b.summary ?? "",
    deployNote: b.deploy_note ?? "",
    shippedAt: b.shipped_at,
    liveAt: b.live_at,
    createdAt: b.created_at,
    items: items.filter((i) => i.batchId === b.id).sort((a, c) => a.number - c.number),
  }));

  const liveBatchIds = new Set(batches.filter((b) => b.status === "live").map((b) => b.id));

  return {
    open: sortOpen(items.filter((i) => isOpen(i, liveBatchIds))),
    batches,
    dropped: items.filter((i) => i.status === "closed" || i.status === "wontfix"),
    jobs: (jobsRes.data ?? []).map((j) => ({ id: j.id, bot: j.bot, itemId: j.item_id, status: j.status, result: j.result ?? "" })),
  };
}

// The plain-text view, for a terminal. This is what a Claude Code session sees
// when it asks "what is on the list" at the start of a session, and what the
// operator gets if he ever wants to paste the board somewhere. Deliberately
// the same two-part shape as his own status docs: the item lines first, then
// what is in flight.
export function boardAsText(board: TrackerBoard): string {
  const lines: string[] = [];
  const working = board.batches.filter((b) => b.status !== "live");

  lines.push("TRACKER  -  open items, newest batches first");
  lines.push("=".repeat(79));
  lines.push("");

  if (working.length) {
    for (const b of working) {
      lines.push(`BATCH ${String(b.number).padStart(2, "0")}  ${b.status.toUpperCase()}  ${b.title}`.trimEnd());
      for (const i of b.items) {
        lines.push(`  #${i.number}  ${i.title}  [${i.status}]`);
        if (i.fixNote) lines.push(`        ${i.fixNote.split("\n")[0]}`);
      }
      lines.push("");
    }
  }

  lines.push(`OPEN (${board.open.length})`);
  if (!board.open.length) lines.push("  nothing open");
  for (const i of board.open) {
    const sev = i.severity === "money" ? " MONEY" : i.severity === "high" ? " HIGH" : "";
    lines.push(`  #${i.number}  ${i.title}  (${i.kind}/${i.area}${sev}, ${ageLabel(i.createdAt)})`);
  }
  lines.push("");

  const live = board.batches.filter((b) => b.status === "live");
  if (live.length) {
    lines.push(`ARCHIVE  ${live.length} shipped batches, ${live.reduce((n, b) => n + b.items.length, 0)} items fixed`);
  }
  return lines.join("\n");
}
