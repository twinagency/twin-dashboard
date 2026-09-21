// lib/mtproto/halt.ts
//
// Spike AUTO-HALTS (twin-userbot src/spike.ts). When a creator's opt-out /
// complaint / hard-error rate trips a threshold the worker sets
// userbot_connections.paused = true with paused_reason
// 'auto_halt_spike:<kind>' and logs an account_halt event whose detail carries
// stats + threshold. This module turns those raw shapes into something an
// operator can read, tells an auto-halt apart from a manual pause, and owns
// the typed phrase that gates resuming one.
//
// Pure functions first (tested against the exact shapes spike.ts writes), then
// one bounded read.

import { mtDb } from "./db";
import { AUTO_HALT_PREFIX, RESUME_PHRASE, type AutoHaltInfo, type UserbotConnection } from "./types";

/** The kind suffix of an auto-halt pause reason, or null for a manual pause
 *  (or no pause). An unknown suffix under the prefix is STILL an auto-halt. */
export function autoHaltKind(pausedReason: string | null | undefined): string | null {
  if (typeof pausedReason !== "string" || !pausedReason.startsWith(AUTO_HALT_PREFIX)) return null;
  return pausedReason.slice(AUTO_HALT_PREFIX.length) || "unknown";
}

export function isAutoHalted(conn: Pick<UserbotConnection, "paused" | "pausedReason"> | null | undefined): boolean {
  return !!conn?.paused && autoHaltKind(conn.pausedReason) !== null;
}

const KIND_TEXT: Record<string, { label: string; explanation: string }> = {
  optout_spike: { label: "Opt-out spike", explanation: "Too many fans replied stop / unsubscribe to the re-engagement message." },
  complaint_spike: { label: "Complaint spike", explanation: "Too many fans replied with complaints (angry, spam, report)." },
  error_spike: { label: "Send-error spike", explanation: "Too many sends failed with per-fan privacy, blocked or peer errors." },
  detector_error: { label: "Detector error", explanation: "The spike detector could not read its own numbers, so it halted rather than send blind." },
};

const pct = (r: number) => `${(r * 100).toFixed(1).replace(/\.0$/, "")}%`;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

const STAT_KEY: Record<string, { key: "optOuts" | "complaints" | "failures"; what: string; unit: string }> = {
  optout_spike: { key: "optOuts", what: "opted out", unit: "opt-outs" },
  complaint_spike: { key: "complaints", what: "complained", unit: "complaints" },
  error_spike: { key: "failures", what: "hard-failed", unit: "hard failures" },
};

/** What tripped, from an account_halt event's detail. Tolerates missing fields. */
export function describeHaltDetail(kind: string, detail: Record<string, unknown> | null | undefined): { tripped: string | null; threshold: string | null } {
  const d = detail ?? {};
  const stats = obj(d.stats);
  const th = obj(d.threshold);
  const sk = STAT_KEY[kind];
  let tripped: string | null = null;
  if (kind === "detector_error") {
    tripped = typeof d.error === "string" && d.error ? `detector error: ${d.error.slice(0, 200)}` : null;
  } else if (stats && sk) {
    const sample = num(stats.sample);
    const count = num(stats[sk.key]);
    const rate = num(d.rate);
    if (sample != null && count != null) {
      tripped = `${count} of ${sample} recent sends ${sk.what}${rate != null ? ` (${pct(rate)})` : sample > 0 ? ` (${pct(count / sample)})` : ""}`;
    }
  }
  let threshold: string | null = null;
  if (th && sk) {
    const parts: string[] = [];
    const r = num(th.rate);
    const c = num(th.count);
    if (r != null) parts.push(`${pct(r)} of sends`);
    if (c != null) parts.push(`${c} ${sk.unit}`);
    const min = num(th.minSample);
    if (parts.length) {
      threshold = `trips at ${parts.join(" or ")}${min != null ? `, minimum ${min} sends` : ""}`;
      const w = num(d.windowHours);
      const smax = num(d.sampleMax);
      if (w != null) threshold += `, last ${w}h${smax != null ? ` (up to ${smax} sends)` : ""}`;
    }
  }
  return { tripped, threshold };
}

export type HaltEventLike = { id?: number | null; ts: string; event_type?: string; detail: Record<string, unknown> };

/** The account_halt event that explains the CURRENT pause: same errorCode as
 *  paused_reason when there is one, else the newest auto halt. `events` must be
 *  newest-first. Never falls back to an unrelated flood-wait halt. */
export function pickHaltEvent(pausedReason: string, events: HaltEventLike[]): HaltEventLike | null {
  const halts = events.filter((e) => (e.event_type ?? "account_halt") === "account_halt");
  return halts.find((e) => e.detail?.errorCode === pausedReason) ?? halts.find((e) => e.detail?.auto === true) ?? null;
}

/** Build the read-out for a paused connection, or null when the pause is not an auto-halt. */
export function buildAutoHaltInfo(pausedReason: string | null | undefined, event: HaltEventLike | null): AutoHaltInfo | null {
  const kind = autoHaltKind(pausedReason);
  if (!kind) return null;
  const text = KIND_TEXT[kind] ?? { label: `Auto-halt (${kind})`, explanation: "The worker paused this creator automatically." };
  const d = describeHaltDetail(kind, event?.detail);
  return {
    kind,
    label: text.label,
    explanation: text.explanation,
    tripped: event ? d.tripped : null,
    threshold: event ? d.threshold : null,
    haltedAt: event?.ts ?? null,
    eventFound: !!event,
  };
}

/** One-line human text for an account_halt event (feed, run page, API). null
 *  for an account_halt that is not a spike auto-halt. */
export function describeAutoHaltEvent(detail: Record<string, unknown> | null | undefined): string | null {
  const d = detail ?? {};
  const kind = typeof d.kind === "string" ? d.kind : autoHaltKind(typeof d.errorCode === "string" ? d.errorCode : null);
  if (!kind || (d.auto !== true && autoHaltKind(typeof d.errorCode === "string" ? d.errorCode : null) === null)) return null;
  const text = KIND_TEXT[kind] ?? { label: `Auto-halt (${kind})` };
  const x = describeHaltDetail(kind, d);
  return [`AUTO-HALTED: ${text.label}`, x.tripped, x.threshold].filter(Boolean).join(" · ");
}

// ── resume gate ─────────────────────────────────────────────────────────────

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** First 8 chars of the id, the "short id" an operator can type. */
export const shortId = (cloneId: string) => cloneId.slice(0, 8);

/** "RESUME <clone name>" (the phrase shown to the operator). */
export function resumePhraseFor(cloneName: string | null | undefined): string {
  return `${RESUME_PHRASE} ${cloneName && cloneName.trim() ? cloneName.trim() : ""}`.trim();
}

/** True only for `RESUME <clone name>` or `RESUME <short id>`, case- and
 *  whitespace-insensitive. Bare RESUME never passes: it must name the creator. */
export function resumePhraseOk(typed: string | null | undefined, cloneName: string | null | undefined, cloneId: string): boolean {
  if (typeof typed !== "string") return false;
  const t = norm(typed);
  const ok = [`${RESUME_PHRASE} ${shortId(cloneId)}`, `${RESUME_PHRASE} ${cloneId}`];
  if (cloneName && cloneName.trim()) ok.push(`${RESUME_PHRASE} ${cloneName}`);
  return ok.some((o) => norm(o) === t);
}

// ── bounded read ────────────────────────────────────────────────────────────

/** Newest-first account_halt events for the given creators, bounded by clone_id
 *  (indexed) and the last 30 days. Throws on a read error: "no halt info" must
 *  never look like "no halt". A missing table reads as none. */
export async function listHaltEvents(cloneIds: string[]): Promise<Array<HaltEventLike & { clone_id: string | null }>> {
  if (cloneIds.length === 0) return [];
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await mtDb()
    .from("reengage_events")
    .select("id,clone_id,ts,event_type,detail")
    .in("clone_id", cloneIds)
    .eq("event_type", "account_halt")
    .gte("ts", since)
    .order("ts", { ascending: false })
    .order("id", { ascending: false })
    .limit(2_000);
  if (error) {
    if (/does not exist|could not find the table|PGRST205|42P01/i.test(`${error.code ?? ""} ${error.message}`)) return [];
    throw new Error(`could not read account_halt events: ${error.message}`);
  }
  return data as Array<HaltEventLike & { clone_id: string | null }>;
}

/** cloneId -> AutoHaltInfo for every connection that is auto-halted right now. */
export async function autoHaltsFor(connections: UserbotConnection[]): Promise<Map<string, AutoHaltInfo>> {
  const halted = connections.filter((c) => isAutoHalted(c));
  const out = new Map<string, AutoHaltInfo>();
  if (halted.length === 0) return out;
  let events: Array<HaltEventLike & { clone_id: string | null }> = [];
  try {
    events = await listHaltEvents(halted.map((c) => c.cloneId));
  } catch (e) {
    console.error(`[mtproto] ${e instanceof Error ? e.message : e}`);
    // Still flag the row AUTO-HALTED (from paused_reason alone), just without the numbers.
  }
  for (const c of halted) {
    const info = buildAutoHaltInfo(c.pausedReason, pickHaltEvent(c.pausedReason as string, events.filter((e) => e.clone_id === c.cloneId)));
    if (info) out.set(c.cloneId, info);
  }
  return out;
}
