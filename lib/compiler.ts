import { supabaseAdmin } from "./supabase";
import { applyStructuredPersona, fillDerivedSlots, type PersonaFactCols } from "./persona-facts";
import { vibePresetFor } from "./vibes";
import { buildPersona } from "./persona-build";

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
  // (components/prompts) preview an UNSAVED edit against a real clone without
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
  // Gate the vision/"photo reply" block below: bot/src/handler.ts fires
  // visionFlow off these two, NOT photos_enabled/videos_enabled (those only
  // control what SHE sends). Optional so a pre-migration-033 row still types.
  photo_vision_enabled?: boolean;
  video_vision_enabled?: boolean;
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
    `reacting to it ("that voice is illegal", "i'm not okay"), that's a reaction, not a request. Only fire ` +
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

  // Fires whenever the fan sends US a photo OR a video (a frame grabbed from
  // it) — same prompt template either way (bot/src/flows/vision.ts), only the
  // lead-in line differs. Gated on the vision toggles themselves, not
  // photos_enabled/videos_enabled (those control what SHE sends, unrelated).
  const seesIncomingMedia = (clone.photo_vision_enabled ?? false) || (clone.video_vision_enabled ?? false);
  const visionBlock = (hint: string) => ({ key: "vision", label: "Photo & video reply", hint, content: withNudge(base.vision) });

  if (mode === "classic") {
    blocks.push({ key: "text", label: "Text reply", hint: "Persona + toggles + texting/emoji rules - her plain chat reply.", content: withNudge(base.text) });
    if (clone.voice_enabled) blocks.push({ key: "voice", label: "Voice note", hint: "Spoken reply persona (no emoji rules - it's spoken).", content: base.voice || empty });
    blocks.push({ key: "routing", label: "Routing (sorter)", hint: "Classic only: picks ONE lane per fan message.", content: base.routing || empty });
    if (seesIncomingMedia) blocks.push(visionBlock("When the fan sends a photo OR a video (she reacts to a grabbed frame) - persona + texting/emoji rules."));
  } else if (smartSplit) {
    blocks.push({ key: "writer", label: "Writer (her reply)", hint: "Your Text model writes her reply - same persona + rules as chat. No tools.", content: withNudge(base.text) });
    blocks.push({ key: "decider", label: "Decider (tool picker)", hint: "Your Routing model reads the chat and fires 0+ enabled actions. Fixed system prompt below.", content: smartDeciderSystem(clone) });
    if (clone.voice_enabled) blocks.push({ key: "voice", label: "Voice note", hint: "Persona used when the voice action fires.", content: base.voice || empty });
    if (seesIncomingMedia) blocks.push(visionBlock("When the fan sends a photo OR a video (she reacts to a grabbed frame)."));
  } else {
    blocks.push({ key: "writer", label: "Writer + Decider (one call)", hint: "One model writes her reply AND fires tools. Persona + rules + the tool instruction below.", content: withNudge(base.text) + smartCombinedInstruction(clone) });
    if (clone.voice_enabled) blocks.push({ key: "voice", label: "Voice note", hint: "Persona used when the voice action fires.", content: base.voice || empty });
    if (seesIncomingMedia) blocks.push(visionBlock("When the fan sends a photo OR a video (she reacts to a grabbed frame)."));
  }

  return { mode, smartSplit, blocks };
}

type CloneRow = {
  id: string;
  name: string;
  intake: { answers?: string; fields?: Record<string, string> } | null;
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

  // Deterministic assembly from the operator's own entries. No model call: her
  // words reach the prompt exactly as written. See lib/persona-build.ts.
  const persona = buildPersona(c.intake?.fields, c.name, c.vibe_preset ?? null) as Persona;

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
