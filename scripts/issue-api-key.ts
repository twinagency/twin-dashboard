// Mint / list / revoke per-model API keys for the public API.
//
//   npm run key:issue  -- --clone tru-kait --label "kait dashboard"
//   npm run key:list   -- [--clone tru-kait]
//   npm run key:revoke -- --prefix aB3xY9zQ
//
// THE KEY IS PRINTED ONCE. Only its sha256 is stored, so it cannot be
// recovered or re-displayed. Losing it means issuing a new one and revoking
// the old, which is the intended workflow, not a limitation to work around.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { generateKey } from "../lib/api-keys-admin";
import { hashKey, keyPrefix } from "../lib/api-tenant";

// This script runs outside Next, so .env is not loaded for it.
function loadEnv(): void {
  try {
    const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // fall through to whatever is already in the environment
  }
}
loadEnv();

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
if (!url || !serviceKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set (dashboard/.env)");
  process.exit(1);
}
// Guard rail from CLAUDE.md rule 1: this project only ever talks to the
// pre-cutover test stack, never the old prod project with live paying users.
if (!url.includes("aouaenqayfltoqrmpitg")) {
  console.error(`refusing to run against ${url} — this repo only ever targets aouaenqayfltoqrmpitg`);
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function resolveClone(idOrSlug: string): Promise<{ id: string; slug: string; name: string } | null> {
  const cols = "id,slug,name";
  for (const q of [
    db.from("clones").select(cols).eq("id", idOrSlug).maybeSingle(),
    db.from("clones").select(cols).eq("slug", idOrSlug).maybeSingle(),
    db.from("clones").select(cols).ilike("name", idOrSlug).limit(1).maybeSingle(),
  ]) {
    const { data } = await q;
    if (data) return data as { id: string; slug: string; name: string };
  }
  return null;
}

async function issue(): Promise<void> {
  const cloneArg = arg("clone");
  const label = arg("label");
  if (!cloneArg || !label) {
    console.error('usage: --clone <uuid|slug|name> --label "what this key is for"');
    process.exit(1);
  }
  const clone = await resolveClone(cloneArg);
  if (!clone) {
    console.error(`no clone matching "${cloneArg}"`);
    process.exit(1);
  }

  // generateKey() is shared with the dashboard page (lib/api-keys-admin.ts), so
  // a CLI key and a UI key are the same thing. Duplicating the generation here
  // is how the two end up with different lengths or a missing hash.
  const key = generateKey();
  const { error } = await db.from("api_keys").insert({
    clone_id: clone.id,
    key_hash: hashKey(key),
    key_prefix: keyPrefix(key),
    label,
  });
  if (error) {
    console.error(`failed: ${error.message}`);
    process.exit(1);
  }

  console.log(`
  Key issued for ${clone.name} (${clone.slug})
  label: ${label}

      ${key}

  This is the ONLY time it will be shown. Store it now.
  It can read revenue and fan data for ${clone.slug} and nothing else.
`);
}

async function list(): Promise<void> {
  const cloneArg = arg("clone");
  let q = db
    .from("api_keys")
    .select("key_prefix,label,created_at,last_used_at,revoked_at,clones(slug,name)")
    .order("created_at", { ascending: true });
  if (cloneArg) {
    const clone = await resolveClone(cloneArg);
    if (!clone) {
      console.error(`no clone matching "${cloneArg}"`);
      process.exit(1);
    }
    q = q.eq("clone_id", clone.id);
  }
  const { data, error } = await q;
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (!data?.length) {
    console.log("  no keys issued");
    return;
  }
  type KeyRow = {
    key_prefix: string;
    label: string;
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
    // PostgREST returns an embedded to-one relation as an object in some
    // versions and a single-element array in others. Handle both rather than
    // guessing, since guessing wrong prints "?" for every row and looks like
    // missing data.
    clones: { slug: string } | { slug: string }[] | null;
  };

  console.log();
  for (const r of data as unknown as KeyRow[]) {
    const slug = Array.isArray(r.clones) ? r.clones[0]?.slug : r.clones?.slug;
    const state = r.revoked_at ? `REVOKED ${r.revoked_at.slice(0, 10)}` : "live";
    console.log(
      `  ${r.key_prefix}…  ${(slug ?? "?").padEnd(12)} ${state.padEnd(20)} last used ${r.last_used_at ?? "never"}   ${r.label}`,
    );
  }
  console.log();
}

async function revoke(): Promise<void> {
  const prefix = arg("prefix");
  if (!prefix) {
    console.error("usage: --prefix <the 8 characters shown by key:list>");
    process.exit(1);
  }
  const { data, error } = await db
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("key_prefix", prefix)
    .is("revoked_at", null)
    .select("key_prefix,label");
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (!data?.length) {
    console.log(`  no live key with prefix ${prefix}`);
    return;
  }
  console.log(`  revoked ${data.length} key(s) with prefix ${prefix}. Effective on the next request.`);
}

// Wrapped in main() rather than using top-level await: dashboard/package.json
// has no "type": "module", so tsx compiles this as CJS and top-level await is
// a hard transform error there.
async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (cmd === "issue") await issue();
  else if (cmd === "list") await list();
  else if (cmd === "revoke") await revoke();
  else {
    console.error(`usage: issue | list | revoke

  issue  --clone <uuid|slug|name> --label "what this key is for"
  list   [--clone <uuid|slug|name>]
  revoke --prefix <8 chars>
`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
