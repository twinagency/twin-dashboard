// Type-only import on purpose: no runtime deps, so scripts and the assistant
// import this without server-only or the api-read <-> ai-assistant/tools cycle.
import type { SupabaseClient } from "@supabase/supabase-js";

// The one "uuid, slug or name" clone resolver: admin API, assistant read and
// write tools, scripts/issue-api-key.ts. Several pick the target of a WRITE.
// Any read error throws (null means "no such clone"; an outage is not one).
// Name match is exact and case-insensitive: `\`, `%`, `_` escaped, `*`
// (PostgREST's `%`, unescapable) refused, two hits is no hit.
export type CloneRef = { id: string; slug: string; name: string };

// Postgres uuid input forms (braces, hyphens optional); any other string on clones.id is 22P02.
const UUID = /^(?:\{[0-9a-f]{4}(?:-?[0-9a-f]{4}){7}\}|[0-9a-f]{4}(?:-?[0-9a-f]{4}){7})$/i;

export async function resolveCloneRef(db: SupabaseClient, input: string): Promise<CloneRef | null> {
  const clones = () => db.from("clones").select("id,slug,name");
  for (const col of UUID.test(input) ? ["id", "slug"] : ["slug"]) {
    const { data, error } = await clones().eq(col, input).maybeSingle();
    if (error) throw new Error(`clone lookup failed: ${error.message}`);
    if (data) return data as CloneRef;
  }
  if (input.includes("*")) return null;
  const { data, error } = await clones().ilike("name", input.replace(/[\\%_]/g, "\\$&")).limit(2);
  if (error) throw new Error(`clone lookup failed: ${error.message}`);
  return data?.length === 1 ? (data[0] as CloneRef) : null;
}
