// Rewrites the stored `caption` on existing photos/videos in the explicit
// first-person send style, TEXT-ONLY from each row's `visual_description`
// (no image download), with a cheap text model.
//
// Fault-tolerant: one failed row is logged and skipped, never fatal.
// Resumable + idempotent: every finished id is appended to a checkpoint file,
// and a re-run skips those ids, so it can be stopped and restarted any time.
// Reversible: the old caption is appended to a backup file before overwrite.
//
//   tsx --env-file=.env scripts/recaption-existing.ts [--dry-run] [--clone <slug>] [--limit N]
//        [--concurrency 30] [--follow] [--state-dir DIR]
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { supabaseAdmin } from "../lib/supabase";
import { orChat } from "../lib/openrouter";
import { cleanSendCaption } from "../lib/media-classification";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const DRY = flag("dry-run");
const FOLLOW = flag("follow");
const LIMIT = Number(opt("limit") || 0);
const CONCURRENCY = Number(opt("concurrency") || 30);
const CLONE_SLUG = opt("clone");
const MODEL = "deepseek/deepseek-v4-flash";
const STATE = opt("state-dir") || path.join(process.cwd(), ".recaption-state");
const DONE_FILE = path.join(STATE, "recaption-done.jsonl");
const BACKUP_FILE = path.join(STATE, "recaption-backup.jsonl");
const FAIL_FILE = path.join(STATE, "recaption-failed.jsonl");

export const RECAPTION_SYSTEM = `You write one caption for a photo or video that a woman is sending to a fan.
Write in first person as her. It is standalone, not a reply to anyone.
Use 1 to 2 GRAPHIC, specific details taken ONLY from the facts given: what she is wearing, which body parts are showing, what her hands or a toy are doing, the angle. Raunchy and explicit.
You may end with a teasing question about a visible detail. Use 1 to 3 fitting emojis. 2 to 3 short sentences, at most 45 words.
Style reference: "mmm right now i'm lying here in my new lingerie set, i may or may not have a finger up my ass 😈 can you see my pussy lips from this angle?"
Never claim anything the facts do not state. If the facts say a body part is not visible, do not describe it as visible.
Never mention OnlyFans, prices, Stars, tipping, tapping, unlocking or paying. Never use em dashes or en dashes.
Reply with ONLY the caption text.`;

const SALES = /\b(only ?fans|onlyfans|stars?|price|pay|paid|tip|unlock\w*)\b/i;
/** Guard a model output: returns a clean caption or null (null = skip the row, keep the old caption). */
export function acceptCaption(raw: string): string | null {
  const text = cleanSendCaption(raw.replace(/^["'\s]+|["'\s]+$/g, ""));
  if (!text || text.length < 12 || SALES.test(text)) return null;
  if (/visual_description|as an ai|i can't|i cannot/i.test(text)) return null;
  return text;
}

type Row = { table: "photos" | "videos"; id: string; clone_id: string; caption: string | null; visual_description: string };

function loadDone(): Set<string> {
  if (!existsSync(DONE_FILE)) return new Set();
  return new Set(readFileSync(DONE_FILE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).key as string));
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      const msg = String((e as Error)?.message ?? e);
      if (!/429|5\d\d|fetch failed|network|timeout|ECONN|EAI_AGAIN/i.test(msg)) break;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** i + Math.random() * 500));
    }
  }
  throw last;
}

async function fetchRows(done: Set<string>, cloneId: string | null): Promise<Row[]> {
  const out: Row[] = [];
  for (const table of ["photos", "videos"] as const) {
    for (let from = 0; ; from += 1000) {
      let q = supabaseAdmin.from(table).select("id, clone_id, caption, visual_description").not("visual_description", "is", null).order("id").range(from, from + 999);
      if (cloneId) q = q.eq("clone_id", cloneId);
      const { data } = await withRetry(async () => { const r = await q; if (r.error) throw new Error(r.error.message); return r; });
      for (const r of data ?? []) {
        if (!r.visual_description?.trim() || done.has(`${table}:${r.id}`)) continue;
        out.push({ table, ...r } as Row);
      }
      if ((data ?? []).length < 1000) break;
    }
  }
  return LIMIT ? out.slice(0, LIMIT) : out;
}

async function processRow(row: Row, stats: Record<string, number>) {
  const key = `${row.table}:${row.id}`;
  try {
    const raw = await withRetry(() => orChat({ model: MODEL, system: RECAPTION_SYSTEM, user: `Facts about this ${row.table === "videos" ? "video" : "photo"}: ${row.visual_description}`, temperature: 0.9 }));
    const caption = acceptCaption(raw);
    if (!caption) { stats.rejected++; appendFileSync(FAIL_FILE, JSON.stringify({ key, reason: "guard", raw }) + "\n"); return; }
    if (DRY) { stats.ok++; console.log(`  [dry] ${key}\n    facts: ${row.visual_description.slice(0, 160)}\n    new:   ${caption}`); return; }
    appendFileSync(BACKUP_FILE, JSON.stringify({ key, old_caption: row.caption }) + "\n");
    await withRetry(async () => { const r = await supabaseAdmin.from(row.table).update({ caption }).eq("id", row.id); if (r.error) throw new Error(r.error.message); return r; });
    appendFileSync(DONE_FILE, JSON.stringify({ key, at: new Date().toISOString() }) + "\n");
    stats.ok++;
    if (stats.ok % 50 === 0) console.log(`  ${stats.ok} done`);
  } catch (e) {
    stats.failed++;
    appendFileSync(FAIL_FILE, JSON.stringify({ key, reason: String((e as Error)?.message ?? e).slice(0, 300) }) + "\n");
  }
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

async function main() {
  mkdirSync(STATE, { recursive: true });
  let cloneId: string | null = null;
  if (CLONE_SLUG) {
    const { data } = await supabaseAdmin.from("clones").select("id").eq("slug", CLONE_SLUG).maybeSingle();
    if (!data) throw new Error(`no clone with slug ${CLONE_SLUG}`);
    cloneId = data.id;
  }
  const stats = { ok: 0, rejected: 0, failed: 0 };
  let idleSince = Date.now();
  for (;;) {
    const rows = await fetchRows(loadDone(), cloneId);
    console.log(`${rows.length} rows to ${DRY ? "preview" : "recaption"} (est. cost ~$${(rows.length * 0.0002).toFixed(2)})`);
    if (rows.length) { idleSince = Date.now(); await pool(rows, CONCURRENCY, (r) => processRow(r, stats)); }
    if (!FOLLOW || DRY) break;
    if (Date.now() - idleSince > 30 * 60_000) break;
    await new Promise((r) => setTimeout(r, 60_000));
  }
  console.log(`done: ${stats.ok} ok, ${stats.rejected} rejected by guard, ${stats.failed} failed (see ${FAIL_FILE}); re-run to retry failures`);
}

if (process.argv[1]?.endsWith("recaption-existing.ts")) main().catch((e) => { console.error("FATAL", e); process.exit(1); });
