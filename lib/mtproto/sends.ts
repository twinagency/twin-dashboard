// lib/mtproto/sends.ts
//
// Builds the SENDS TABLE (N2.4: "every send with ts, fan, exact text, status,
// error, reply Y/N, reply latency, purchase Y/N + stars") from a run's
// episodes plus a bounded star_transactions lookup, and a matching cloneName
// lookup so the table reads "Riley" not a uuid.

import { ATTRIBUTION_WINDOWS_HOURS, type AttributionWindowHours, type CreatorLite, type EpisodeState, type ReengageEpisode, type SendRow } from "./types";
import { loadPurchasesForEpisodes, type PurchaseRead } from "./attribution";

// States where a send was attempted or landed. cancelled/skipped/claimed/
// prepared/eligible/holdout are NOT sends and never appear in the table.
const SEND_TABLE_STATES: EpisodeState[] = ["sent", "acked", "replied", "failed", "uncertain"];
const HOUR = 3_600_000;
const WIDEST_MS = ATTRIBUTION_WINDOWS_HOURS[ATTRIBUTION_WINDOWS_HOURS.length - 1] * HOUR;

function firstWindowHit(paidMs: number, sentMs: number): AttributionWindowHours | null {
  const hours = (paidMs - sentMs) / HOUR;
  if (hours < 0) return null;
  for (const w of ATTRIBUTION_WINDOWS_HOURS) if (hours <= w) return w;
  return null;
}

export async function buildSendRows(episodes: ReengageEpisode[], creators: CreatorLite[], purchases?: PurchaseRead): Promise<SendRow[]> {
  const sent = episodes.filter((e) => !e.dryRun && SEND_TABLE_STATES.includes(e.state)); // simulated (dry) rows are not sends
  const nameOf = new Map(creators.map((c) => [c.id, c.name]));
  const read = purchases ?? (await loadPurchasesForEpisodes(episodes));
  const ordersByUser = new Map<string, typeof read.orders>();
  for (const o of read.orders) {
    const list = ordersByUser.get(o.userId) ?? [];
    list.push(o);
    ordersByUser.set(o.userId, list);
  }

  return sent.map((e) => {
    const sentMs = e.sentAt ? new Date(e.sentAt).getTime() : null;
    let boughtStars: number | null = null;
    let boughtWithinHours: AttributionWindowHours | null = null;
    // Total paid Stars within the widest window after this send, and the
    // narrowest window the first such purchase fell in.
    if (sentMs != null) {
      for (const o of ordersByUser.get(e.userId) ?? []) {
        if (o.cloneId !== e.cloneId || o.paidMs < sentMs || o.paidMs - sentMs > WIDEST_MS) continue;
        boughtStars = (boughtStars ?? 0) + o.stars;
        const w = firstWindowHit(o.paidMs, sentMs);
        if (w != null && (boughtWithinHours == null || w < boughtWithinHours)) boughtWithinHours = w;
      }
    }
    return {
      episodeId: e.id,
      cloneId: e.cloneId,
      cloneName: nameOf.get(e.cloneId) ?? e.cloneId,
      userId: e.userId,
      telegramId: e.telegramId,
      sentAt: e.sentAt,
      text: e.ackedText ?? e.preparedText,
      state: e.state,
      errorCode: e.errorCode,
      repliedAt: e.state === "replied" ? e.updatedAt : null,
      boughtStars,
      boughtWithinHours,
    };
  });
}

// ── CSV export (N2.4: "Filter by creator/status/date/error. CSV export.") ──
// RFC 4180 minimal escaping: wrap in quotes and double any embedded quote.
// The exact send text can contain commas/newlines, which is exactly the case
// this exists to handle correctly.
function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  // Spreadsheet formula injection: a text cell starting with = + - @ (or a
  // tab/CR) is executed by Excel/Sheets. The exact send text is model output.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function sendsToCsv(rows: SendRow[]): string {
  const header = ["episode_id", "creator", "user_id", "telegram_id", "sent_at", "state", "error_code", "text", "replied_at", "bought_stars", "bought_within_hours"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.episodeId,
        r.cloneName,
        r.userId,
        r.telegramId,
        r.sentAt ?? "",
        r.state,
        r.errorCode ?? "",
        r.text ?? "",
        r.repliedAt ?? "",
        r.boughtStars ?? "",
        r.boughtWithinHours ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
