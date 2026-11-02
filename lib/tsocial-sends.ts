// What the T-Social bot sent fans: pure grouping, no database and no Next imports.
//
// Source of truth is tsocial_bot_sends (written by twin-reels server/index.mjs tg(), table db/2026-10-08-tsocial-bot-sends.sql).
// Before that logging is deployed the table is empty, so the page also rebuilds the one send the bot has always made to a
// buyer, the VIP bundle delivery, from tsocial_unlocks.delivered_at + tsocial_vip_items. Those rows are marked reconstructed
// and are dropped as soon as a real logged send exists for the same fan within a few minutes of the delivery.

export type SendRow = { id: number; at: string; tg_user_id: number; method: string; text: string | null; media: { type: string }[] | null; ok: boolean; error: string | null };
export type UnlockRow = { post_id: string; tg_user_id: number; delivered_at: string | null };
export type Bubble = { key: string; at: string; tg: number; text: string | null; media: { type: "photo" | "video" }[]; ok: boolean; error: string | null; reconstructed: boolean };
export type Thread = { tg: number; last: string; count: number; failed: number; bubbles: Bubble[] };

export const VIP_DELIVERY_TEXT = (n: number) => `🫦 Your VIP bundle is unlocked. ${n} pics and videos, all yours. Enjoy 💦`;
const MATCH_MS = 5 * 60_000;

export function reconstructDeliveries(unlocks: UnlockRow[], items: Map<string, { type: string }[]>, real: SendRow[]): Bubble[] {
  const realAt = new Map<number, number[]>();
  for (const r of real) (realAt.get(r.tg_user_id) ?? realAt.set(r.tg_user_id, []).get(r.tg_user_id)!).push(Date.parse(r.at));
  const out: Bubble[] = [];
  for (const u of unlocks) {
    if (!u.delivered_at) continue;
    const t = Date.parse(u.delivered_at);
    if ((realAt.get(u.tg_user_id) ?? []).some((x) => Math.abs(x - t) <= MATCH_MS)) continue;
    const media = (items.get(u.post_id) ?? []).map((m) => ({ type: (m.type === "video" ? "video" : "photo") as "photo" | "video" }));
    if (!media.length) continue;
    out.push({ key: `u:${u.post_id}:${u.tg_user_id}`, at: u.delivered_at, tg: u.tg_user_id, text: VIP_DELIVERY_TEXT(media.length), media: [], ok: true, error: null, reconstructed: true });
    out.push({ key: `u:${u.post_id}:${u.tg_user_id}:m`, at: new Date(t + 1000).toISOString(), tg: u.tg_user_id, text: null, media, ok: true, error: null, reconstructed: true });
  }
  return out;
}

export function groupSends(real: SendRow[], reconstructed: Bubble[]): Thread[] {
  const bubbles: Bubble[] = [
    ...real.map((r) => ({ key: `r:${r.id}`, at: r.at, tg: r.tg_user_id, text: r.text, media: (r.media ?? []).map((m) => ({ type: (m.type === "video" ? "video" : "photo") as "photo" | "video" })), ok: r.ok, error: r.error, reconstructed: false })),
    ...reconstructed,
  ];
  const by = new Map<number, Bubble[]>();
  for (const b of bubbles) (by.get(b.tg) ?? by.set(b.tg, []).get(b.tg)!).push(b);
  return [...by.entries()].map(([tg, bs]) => {
    bs.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.key < b.key ? -1 : 1));
    return { tg, last: bs[bs.length - 1].at, count: bs.length, failed: bs.filter((b) => !b.ok).length, bubbles: bs };
  }).sort((a, b) => (a.last < b.last ? 1 : -1));
}
