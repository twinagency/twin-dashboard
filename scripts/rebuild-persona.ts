// Recompile a clone's `persona` jsonb from its saved `intake.fields`, using the
// dashboard's OWN buildPersona() so the result is byte-identical to what
// pressing Save on the form produces.
//
// WHY THIS EXISTS: `persona` is a COMPILED artifact. The bot reads it directly
// and never looks at `intake`, so writing intake prose straight into the
// database changes nothing until this runs. That gap is easy to miss and it
// looks exactly like "the field does nothing" -- this project's most common
// defect shape.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... tsx scripts/rebuild-persona.ts <slug> [slug...]
//   ... --all      every clone
//   ... --dry-run  print the before/after sizes, write nothing
import { createClient } from "@supabase/supabase-js";
import { buildPersona } from "../lib/persona-build";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required");
  process.exit(1);
}
const db = createClient(url, key);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const all = args.includes("--all");
const slugs = args.filter((a) => !a.startsWith("--"));

if (!all && slugs.length === 0) {
  console.error("give at least one slug, or --all");
  process.exit(1);
}

async function main(): Promise<void> {
  let q = db.from("clones").select("id, slug, name, intake, vibe_preset, persona");
  if (!all) q = q.in("slug", slugs);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("no matching clones");

  for (const row of data) {
    const fields = (row.intake as { fields?: Record<string, string> } | null)?.fields ?? {};
    const before = JSON.stringify(row.persona ?? {}).length;
    const persona = buildPersona(fields, row.name, row.vibe_preset ?? null);
    const after = JSON.stringify(persona).length;

    if (dryRun) {
      console.log(`${row.slug}: ${before} -> ${after} chars (dry run, nothing written)`);
      continue;
    }
    const { error: upErr } = await db.from("clones").update({ persona }).eq("id", row.id);
    if (upErr) throw new Error(`${row.slug}: ${upErr.message}`);
    console.log(`${row.slug}: ${before} -> ${after} chars`);
    for (const k of ["PERSONA", "FLIRT_NSFW", "VOICE_TRAITS", "KNOWLEDGE_BASE"] as const) {
      const len = (persona[k] ?? "").length;
      if (len) console.log(`   ${k.padEnd(15)} ${len} chars`);
    }
  }
}
void main();
