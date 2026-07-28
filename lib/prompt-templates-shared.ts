// ── Types/constants shared between the server-only data layer
// (./prompt-templates-data.ts) and the client editor (app/prompts/*.tsx).
// No "server-only" import here on purpose — this file must be safe to
// import from a "use client" component.

export const AGENT_TYPES = ["text", "voice", "vision", "routing", "media_match", "voice_enhance"] as const;
export type AgentType = (typeof AGENT_TYPES)[number];

export function isAgentType(v: string): v is AgentType {
  return (AGENT_TYPES as readonly string[]).includes(v);
}

// Agent types whose DB row the bot runtime actually reads, so a save here
// really does reach the fleet. All six are wired as of 2026-07-27.
//
// media_match and voice_enhance used to be the exceptions: they had live rows
// that nothing read, because bot/src/flows/media.ts and
// bot/src/services/voice-gen.ts used hardcoded constants instead, which quietly
// violated the "prompts are never hardcoded" rule. Both now read
// templates.get("media_match") / templates.get("voice_enhance") with the same
// TTL cache as the others, keeping their old constant only as a fallback for a
// missing or empty row (and logging when that fallback fires).
//
// Keep this in sync with the runtime. If a future agent type gets a row here
// before the code reads it, drop it from this set so the editor keeps warning
// that a save does not reach the fleet.
export const LIVE_WIRED_AGENT_TYPES = new Set<AgentType>([
  "text",
  "voice",
  "vision",
  "routing",
  "media_match",
  "voice_enhance",
]);

export const AGENT_LABELS: Record<AgentType, string> = {
  text: "Text",
  voice: "Voice",
  vision: "Vision (photo reply)",
  routing: "Routing",
  media_match: "Media match",
  voice_enhance: "Voice enhance",
};

export type TemplateRow = {
  agent_type: AgentType;
  template: string;
  slots: string[];
  description: string | null;
  updated_at: string;
};

export type VersionRow = {
  id: string;
  agent_type: AgentType;
  version: number;
  template: string;
  slots: string[];
  description: string | null;
  created_by: string;
  restored_from_version: number | null;
  created_at: string;
};
