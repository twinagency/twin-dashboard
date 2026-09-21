// lib/mtproto/sends.ts
//
// Builds the SENDS TABLE (N2.4: "every send with ts, fan, exact text, status,
// error, reply Y/N, reply latency, purchase Y/N + stars") from a run's
// episodes plus a bounded star_transactions lookup, and a matching cloneName
// lookup so the table reads "Riley" not a uuid.

import { ATTRIBUTION_WINDOWS_HOURS, type AttributionWindowHours, type CreatorLite, type ReengageEpisode, type SendRow } from "./types";
import { purchasesForUsers } from "./attribution";

function firstWindowHit(paidMs: number, sentMs: number): AttributionWindowHours | null {
  const hours = (paidMs - sentMs) / 3_600_000;
  if (hours < 0) return null;
  for (const w of ATTRIBUTION_WINDOWS_HOURS) if (hours <= w) return w;
  return null;
}

export async function buildSendRows(episodes: ReengageEpisode[], creators: CreatorLite[]): Promise<SendRow[]> {
  const sent = episodes.filter((e) => e.state !== "holdout" && e.state !== "eligible");
  const nameOf = new Map(creators.map((c) => [c.id, c.name]));
  const userIds = [...new Set(sent.map((e) => e.userId))];
  const earliestSentMs = sent.reduce((min, e) => {
    const t = e.sentAt ? new Date(e.sentAt).getTime() : Infinity;
    return Math.min(min, t);
  }, Date.now());
  const purchases = userIds.length ? await purchasesForUsers(userIds, new Date(earliestSentMs).toISOString()) : [];
  const purchasesByUser = new Map<string, typeof purchases>();
  for (const p of purchases) {
    const list = purchasesByUser.get(p.user_id) ?? [];
    list.push(p);
    purchasesByUser.set(p.user_id, list);
  }

  return sent.map((e) => {
    const sentMs = e.sentAt ? new Date(e.sentAt).getTime() : null;
    let boughtStars: number | null = null;
    let boughtWithinHours: AttributionWindowHours | null = null;
    if (sentMs != null) {
      for (const p of purchasesByUser.get(e.userId) ?? []) {
        const paidMs = new Date(p.paid_at ?? p.created_at).getTime();
        const window = firstWindowHit(paidMs, sentMs);
        if (window != null && (boughtWithinHours == null || window < boughtWithinHours)) {
          boughtWithinHours = window;
          boughtStars = (boughtStars ?? 0) + (p.amount_stars ?? 0);
        }
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
  const s = v == null ? "" : String(v);
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
