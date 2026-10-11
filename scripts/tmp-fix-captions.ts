// One-off fix pass (2026-09-27): rewrites already-restyled captions so the girl talks TO him instead of
// narrating her own photo. Small cheap model, caption + facts in, fault-tolerant, checkpointed, backed up.
//   tsx --env-file=.env scripts/tmp-fix-captions.ts --clone <slug> [--dry-run] [--limit N]
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { supabaseAdmin } from "../lib/supabase";
import { orChat } from "../lib/openrouter";
import { cleanSendCaption } from "../lib/media-classification";

const a = process.argv.slice(2);
const opt = (n: string) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : undefined; };
const DRY = a.includes("--dry-run");
const SLUG = opt("clone");
const LIMIT = Number(opt("limit") || 0);
const MODEL = "mistralai/mistral-small-3.2-24b-instruct";
const DIR = "/home/ronan/twin/drive-import/work/fix-captions";
mkdirSync(DIR, { recursive: true });
const DONE = `${DIR}/done-v2.jsonl`, BACKUP = `${DIR}/backup.jsonl`, FAIL = `${DIR}/failed.jsonl`;

const SYSTEM = `You rewrite the caption a woman sends to a fan with her own nude or sexy photo or video.
The ONLY problem with the old caption: it sounds like a bot narrating a photo. Fix the VOICE, keep the DETAIL.
- Keep every sexy detail from the old caption and facts: what she's wearing, what's out (tits, ass, pussy), her pose, what her hands or a toy are doing. Super descriptive, 2 to 3 details.
- Say it like a horny girl texting him in first person, present tense, about what she's doing and feeling, aimed at him ("u", "baby"). Casual words: tits, ass, pussy, soaking, bent over, spread.
- Never use narrator words: visible, fully, exposed, on display, from this angle, reflection, captures, sheen, midriff, pressed against, front and center, can you see, can you spot. Never mention the room, sink, camera, lighting or jewellery unless it's sexy.
- Only claim what the FACTS support. Drop invented acts (finger in her ass or pussy, being wet, a toy) unless the facts show them.
- End with a tease, a dare or a question to him, not always a question. 1 or 2 emojis. Under 40 words.
- Never mention OnlyFans, prices, Stars, tipping, tapping, unlocking or paying. No em dashes or en dashes.
Example. Old: "Lying here fully nude, one leg raised, my pussy and nipples are all visible from this close-up angle, can you see my hand above my pussy?" New: "lying here naked with one leg up, tits out and my hand sliding down right above my pussy 😈 it's already throbbing thinking about u, want me to keep going?"
Never copy the example; write a fresh line for this item. Reply with ONLY the new caption.`;

const BANNED = /\b(visible|fully|exposed|on display|from this angle|reflection|captures|sheen|midriff|can you see|can you spot|only ?fans|stars?|price|unlock\w*)\b/i;

async function retry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1500 * 2 ** i)); }
  }
  throw last;
}

async function main() {
  if (!SLUG) throw new Error("--clone <slug> required");
  const { data: clone } = await retry(async () => { const r = await supabaseAdmin.from("clones").select("id, name").eq("slug", SLUG).single(); if (r.error || !r.data) throw new Error(r.error?.message || "clone lookup failed"); return r; });
  const done = new Set(existsSync(DONE) ? readFileSync(DONE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).key) : []);
  const rows: any[] = [];
  for (const table of ["photos", "videos"]) {
    const { data } = await supabaseAdmin.from(table).select("id, caption, visual_description").eq("clone_id", clone!.id).not("caption", "is", null).not("visual_description", "is", null);
    for (const r of data ?? []) if (!done.has(`${table}:${r.id}`)) rows.push({ table, ...r });
  }
  const orig = new Map<string, string>();
  if (existsSync(BACKUP)) for (const l of readFileSync(BACKUP, "utf8").split("\n").filter(Boolean)) { const j = JSON.parse(l); if (!orig.has(j.key) && j.old_caption) orig.set(j.key, j.old_caption); }
  for (const r of rows) r.caption = orig.get(`${r.table}:${r.id}`) ?? r.caption;
  const todo = LIMIT ? rows.slice(0, LIMIT) : rows;
  console.log(`${clone!.name}: ${todo.length} captions to fix`);
  let i = 0, ok = 0, bad = 0;
  await Promise.all(Array.from({ length: 20 }, async () => {
    while (i < todo.length) {
      const r = todo[i++]; const key = `${r.table}:${r.id}`;
      try {
        let out = "";
        for (let t = 0; t < 2 && !out; t++) {
          const raw = await retry(() => orChat({ model: MODEL, system: SYSTEM, user: `FACTS: ${r.visual_description}\nOLD CAPTION: ${r.caption}`, temperature: 0.8 }));
          const c = cleanSendCaption(raw.replace(/^["'\s]+|["'\s]+$/g, ""));
          if (c && c.length >= 8 && !BANNED.test(c)) out = c;
        }
        if (!out) { bad++; appendFileSync(FAIL, JSON.stringify({ key, reason: "guard" }) + "\n"); continue; }
        if (DRY) { console.log(`OLD: ${r.caption}\nNEW: ${out}\n`); ok++; continue; }
        appendFileSync(BACKUP, JSON.stringify({ key, old_caption: r.caption }) + "\n");
        await retry(async () => { const res = await supabaseAdmin.from(r.table).update({ caption: out }).eq("id", r.id); if (res.error) throw new Error(res.error.message); });
        appendFileSync(DONE, JSON.stringify({ key }) + "\n"); ok++;
      } catch (e) { bad++; appendFileSync(FAIL, JSON.stringify({ key, reason: String((e as Error).message).slice(0, 200) }) + "\n"); }
    }
  }));
  console.log(`done: ${ok} fixed, ${bad} skipped/failed`);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
