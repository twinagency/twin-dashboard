// T-Social: the Telegram Mini App feed (twin-reels/site). The public feed and event
// API live on AWS Lambda (twin-reels/server), not on this dashboard. Only the admin
// page helpers remain here. No Next imports so checks run offline.

export const TSOCIAL_ORIGIN = "https://dsygeknm080dt.cloudfront.net";

/** True when a PostgREST error means the T-Social tables are not there yet. */
export function tablesMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return !!e && (e.code === "42P01" || e.code === "PGRST205" || /tsocial_.*(does not exist|schema cache)/.test(e.message ?? ""));
}

/** Public URL for a media path (post src, poster or avatar key). */
export function tsocialMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${TSOCIAL_ORIGIN}/${path.replace(/^\/+/, "")}`;
}

// ── Settings ─────────────────────────────────────────────────────────────────
export const SETTING_KEYS = ["price_stars", "ton_test_flat", "ton_discount_pct", "platform_cut_pct", "monthly_post_limit", "blocked_domains"] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];
/** Settings that move money: the UI asks for a confirm step before saving these. */
export const MONEY_KEYS: readonly SettingKey[] = ["price_stars", "ton_test_flat", "ton_discount_pct", "platform_cut_pct"];

export type SettingResult = { ok: true; value: number | string[] | null } | { ok: false; error: string };

const DOMAIN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/** Turn a pasted list (commas, spaces or newlines, URLs allowed) into clean lowercase hostnames. */
export function parseDomains(input: string | string[]): string[] | null {
  const parts = (Array.isArray(input) ? input : input.split(/[\s,]+/)).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const out: string[] = [];
  for (const raw of parts) {
    const host = raw.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
    if (!DOMAIN.test(host)) return null;
    if (!out.includes(host)) out.push(host);
  }
  return out;
}

/** Validate one setting from raw form text. Server action and UI both use this. */
export function validateSetting(key: string, raw: unknown): SettingResult {
  const text = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw);
  const int = (min: number, max: number, label: string): SettingResult => {
    if (!/^\d+$/.test(text)) return { ok: false, error: `${label} must be a whole number` };
    const n = Number(text);
    return n < min || n > max ? { ok: false, error: `${label} must be ${min} to ${max}` } : { ok: true, value: n };
  };
  switch (key) {
    case "price_stars": return int(1, 100000, "Price in Stars");
    case "ton_discount_pct": return int(0, 100, "TON discount");
    case "platform_cut_pct": return int(0, 100, "Platform cut");
    case "monthly_post_limit": return int(1, 1000, "Monthly post limit");
    case "ton_test_flat": {
      if (text === "" || text.toLowerCase() === "null") return { ok: true, value: null };
      if (!/^\d+(\.\d{1,9})?$/.test(text)) return { ok: false, error: "TON flat price must be a number, or empty" };
      const n = Number(text);
      return n <= 0 || n > 10000 ? { ok: false, error: "TON flat price must be above 0 and at most 10000" } : { ok: true, value: n };
    }
    case "blocked_domains": {
      const list = parseDomains(Array.isArray(raw) ? (raw as string[]) : text);
      if (!list) return { ok: false, error: "Blocked domains must be hostnames like example.com" };
      return list.length > 500 ? { ok: false, error: "At most 500 domains" } : { ok: true, value: list };
    }
    default: return { ok: false, error: "Unknown setting" };
  }
}

// ── Reports ──────────────────────────────────────────────────────────────────
export type ReportRow = { id: number; post_id: string | null; chat_post_id: string | null; tg_user_id: number | null; reason: string | null; created_at: string };
export type ReportGroup = {
  kind: "clip" | "chat";
  itemId: string;
  count: number;
  reporters: number;
  reasons: string[];
  latest: string;
  reportIds: number[];
};

/** One group per reported item, with report count and unique reporters, newest report first. */
export function groupReports(rows: ReportRow[]): ReportGroup[] {
  const map = new Map<string, ReportGroup & { _who: Set<number> }>();
  for (const r of rows) {
    const itemId = r.post_id ?? r.chat_post_id;
    if (!itemId) continue;
    const kind = r.post_id ? "clip" : "chat";
    const k = `${kind}:${itemId}`;
    let g = map.get(k);
    if (!g) { g = { kind, itemId, count: 0, reporters: 0, reasons: [], latest: r.created_at, reportIds: [], _who: new Set() }; map.set(k, g); }
    g.count++;
    g.reportIds.push(r.id);
    if (r.tg_user_id != null) g._who.add(r.tg_user_id);
    const reason = (r.reason ?? "").trim();
    if (reason && !g.reasons.includes(reason)) g.reasons.push(reason);
    if (r.created_at > g.latest) g.latest = r.created_at;
  }
  return [...map.values()]
    .map(({ _who, ...g }) => ({ ...g, reporters: _who.size }))
    .sort((a, b) => (a.latest < b.latest ? 1 : a.latest > b.latest ? -1 : 0));
}
