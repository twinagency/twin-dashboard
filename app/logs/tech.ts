// Single source of truth for mapping log rows to a "tech" bucket and for the
// filter chip definitions (fans-page chip style). Used by the server page
// (query filtering) and the client filter bar (rendering).

export type Tech = "elevenlabs" | "llm" | "telegram" | "supabase" | "code";

// system_logs.source values claimed by each bucket. Anything unclaimed falls
// through to "code" (watchdog, safety, handler, campaign, followup, workers).
export const SYSTEM_SOURCE_BUCKETS: Record<Exclude<Tech, "code">, string[]> = {
  elevenlabs: ["tts", "elevenlabs"],
  llm: ["llm", "openrouter"],
  telegram: ["telegram", "star-reconcile"],
  supabase: ["store", "supabase", "db"],
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
  { key: "elevenlabs", label: "🎙 ElevenLabs", on: "border-purple-500/50 bg-purple-500/15 text-purple-400", off: "border-purple-500/20 text-purple-400/70" },
  { key: "llm", label: "🧠 LLM", on: "border-info/50 bg-info/15 text-info", off: "border-info/20 text-info/70" },
  { key: "telegram", label: "✈️ Telegram", on: "border-accent/50 bg-accent/15 text-accent", off: "border-accent/20 text-accent/70" },
  { key: "supabase", label: "🗄 Supabase", on: "border-good/50 bg-good/15 text-good", off: "border-good/20 text-good/70" },
  { key: "code", label: "⚙️ Our code", on: "border-line bg-muted/20 text-muted", off: "border-line text-muted/70" },
];

export const TECH_LABEL: Record<Tech, string> = {
  elevenlabs: "🎙 ElevenLabs",
  llm: "🧠 LLM",
  telegram: "✈️ Telegram",
  supabase: "🗄 Supabase",
  code: "⚙️ Our code",
};
