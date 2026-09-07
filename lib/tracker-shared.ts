// The tracker: every bug, feature request and cock-up, plus the batches they
// get fixed in. Schema and the reasoning behind its shape live in
// ../bot/db/migrations/110_tracker.sql - read that first.
//
// This file is the ONE place that reads the tracker tables. The page, the
// server actions and the admin API route all come through here, so there is a
// single definition of "what an open item is" and a single shape on the wire.



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

// NEWEST FIRST, FULL STOP. Date is the sort; severity is a badge on the row.
//
// It has been through both other orderings today and both failed the same way.
// Oldest-first put seven items filed by hand hundreds of rows down. Severity
// bands with newest-first inside them looked fixed and was not: 211 of the 457
// open items are tagged MONEY, so today's two money items showed at the top and
// the other five sat under all 211 of them. The operator's read of the page was
// "only 2 of Jesse's got filed", which is the exact failure the board exists to
// prevent, twice in one day.
//
// The queue-jumping severity was meant to give is not lost: MONEY and high
// render as coloured chips on every row and the counts are in the header, so
// what leaks money is still obvious. What a chronological list adds is the
// thing a triage order cannot: "I reported that this morning" and "it is at the
// top" are the same statement.
const SEVERITY_RANK: Record<Severity, number> = { money: 0, high: 1, normal: 2, low: 3 };

export function sortOpen(items: TrackerItem[]): TrackerItem[] {
  return [...items].sort((a, b) => {
    const t = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (t !== 0) return t;
    // Same instant (a bot files a whole run in one go): severity decides, so a
    // money find still leads its own batch of arrivals.
    return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  });
}

export type ItemRow = {
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

export function mapItem(row: ItemRow): TrackerItem {
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

