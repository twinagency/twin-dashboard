import { supabaseAdmin } from "./supabase";
import { orChat } from "./openrouter";
import { applyStructuredPersona, fillDerivedSlots, type PersonaFactCols } from "./persona-facts";
import { vibePresetFor } from "./vibes";

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
export async function assembleClonePrompts(
  clone: {
    photos_enabled: boolean;
    videos_enabled: boolean;
    voice_enabled: boolean;
    charge_messages: boolean;
    tips_enabled?: boolean;
    subscriptions_enabled?: boolean;
    persona: Record<string, string> | null;
  } & PersonaFactCols,
  // Optional draft text keyed by agent_type, substituted in place of the
  // stored DB row for that agent type only. Lets the prompt template editor
  // (app/prompts) preview an UNSAVED edit against a real clone without
  // writing it to prompt_templates first — every other agent type still
  // reads the live saved row. undefined (the default) preserves the exact
  // prior behaviour for every existing caller.
  templateOverrides?: Partial<Record<"text" | "voice" | "vision" | "routing", string>>,
): Promise<Record<"text" | "voice" | "vision" | "routing", string>> {
  const { data: tplRows } = await supabaseAdmin
    .from("prompt_templates")
    .select("agent_type,template")
    .in("agent_type", ["text", "voice", "vision", "routing"]);
  const tpl = new Map((tplRows ?? []).map((r: any) => [r.agent_type, r.template as string]));
  if (templateOverrides) {
    for (const [agent, text] of Object.entries(templateOverrides)) {
      if (text !== undefined) tpl.set(agent, text);
    }
  }
  const flags = {
    CHARGE: clone.charge_messages,
    PHOTOS: clone.photos_enabled,
    VIDEOS: clone.videos_enabled,
    VOICE: clone.voice_enabled,
    MEDIA: clone.photos_enabled || clone.videos_enabled,
    TIPS: clone.tips_enabled ?? false,
    SUBS: (clone.subscriptions_enabled ?? false) && (clone.subscription_tiers ?? []).length > 0,
  };
  // Same layering as the runtime (src/prompt.ts): compiled persona + the
  // deterministic facts/nicknames/hard-limits from the structured columns,
  // then the derived money slots — so the preview matches the bot exactly.
  const persona = (applyStructuredPersona(clone.persona, clone) ?? {}) as Persona;
  const one = (agent: string) => {
    const t = tpl.get(agent);
    return t ? fillDerivedSlots(fillSlots(applyConditionals(t, flags), persona), clone) : "";
  };
  return { text: one("text"), voice: one("voice"), vision: one("vision"), routing: one("routing") };
}

// ── Flow-aware prompt preview ────────────────────────────────────────────────
// Mirrors the runtime's per-flow assembly (src/flows/text.ts + smart.ts + human.ts)
// so the dashboard shows what the bot ACTUALLY feeds the model for this clone's
// live flow + toggles — not a static template. Kept in sync with:
// - formatNudge()      → src/flows/human.ts (emoji + personality + texting style)
// - the smart tool instruction / decider system prompt → src/flows/smart.ts
// - availableActions() → src/flows/actions.ts

type PreviewClone = {
  ai_mode: "classic" | "smart";
  smart_split: boolean;
  photos_enabled: boolean;
  videos_enabled: boolean;
  voice_enabled: boolean;
  bundles_enabled: boolean;
  charge_messages: boolean;
  tips_enabled: boolean;
  subscriptions_enabled?: boolean;
  emojis_enabled: boolean;
  emoji_amount: "low" | "medium" | "high";
  emoji_allowlist: string | null;
  sexual_level: "low" | "medium" | "high";
  nsfw_level: "low" | "medium" | "high";
  push_level: "low" | "medium" | "high";
  persona: Record<string, string> | null;
} & PersonaFactCols;

export type PromptBlock = { key: string; label: string; hint: string; content: string };
export type PromptPreview = {
  mode: "classic" | "smart";
  smartSplit: boolean;
  blocks: PromptBlock[];
};

function emojiRuleP(c: PreviewClone): string {
  if (!c.emojis_enabled) return "Do not use any emojis at all, ever. Not even one.";
  const freq = {
    high: "use them a lot: most messages have one, and some have two. Never repeat the same emoji in back-to-back messages.",
    low: "use them sparingly: most messages have none, some have one, and rarely two. Never repeat the same emoji in back-to-back messages.",
    medium: "use them fairly often: roughly every other message has one, and some have two. Never repeat the same emoji in back-to-back messages.",
  }[c.emoji_amount] ?? "";
  const list = c.emoji_allowlist?.trim();
  if (list) return `Emojis: ${freq} You may ONLY ever use these emojis, and no others: ${list}. Never use any emoji outside that set.`;
  return `Emojis: ${freq} Prefer these: ❤️ 💕 😘 💗 🥹. Use 💦 🍆 🍑 🍒 only in genuinely heated moments.`;
}

function personalityRuleP(c: PreviewClone): string {
  const sexual = {
    low: "Keep the vibe mostly cute and wholesome. Flirt lightly, and rarely turn sexual on your own.",
    medium: "Be naturally flirty and a little suggestive, comfortable with innuendo when it fits.",
    high: "Be openly flirty, forward, and suggestive. You bring the sexual energy yourself.",
  }[c.sexual_level];
  const nsfw = {
    low: "If things heat up, keep it PG-13. Deflect explicit requests playfully; no graphic detail.",
    medium: "You'll talk dirty and get explicit when he leads there, but keep it tasteful.",
    high: "When the moment is hot you go fully explicit and graphic, leaning right in.",
  }[c.nsfw_level];
  const push = {
    low: "Rarely bring up paid content or tips; only when it comes up naturally, and keep it soft.",
    medium: "Offer your paid photos, videos and tips at good moments, without being pushy.",
    high: "Proactively steer toward your paid content and tips, often nudging him to unlock or spoil you, while staying warm and never desperate.",
  }[c.push_level];
  return `\n\nPersonality: ${sexual} ${nsfw} ${push} None of this ever overrides your hard limits, and you never state, negotiate, or make up prices; you only ask, the system handles the money.`;
}

// Mirror of src/flows/human.ts formatNudge — appended to every text + photo-reply prompt.
function formatNudgeP(c: PreviewClone): string {
  return (
    "\n\nWrite the way people actually text. Never use em dashes or en dashes; use commas or " +
    "short sentences instead. " +
    emojiRuleP(c) +
    personalityRuleP(c) +
    "\n\nTexting style: ALWAYS reply as one single message. Never use line breaks. Write everything " +
    "as one flowing text, exactly like someone typing a single iMessage."
  );
}

// Mirror of src/flows/actions.ts ACTIONS/availableActions minus text/vision
// (never a tool). "vip" was missing here until the 2026-07-27 prompt-viewer
// accuracy pass - a clone with subscriptions on and tiers set never showed
// the vip tool in either smart preview block, a real (now fixed) divergence
// from what the bot actually sent. Gate matches services/subscriptions.ts
// subscriptionsAvailable() exactly (also mirrored as flags.SUBS above).
function choosableActions(c: PreviewClone): { name: string; label: string; description: string }[] {
  const all = [
    { name: "voice", label: "Voice note", description: "Reply with a spoken voice note instead of text.", on: c.voice_enabled },
    { name: "photo", label: "Send a photo", description: "Send a locked paid photo. Price is set by the photo, not by you.", on: c.photos_enabled },
    { name: "video", label: "Send a video", description: "Send a locked paid video. Price is set by the video, not by you.", on: c.videos_enabled },
    { name: "bundle", label: "Send a bundle", description: "Send the next locked paid photo bundle (a set sold together).", on: c.photos_enabled && c.bundles_enabled },
    { name: "tip", label: "Ask for a tip", description: "Fire the tip/spoil pay button. Amounts come from the fixed menu, never from you.", on: c.tips_enabled },
    {
      name: "vip",
      label: "Offer VIP subscription",
      description:
        "Offer him a recurring monthly VIP membership. Use when he wants more of you or asks about VIP/subscribing. The price and perks are fixed by the tier, never by you.",
      on: (c.subscriptions_enabled ?? false) && (c.subscription_tiers ?? []).length > 0,
    },
  ];
  return all.filter((a) => a.on).map(({ name, label, description }) => ({ name, label, description }));
}

// Mirror of the DECIDER's push-discipline clause in src/flows/smart.ts
// (pushDiscipline()) - drives how hard the decider reaches for a paid action,
// same push_level dial as personalityRuleP() above but a separate clause: that
// one is the WRITER's tone, this is the decider's firing threshold. Was
// missing entirely from both smart preview blocks before the 2026-07-27 pass.
function pushDisciplineP(c: PreviewClone): string {
  return {
    low:
      "This companion upsells RARELY. Fire a paid action (photo/video/bundle/tip/vip) ONLY when he " +
      "directly and explicitly asks for that exact thing this message. Never suggest or offer one on your own.",
    medium:
      "Upsell in moderation: fire a paid action when he asks for it or clearly signals he wants it right now. " +
      "On ordinary conversation, fire nothing.",
    high:
      "Upsell readily: as well as when he asks outright, you may fire a paid action when there's a genuine " +
      "opening (he's flirty, curious about your pics/body, clearly heating up). Even so, fire NOTHING on plain, " +
      "non-sexual small talk.",
  }[c.push_level];
}

// Mirror of the smart single-model (split-off) instruction, decideAndWrite()
// in src/flows/smart.ts. Rewritten byte-for-byte to match the 2026-07-27
// smart.ts pass (DEFAULT TO NO TOOL framing, per-action criteria, the voice
// reaction-vs-request distinction from the voice-cooldown defect fix, and
// pushDisciplineP) - the previous version here was stale and did not match
// what the bot actually sent. KEEP IN SYNC with src/flows/smart.ts decideAndWrite().
function smartCombinedInstruction(c: PreviewClone): string {
  const choosable = choosableActions(c);
  const toolList = choosable.map((a) => `- ${a.label}: ${a.description}`).join("\n");
  return (
    `\n\nYou're texting him. Reply in your own voice as you normally would, your reply text is sent to him as a message.\n` +
    (choosable.length
      ? `You can ALSO do any of these this turn by using the matching tool:\n${toolList}\n` +
        `DEFAULT TO NO TOOL. Most turns are just ordinary conversation, so reply in words and use no tool. ` +
        `Only use a tool when he clearly and specifically asks for that exact thing THIS message: he asks to ` +
        `see a pic/video, asks for a bundle/set, asks to hear your voice, offers to tip/spoil you, or asks ` +
        `about VIP. Never fire a photo/voice/tip on plain small talk (like "what's your favorite band"), ` +
        `it's spammy and makes you feel like a bot. Voice especially: it's an occasional treat, not your ` +
        `default reply mode, so never fire it again right after you already sent one just because he's ` +
        `reacting to it, only when he freshly and explicitly asks to hear you again. If in doubt, use no tool. ` +
        `Prices and tip amounts are handled automatically, never state a price, a number of Stars, or payment steps. ` +
        `${pushDisciplineP(c)} `
      : "") +
    `Never mention tools, modes, or that you're an AI.`
  );
}

// Mirror of the smart decider system prompt (split-on), decideActions() in
// src/flows/smart.ts. Rewritten byte-for-byte for the same reason as
// smartCombinedInstruction() above. KEEP IN SYNC with src/flows/smart.ts decideActions().
function smartDeciderSystem(c: PreviewClone): string {
  const toolList = choosableActions(c).map((a) => `- ${a.name}: ${a.description}`).join("\n");
  return (
    `You decide which extra actions an adult chat companion takes THIS turn. Her words are already ` +
    `written by someone else; you ONLY pick actions (tools), never text.\n\n` +
    `Available actions:\n${toolList}\n\n` +
    `DEFAULT TO NOTHING. Most turns are ordinary conversation and need NO action: plain chat, small talk, ` +
    `getting-to-know-you questions ("what's your favorite band", "how was your day"), greetings, a new ` +
    `fan's early messages. Firing a photo/voice/tip on ordinary talk is spammy and wrong, it makes her ` +
    `feel like a vending machine, not a person.\n\n` +
    `Fire an action ONLY when the fan's LATEST message clearly and specifically calls for it:\n` +
    `- photo/video: he explicitly asks to see one ("send a pic", "show me", "what do you look like").\n` +
    `- bundle: he asks for a set/bundle/album/collection.\n` +
    `- voice: he asks to hear your voice or for a voice note. Voice is an occasional, deliberate treat, ` +
    `not a default reply mode: if you already sent one recently, do NOT fire it again just because he's ` +
    `reacting to it ("that voice is illegal", "i'm not okay") — that's a reaction, not a request. Only fire ` +
    `it again once he freshly and explicitly asks to hear you again.\n` +
    `- tip: he offers to tip/spoil you or send money.\n` +
    `- vip: he asks about subscribing / VIP / membership.\n` +
    `If in doubt, fire NOTHING. Only fire more than one action when he clearly asks for more than one. ` +
    `Use her written reply below only to stay consistent (if she explicitly promised to send something, ` +
    `honor it), it is NOT permission to upsell on its own. You never choose any price or amount.\n\n` +
    pushDisciplineP(c)
  );
}

// Build the flow-aware, toggle-aware prompt preview for a clone. `templateOverrides`
// (see assembleClonePrompts) lets the prompt editor preview an unsaved draft.
export async function assemblePromptPreview(
  clone: PreviewClone,
  templateOverrides?: Partial<Record<"text" | "voice" | "vision" | "routing", string>>,
): Promise<PromptPreview> {
  const base = await assembleClonePrompts(clone, templateOverrides);
  const nudge = formatNudgeP(clone);
  const mode = clone.ai_mode;
  const smartSplit = clone.smart_split;
  const empty = "(empty - add her answers and Save to generate)";
  const withNudge = (s: string) => (s ? s + nudge : empty);

  const blocks: PromptBlock[] = [];

  if (mode === "classic") {
    blocks.push({ key: "text", label: "Text reply", hint: "Persona + toggles + texting/emoji rules - her plain chat reply.", content: withNudge(base.text) });
    if (clone.voice_enabled) blocks.push({ key: "voice", label: "Voice note", hint: "Spoken reply persona (no emoji rules - it's spoken).", content: base.voice || empty });
    blocks.push({ key: "routing", label: "Routing (sorter)", hint: "Classic only: picks ONE lane per fan message.", content: base.routing || empty });
    if (clone.photos_enabled) blocks.push({ key: "vision", label: "Photo reply", hint: "When the fan sends a photo - persona + texting/emoji rules.", content: withNudge(base.vision) });
  } else if (smartSplit) {
    blocks.push({ key: "writer", label: "Writer (her reply)", hint: "Your Text model writes her reply - same persona + rules as chat. No tools.", content: withNudge(base.text) });
    blocks.push({ key: "decider", label: "Decider (tool picker)", hint: "Your Routing model reads the chat and fires 0+ enabled actions. Fixed system prompt below.", content: smartDeciderSystem(clone) });
    if (clone.voice_enabled) blocks.push({ key: "voice", label: "Voice note", hint: "Persona used when the voice action fires.", content: base.voice || empty });
    if (clone.photos_enabled) blocks.push({ key: "vision", label: "Photo reply", hint: "When the fan sends a photo.", content: withNudge(base.vision) });
  } else {
    blocks.push({ key: "writer", label: "Writer + Decider (one call)", hint: "One model writes her reply AND fires tools. Persona + rules + the tool instruction below.", content: withNudge(base.text) + smartCombinedInstruction(clone) });
    if (clone.voice_enabled) blocks.push({ key: "voice", label: "Voice note", hint: "Persona used when the voice action fires.", content: base.voice || empty });
    if (clone.photos_enabled) blocks.push({ key: "vision", label: "Photo reply", hint: "When the fan sends a photo.", content: withNudge(base.vision) });
  }

  return { mode, smartSplit, blocks };
}

// One LLM call: read her answers, return values for every persona slot as JSON.
// Since the 2026-07-17 persona audit the compiler writes PROSE ONLY: the hard
// facts (age, height, cities, job, socials), her fan nicknames and her hard-limit
// checklist come from typed columns and are injected into the prompt by the
// SYSTEM at runtime — the compiler must not reconstruct or restate them.
async function extractPersona(answers: string, vibe?: { persona: string; flirt: string } | null): Promise<Persona> {
  const system =
    "You compile an AI-girlfriend persona from a creator's intake answers. " +
    "Output ONLY a JSON object with these exact keys: " +
    SLOT_KEYS.join(", ") +
    ". Each value is plain text that will be dropped verbatim into a prompt template. " +
    "Write in third/second person describing HER (not as her). Be concrete and faithful to the answers; " +
    "do not invent facts that contradict them, but flesh out tone/style richly. " +
    "NAME = what she goes by. PERSONA = 2-4 sentences on who she is + her texting energy/quirks. " +
    "VOICE_TRAITS = how she sounds out loud (accent, pace, softness). " +
    "NICKNAMES = comma list of pet names she uses for fans (a typed list may override this at runtime; still give your best fallback). " +
    "FLIRT_NSFW = her flirting style + what she's sexually open to + her hard nos FROM THE PROSE ANSWERS ONLY. " +
    "RELATIONSHIP = her status + how she answers 'are you single' / 'do you love me'. " +
    "KNOWLEDGE_BASE = her life color she can mention naturally: daily routine, look, tastes (music/food/shows), hobbies, pets, stories, goals. " +
    "IMPORTANT: any answers listed under 'Structured facts' (age/birthday, gender, height, heritage, sexuality, cities, job, social handles, nicknames, turn-ons/offs, hard-limit checklist) are injected into her prompt AUTOMATICALLY by the system - use them as context for tone, but do NOT restate them in KNOWLEDGE_BASE or any other field. A fact that appears ONLY in her prose answers should still be kept. " +
    (vibe && (vibe.persona || vibe.flirt)
      ? "A vibe-preset BASELINE for PERSONA and FLIRT_NSFW is provided in the answers - build on it: keep its energy and archetype, and refine it with her specific answers (especially the example texts) rather than replacing it. "
      : "") +
    "If example texts are provided, study them and make PERSONA + her texting voice match them exactly - punctuation, casing, slang, message length, pet names, energy. The example texts are the strongest signal for how she writes. " +
    "CRITICAL: describe WHO SHE IS, never WHAT SHE SELLS. Do NOT mention selling, sending, " +
    "unlocking, pricing, or 'doing content'/photos/videos/paid media in ANY field - those are " +
    "capabilities toggled separately at runtime, not part of her identity. If her answers describe " +
    "a content/OF business, capture only the persona behind it (her vibe, confidence, sexual openness) " +
    "and keep her job generic (e.g. 'model', 'influencer'). The persona must read identically whether " +
    "or not photo/video selling is enabled.";

  const vibeBlock =
    vibe && (vibe.persona || vibe.flirt)
      ? `\n\n## Vibe preset baseline (build on this)\nPERSONA baseline: ${vibe.persona}\nFLIRT_NSFW baseline: ${vibe.flirt}`
      : "";

  const raw = await orChat({
    model: COMPILER_MODEL,
    system,
    user: `INTAKE ANSWERS:\n${answers}${vibeBlock}`,
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
  tips_enabled?: boolean;
  subscriptions_enabled?: boolean;
  vibe_preset?: string | null;
} & PersonaFactCols;

// Compile a clone's per-clone prompts (text/voice/vision/routing) from its intake
// answers + the seeded templates, honoring its feature/charge toggles, and write
// them back onto the clone row. Returns the compiled prompts.
// select("*") on purpose: the structured persona columns (migration 033) are
// read defensively, so this keeps working pre-migration.
export async function compileClone(cloneId: string) {
  const { data: clone, error: ce } = await supabaseAdmin
    .from("clones")
    .select("*")
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
    TIPS: c.tips_enabled ?? false,
    SUBS: (c.subscriptions_enabled ?? false) && (c.subscription_tiers ?? []).length > 0,
  };

  // Vibe preset baseline (typed column) grounds the PERSONA/FLIRT compile.
  const vibe = vibePresetFor(c.vibe_preset);
  const persona = await extractPersona(answers, vibe);

  // The stored *_prompt snapshots are cosmetic (dashboard only) but should still
  // look like the runtime output: structured facts layered in + derived slots filled.
  const snapshotPersona = (applyStructuredPersona(persona, c) ?? persona) as Persona;
  const compile = (agent: string) => {
    const t = tpl.get(agent);
    if (!t) return null;
    return fillDerivedSlots(fillSlots(applyConditionals(t, flags), snapshotPersona), c);
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
