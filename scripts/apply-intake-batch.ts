// Apply drafted questionnaire fields from a JSON batch, then recompile each
// clone's persona with the dashboard's own buildPersona().
//
// Shape: { "<slug>": { "flirt_nsfw": "...", "example_texts": "...", ... }, ... }
// Existing fields are MERGED, not replaced — a batch that only carries
// flirt_nsfw leaves everything else that creator already had intact.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... tsx scripts/apply-intake-batch.ts <file.json> [--dry-run]
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildPersona } from "../lib/persona-build";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) { console.error("SUPABASE_URL and SUPABASE_SERVICE_KEY required"); process.exit(1); }
const db = createClient(url, key);

const file = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!file) { console.error("give a batch json file"); process.exit(1); }

const batch = JSON.parse(readFileSync(file, "utf8")) as Record<string, Record<string, string>>;

async function main(): Promise<void> {
  for (const [slug, incoming] of Object.entries(batch)) {
    const { data, error } = await db
      .from("clones").select("id, name, intake, vibe_preset, persona").eq("slug", slug).single();
    if (error || !data) { console.error(`${slug}: NOT FOUND (${error?.message})`); continue; }

    const existing = (data.intake as { fields?: Record<string, string> } | null)?.fields ?? {};
    const fields = { ...existing, ...incoming };          // merge, never clobber
    const persona = buildPersona(fields, data.name, data.vibe_preset ?? null);
    const before = JSON.stringify(data.persona ?? {}).length;
    const after = JSON.stringify(persona).length;
    const sexual = (persona.FLIRT_NSFW ?? "").length;

    if (dryRun) {
      console.log(`${slug.padEnd(18)} ${before} -> ${after}  sexual=${sexual}  (dry run)`);
      continue;
    }
    const intake = { ...(data.intake ?? {}), fields };
    const { error: upErr } = await db.from("clones").update({ intake, persona }).eq("id", data.id);
    if (upErr) { console.error(`${slug}: ${upErr.message}`); continue; }
    console.log(`${slug.padEnd(18)} ${before} -> ${after}  sexual=${sexual}  [${Object.keys(incoming).join(",")}]`);
  }
}
void main();
