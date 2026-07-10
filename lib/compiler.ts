import { supabaseAdmin } from "./supabase";
import { orChat } from "./openrouter";

// Persona slots the compiler fills from her free-form answers.
const SLOT_KEYS = [
  "NAME",
  "PERSONA",
  "VOICE_TRAITS",
  "NICKNAMES",
  "FLIRT_NSFW",
  "RELATIONSHIP",
  "KNOWLEDGE_BASE",
] as const;
type Persona = Record<(typeof SLOT_KEYS)[number], string>;

const COMPILER_MODEL = process.env.COMPILER_MODEL ?? "openai/gpt-4.1";

// Strip {{#IF_X}}…{{/IF_X}} blocks: keep inner text when the flag is on, remove
// the whole block when off. Then tidy the blank lines that stripping leaves.
function applyConditionals(t: string, flags: Record<string, boolean>): string {
  for (const [key, on] of Object.entries(flags)) {
    const re = new RegExp(`{{#IF_${key}}}([\\s\\S]*?){{/IF_${key}}}`, "g");
    t = t.replace(re, on ? "$1" : "");
  }
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

function fillSlots(t: string, p: Persona): string {
  for (const k of SLOT_KEYS) t = t.replaceAll(`{{${k}}}`, p[k] ?? "");
  return t;
}

// The LIVE prompt the bot actually uses: scaffold template + her persona +
// CURRENT toggles. Mirrors the bot's runtime assembly so the dashboard never
// shows a stale prompt. Read-only preview — not stored.
export async function assembleClonePrompts(clone: {
  photos_enabled: boolean;
  videos_enabled: boolean;
  voice_enabled: boolean;
  charge_messages: boolean;
  tips_enabled?: boolean;
  persona: Record<string, string> | null;
}): Promise<Record<"text" | "voice" | "vision" | "routing", string>> {
  const { data: tplRows } = await supabaseAdmin
    .from("prompt_templates")
    .select("agent_type,template")
    .in("agent_type", ["text", "voice", "vision", "routing"]);
  const tpl = new Map((tplRows ?? []).map((r: any) => [r.agent_type, r.template as string]));
  const flags = {
    CHARGE: clone.charge_messages,
    PHOTOS: clone.photos_enabled,
    VIDEOS: clone.videos_enabled,
    VOICE: clone.voice_enabled,
    MEDIA: clone.photos_enabled || clone.videos_enabled,
    TIPS: clone.tips_enabled ?? false,
  };
  const persona = (clone.persona ?? {}) as Persona;
  const one = (agent: string) => {
    const t = tpl.get(agent);
    return t ? fillSlots(applyConditionals(t, flags), persona) : "";
  };
  return { text: one("text"), voice: one("voice"), vision: one("vision"), routing: one("routing") };
}

// One LLM call: read her answers, return values for every persona slot as JSON.
async function extractPersona(answers: string): Promise<Persona> {
  const system =
    "You compile an AI-girlfriend persona from a creator's intake answers. " +
    "Output ONLY a JSON object with these exact keys: " +
    SLOT_KEYS.join(", ") +
    ". Each value is plain text that will be dropped verbatim into a prompt template. " +
    "Write in third/second person describing HER (not as her). Be concrete and faithful to the answers; " +
    "do not invent facts that contradict them, but flesh out tone/style richly. " +
    "NAME = what she goes by. PERSONA = 2-4 sentences on who she is + her texting energy/quirks. " +
    "VOICE_TRAITS = how she sounds out loud (accent, pace, softness). " +
    "NICKNAMES = comma list of pet names she uses for fans. " +
    "FLIRT_NSFW = her flirting style + what she's sexually open to + hard nos. " +
    "RELATIONSHIP = her status + how she answers 'are you single' / 'do you love me'. " +
    "KNOWLEDGE_BASE = all bio + likes/dislikes facts (age, origin, job, daily routine, social handles, food, music, hobbies, etc.) she can mention naturally. " +
    "If example texts are provided, study them and make PERSONA + her texting voice match them exactly — punctuation, casing, slang, message length, pet names, energy. The example texts are the strongest signal for how she writes. " +
    "CRITICAL: describe WHO SHE IS, never WHAT SHE SELLS. Do NOT mention selling, sending, " +
    "unlocking, pricing, or 'doing content'/photos/videos/paid media in ANY field — those are " +
    "capabilities toggled separately at runtime, not part of her identity. If her answers describe " +
    "a content/OF business, capture only the persona behind it (her vibe, confidence, sexual openness) " +
    "and keep her job generic (e.g. 'model', 'influencer'). The persona must read identically whether " +
    "or not photo/video selling is enabled.";

  const raw = await orChat({
    model: COMPILER_MODEL,
    system,
    user: `INTAKE ANSWERS:\n${answers}`,
    temperature: 0.5,
    json: true,
  });

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    obj = m ? JSON.parse(m[0]) : {};
  }
  const persona = {} as Persona;
  for (const k of SLOT_KEYS) persona[k] = String(obj[k] ?? "").trim();
  return persona;
}

type CloneRow = {
  id: string;
  name: string;
  intake: { answers?: string } | null;
  charge_messages: boolean;
  photos_enabled: boolean;
  videos_enabled: boolean;
  voice_enabled: boolean;
};

// Compile a clone's per-clone prompts (text/voice/vision/routing) from its intake
// answers + the seeded templates, honoring its feature/charge toggles, and write
// them back onto the clone row. Returns the compiled prompts.
export async function compileClone(cloneId: string) {
  const { data: clone, error: ce } = await supabaseAdmin
    .from("clones")
    .select("id,name,intake,charge_messages,photos_enabled,videos_enabled,voice_enabled")
    .eq("id", cloneId)
    .maybeSingle();
  if (ce) throw new Error(ce.message);
  if (!clone) throw new Error("clone not found");
  const c = clone as CloneRow;

  const answers = c.intake?.answers?.trim();
  if (!answers) throw new Error("no intake answers to compile from");

  const { data: tplRows, error: te } = await supabaseAdmin
    .from("prompt_templates")
    .select("agent_type,template")
    .in("agent_type", ["text", "voice", "vision", "routing"]);
  if (te) throw new Error(te.message);
  const tpl = new Map((tplRows ?? []).map((r: any) => [r.agent_type, r.template as string]));

  const flags = {
    CHARGE: c.charge_messages,
    PHOTOS: c.photos_enabled,
    VIDEOS: c.videos_enabled,
    VOICE: c.voice_enabled,
    MEDIA: c.photos_enabled || c.videos_enabled,
  };

  const persona = await extractPersona(answers);

  const compile = (agent: string) => {
    const t = tpl.get(agent);
    if (!t) return null;
    return fillSlots(applyConditionals(t, flags), persona);
  };

  const text_prompt = compile("text");
  const voice_prompt = c.voice_enabled ? compile("voice") : null;
  const photo_reply_prompt = c.photos_enabled ? compile("vision") : null;
  const routing_prompt = compile("routing");

  const { error: ue } = await supabaseAdmin
    .from("clones")
    .update({
      // persona = the real runtime artifact (bot assembles scaffold+persona+toggles
      // live). The *_prompt columns are a cosmetic snapshot for the dashboard only.
      persona,
      text_prompt,
      voice_prompt,
      photo_reply_prompt,
      routing_prompt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cloneId);
  if (ue) throw new Error(ue.message);

  return { persona, text_prompt, voice_prompt, photo_reply_prompt, routing_prompt };
}
