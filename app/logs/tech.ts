// Single source of truth for mapping log rows to a "tech" bucket and for the
// filter chip definitions (fans-page chip style). Used by the server page
// (query filtering) and the client filter bar (rendering).

export type Tech = "elevenlabs" | "llm" | "telegram" | "supabase" | "payments" | "code";

// system_logs.source values claimed by each bucket. Anything unclaimed falls
// through to "code" (watchdog, safety, handler, campaign, followup, workers).
//
// "payments" is its own bucket, not folded into "telegram": rejected/duplicate
// charges, credit grants, and tip records (payments.ts, star-reconcile.ts) are
// a distinct operator concern from generic message delivery, and used to be
// invisible here entirely (console.log/console.error only, never logSystem()).
export const SYSTEM_SOURCE_BUCKETS: Record<Exclude<Tech, "code">, string[]> = {
  elevenlabs: ["tts", "elevenlabs"],
  llm: ["llm", "openrouter"],
  telegram: ["telegram", "star-reconcile", "operator-send", "business-account"],
  supabase: ["store", "supabase", "db"],
  payments: ["payments"],
};

export const CLAIMED_SOURCES = Object.values(SYSTEM_SOURCE_BUCKETS).flat();

export function techForSystemSource(source: string): Tech {
  for (const [tech, sources] of Object.entries(SYSTEM_SOURCE_BUCKETS)) {
    if (sources.includes(source)) return tech as Tech;
  }
  return "code";
}

// usage_events.kind: tts is an ElevenLabs call; everything else (llm, vision,
// stt, ...) is a model call and lives under the LLM bucket.
export function techForUsageKind(kind: string): Tech {
  return kind === "tts" ? "elevenlabs" : "llm";
}

// Filter chips, same shape/style as the Fans page FILTERS.
export const TECH_CHIPS: { key: Tech | "all"; label: string; on: string; off: string }[] = [
  { key: "all", label: "🧾 All", on: "border-line bg-muted/20 text-ink", off: "border-line text-ink/70" },
  { key: "elevenlabs", label: "🎙 ElevenLabs", on: "border-accent-2/55 bg-accent-2/15 text-accent", off: "border-accent-2/25 text-accent/70" },
  { key: "llm", label: "🧠 OpenRouter", on: "border-info/50 bg-info/15 text-info", off: "border-info/20 text-info/70" },
  { key: "telegram", label: "✈️ Telegram", on: "border-accent/50 bg-accent/15 text-accent", off: "border-accent/20 text-accent/70" },
  { key: "supabase", label: "🗄 Supabase", on: "border-good/50 bg-good/15 text-good", off: "border-good/20 text-good/70" },
  { key: "payments", label: "💰 Payments", on: "border-warn/50 bg-warn/15 text-warn", off: "border-warn/20 text-warn/70" },
  { key: "code", label: "⚙️ System", on: "border-line bg-muted/20 text-muted", off: "border-line text-muted/70" },
];

export const TECH_LABEL: Record<Tech, string> = {
  elevenlabs: "🎙 ElevenLabs",
  llm: "🧠 OpenRouter",
  telegram: "✈️ Telegram",
  supabase: "🗄 Supabase",
  payments: "💰 Payments",
  code: "⚙️ System",
};

// Friendly names for system_logs.source (the "System" bucket's sub-category,
// shown next to the tech chip), these are internal module names picked by
// whoever wrote the log line (src/services/syslog.ts callers), not something
// an operator should have to decode. Anything unmapped falls back to a
// title-cased version of the raw string (see sourceLabel below) rather than
// hiding it.
const SOURCE_LABEL: Record<string, string> = {
  runtime: "Bot startup",
  handler: "Message handling",
  safety: "Safety check",
  watchdog: "Stuck message watchdog",
  campaign: "Flow send",
  followup: "Follow-up nudge",
  subscriptions: "Subscription renewal",
  profile: "Fan profile update",
  test: "Simulation run",
  tts: "Voice generation",
  llm: "AI reply",
  openrouter: "AI reply",
  telegram: "Telegram delivery",
  "star-reconcile": "Stars reconciliation",
  "operator-send": "Operator manual send",
  "business-account": "Business account change",
  payments: "Payment / credit grant",
  store: "Database",
  supabase: "Database",
  db: "Database",
};

export function sourceLabel(source: string): string {
  if (SOURCE_LABEL[source]) return SOURCE_LABEL[source];
  return source
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

// Friendly names for usage_events.kind, used to build a plain-English headline
// for AI/voice calls instead of showing the raw model slug up front. The raw
// kind + model + token counts stay in the row's detail payload either way.
export const KIND_LABEL: Record<string, string> = {
  llm: "AI reply",
  tts: "Voice message",
  stt: "Voice transcription",
  vision: "Photo/video description",
};

// Readable absolute timestamp, e.g. "Jul 27, 3:04:12 PM". Kept in the user's
// local timezone (same as the old toLocaleString() call) but with a fixed,
// compact format instead of the locale's often-cryptic short-date default.
export function fmtLogTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

// "3m ago" / "2h ago" / "5d ago" - a quick-glance secondary line under the
// absolute time. Falls back to the absolute date once it's more than a week
// old (a relative count stops being useful at that point).
export function fmtRelativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - d) / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay <= 7) return `${diffDay}d ago`;
  return "";
}

// Turns a friendly key like "cost_usd" into "Cost usd" for the detail-payload
// key/value view, not perfect English but far more scannable than a raw
// JSON dump for a non-developer, while every key/value stays fully visible.
export function friendlyKey(key: string): string {
  const words = key.split(/[_.]/).filter(Boolean);
  if (words.length === 0) return key;
  return words[0][0].toUpperCase() + words[0].slice(1) + (words.length > 1 ? " " + words.slice(1).join(" ") : "");
}
