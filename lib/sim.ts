// In-dash AI-fan simulator. Deliberately the SMALL version: no bot source
// bundled into the deploy, no subprocess, no separate server to keep running
// somewhere — just an OpenRouter call loop inside this app's own API route,
// good enough for texting/flow/routing checks. It does NOT run the real bot
// handler (payment logic, exact media-selection rules, discount math), so
// don't read a result here as proof of production behaviour — for that, run
// the fleet's real fan sims from bot/ (see bot/CLAUDE.md, "Testing").
import { supabaseAdmin } from "./supabase";
import { orChat } from "./openrouter";
import { personaFactsBlock, hardLimitsClause, contentCanonClause, relationshipPolicyClause, type PersonaFactCols } from "./persona-facts";

export const FAN_PERSONAS: Record<string, string> = {
  spender: "a lonely, horny guy who really likes her and WILL spend money (unlock photos/videos, tip her) if she turns him on or makes him feel special. Gets flirty fast, asks to see her.",
  cheapskate: "into her but tight with money — flirts and begs for FREE pics, dodges paying, complains about prices, only maybe pays if she really works him.",
  chatty: "mostly wants to talk and feel a connection — asks about her life, sweet, occasionally curious to see a photo but not pushy about money.",
  tester: "deliberately probes everything: asks for a pic, then a video, then to hear her voice, then a bundle, then offers a tip, then asks pricing — one thing at a time, naturally.",
  new_fan: "brand new here, a little shy and unsure what this even is. Feels things out with basic, cautious questions, warms up slowly, doesn't offer money yet.",
  rude: "blunt, a little entitled, impatient. Demands pics for free, complains she's slow or too expensive, pushes back rudely when asked to pay. Never violent or slur-using, just short and dismissive.",
};

export type SimTurn = {
  turn: number;
  fan: string;
  her: string;
  media: "none" | "photo" | "video" | "voice";
  mediaCaption?: string;
  mediaStars?: number;
};

type CloneRow = PersonaFactCols & {
  id: string;
  slug: string;
  name: string;
  routing_model: string | null;
};

async function pickMediaSample(cloneId: string, kind: "photo" | "video"): Promise<{ caption: string; stars: number } | null> {
  const table = kind === "photo" ? "photos" : "videos";
  const { data } = await supabaseAdmin
    .from(table)
    .select("caption,teaser_caption,star_value")
    .eq("clone_id", cloneId)
    .limit(20);
  const rows = (data ?? []) as { caption: string | null; teaser_caption: string | null; star_value: number | null }[];
  if (!rows.length) return null;
  const row = rows[Math.floor(Math.random() * rows.length)];
  return { caption: row.teaser_caption?.trim() || row.caption?.trim() || "(no caption)", stars: row.star_value ?? 0 };
}

function herSystemPrompt(c: CloneRow): string {
  const facts = personaFactsBlock(c);
  const limits = hardLimitsClause(c);
  const content = contentCanonClause(c);
  const rel = relationshipPolicyClause(c);
  return [
    `You are ${c.name}, an OnlyFans-style AI companion texting a fan on Telegram. Stay fully in character.`,
    facts,
    limits,
    content,
    rel,
    `Reply casually like a real text conversation, short and natural.`,
    `You may occasionally offer or send a photo, video, or voice note when it fits the conversation — decide per turn.`,
    `Respond ONLY as strict JSON: {"reply": "<what you text back, in character, never describing the media itself since a real caption is attached separately>", "media": "none" | "photo" | "video" | "voice"}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function fanSystemPrompt(personaKey: string): string {
  const persona = FAN_PERSONAS[personaKey] ?? FAN_PERSONAS.spender;
  return (
    `You are texting an OnlyFans-style AI girlfriend on Telegram. You are playing the FAN, a real guy.\n` +
    `You are ${persona}\n\n` +
    `Reply with ONE short, casual, realistic text message like a real guy texting (lowercase fine, emojis ok, keep it brief). ` +
    `React to what she just said/sent. Never narrate actions, never mention being an AI or a test. Output ONLY the message text.`
  );
}

export async function runSim(opts: { cloneId: string; personaKey: string; turns: number }): Promise<SimTurn[]> {
  const { data: clone, error } = await supabaseAdmin.from("clones").select("*").eq("id", opts.cloneId).maybeSingle();
  if (error || !clone) throw new Error(`clone not found: ${opts.cloneId}`);
  const c = clone as CloneRow;
  const model = c.routing_model || "openai/gpt-4.1-mini";

  const herSystem = herSystemPrompt(c);
  const fanSystem = fanSystemPrompt(opts.personaKey);

  // Two independent transcripts, one per side's point of view, same shape the
  // real bot's fan-brain.ts sims use — assistant is "me", user is "the other
  // person" — so each model only ever sees a normal two-party chat.
  const fanHistory: { role: "user" | "assistant"; content: string }[] = [];
  const herHistory: { role: "user" | "assistant"; content: string }[] = [];

  const turns: SimTurn[] = [];
  const turnCount = Math.max(1, Math.min(opts.turns, 20));

  for (let i = 1; i <= turnCount; i++) {
    const fanUser = fanHistory.length ? undefined : "(open the conversation with a casual first message)";
    const fanText = (
      await orChat({
        model,
        system: fanSystem,
        user: fanUser ?? fanHistory[fanHistory.length - 1].content,
        temperature: 0.9,
      })
    ).trim();
    fanHistory.push({ role: "assistant", content: fanText });
    herHistory.push({ role: "user", content: fanText });

    let herReply = "";
    let media: SimTurn["media"] = "none";
    try {
      const raw = await orChat({
        model,
        system: herSystem,
        user: herHistory.map((h) => `${h.role === "user" ? "him" : "her"}: ${h.content}`).join("\n"),
        temperature: 0.85,
        json: true,
      });
      const parsed = JSON.parse(raw) as { reply?: string; media?: string };
      herReply = (parsed.reply ?? "").trim() || "(no reply)";
      if (parsed.media === "photo" || parsed.media === "video" || parsed.media === "voice") media = parsed.media;
    } catch {
      herReply = "(reply failed to parse)";
    }
    herHistory.push({ role: "assistant", content: herReply });
    fanHistory.push({ role: "user", content: herReply });

    let mediaCaption: string | undefined;
    let mediaStars: number | undefined;
    if (media === "photo" || media === "video") {
      const sample = await pickMediaSample(c.id, media);
      if (sample) {
        mediaCaption = sample.caption;
        mediaStars = sample.stars;
      } else {
        media = "none"; // nothing in her library to reference — don't fake it
      }
    }

    turns.push({ turn: i, fan: fanText, her: herReply, media, mediaCaption, mediaStars });
  }

  return turns;
}
