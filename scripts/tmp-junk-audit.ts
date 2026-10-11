// Read-only audit: classify every described photo/video as sellable creator content or junk.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { supabaseAdmin } from "../lib/supabase";
import { orChat } from "../lib/openrouter";
const OUT = "/home/ronan/twin/drive-import/work/junk-audit/results.jsonl";
const SYSTEM = `You audit an adult creator's content catalogue. Given a factual description of one photo or video frame, decide if it is sellable content OF THE CREATOR herself: a woman is visibly in the frame (any clothing level, any pose, selfies included).
JUNK means: no woman in frame (empty rooms, scenery, pools, food, pets, objects), clothing or lingerie laid out with nobody wearing it, text/graphics/slides/price cards/promos/logos/screenshots/memes/documents, or only a man/other person with no woman.
Answer ONLY JSON: {"junk":true|false,"reason":"<=8 words"}`;
async function main() {
  const done = new Set(existsSync(OUT) ? readFileSync(OUT, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).key) : []);
  const rows: any[] = [];
  for (const table of ["photos", "videos"]) for (let from = 0; ; from += 1000) {
    const { data } = await supabaseAdmin.from(table).select("id, clone_id, created_at, storage_path, visual_description").not("visual_description", "is", null).order("id").range(from, from + 999);
    for (const r of data ?? []) if (!done.has(`${table}:${r.id}`)) rows.push({ table, ...r });
    if ((data ?? []).length < 1000) break;
  }
  console.log(`${rows.length} to audit`);
  let i = 0, n = 0;
  await Promise.all(Array.from({ length: 30 }, async () => { while (i < rows.length) { const r = rows[i++];
    for (let a = 0; a < 3; a++) { try {
      const out = await orChat({ model: "deepseek/deepseek-v4-flash", system: SYSTEM, user: r.visual_description, temperature: 0, json: true });
      const j = JSON.parse(out.replace(/```json|```/g, ""));
      appendFileSync(OUT, JSON.stringify({ key: `${r.table}:${r.id}`, clone_id: r.clone_id, created_at: r.created_at, storage_path: r.storage_path, junk: !!j.junk, reason: j.reason, desc: r.visual_description.slice(0, 220) }) + "\n");
      if (++n % 200 === 0) console.log(`${n} audited`); break;
    } catch { await new Promise((s) => setTimeout(s, 1500 * 2 ** a)); } }
  } }));
  console.log("done");
}
main();
