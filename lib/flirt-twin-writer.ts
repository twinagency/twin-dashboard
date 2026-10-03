import { createClient } from "@supabase/supabase-js";
import { configuration } from "../deployment/flirt-live-twin.cjs";
import { assertStartup } from "../deployment/flirt-environment.cjs";
import { PLACEHOLDER_TOKEN_PREFIX } from "./flirt-clone-build";

// The ONLY place the FLIRT dashboard writes to Twin's database for clone building.
// It reuses the existing server-side live connection (FLIRT_LIVE_TWIN_*), never sends
// a key to the browser, and wraps it in a fetch that can do exactly three things:
//   GET  /rest/v1/clones   filtered by slug or by our own creator marker
//   POST /rest/v1/clones   ONE row, status=paused, placeholder bot token
// Everything else (other tables, other methods, updates, deletes, storage, rpc,
// bulk inserts, an active clone, a real token) throws before leaving the process.
export interface TwinCloneWriter {
  findByCreator(creatorAccountId: string): Promise<{ id: string; slug: string } | null>;
  slugTaken(slug: string): Promise<boolean>;
  insert(row: Record<string, unknown>): Promise<{ id: string; slug: string }>;
}

export function guardedTwinFetch(twinUrl: string, inner: typeof fetch = fetch): typeof fetch {
  const host = new URL(twinUrl).host;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input));
    const method = (init?.method || request?.method || "GET").toUpperCase();
    if (url.host !== host || url.pathname !== "/rest/v1/clones") throw new Error("FLIRT clone pipeline may only touch the Twin clones table");
    if (method === "GET") {
      const keys = [...url.searchParams.keys()].filter((k) => k !== "select" && k !== "limit");
      if (keys.length !== 1 || !["slug", "intake->>flirt_creator_account_id"].includes(keys[0])) throw new Error("FLIRT clone pipeline read is not allowed");
    } else if (method === "POST") {
      const body = typeof init?.body === "string" ? init.body : null;
      let row: any;
      try { row = body ? JSON.parse(body) : null; } catch { row = null; }
      if (!row || Array.isArray(row) || row.status !== "paused" || typeof row.bot_token !== "string" || !row.bot_token.startsWith(PLACEHOLDER_TOKEN_PREFIX)) {
        throw new Error("FLIRT clone pipeline may only insert one paused clone with a placeholder token");
      }
    } else throw new Error("FLIRT clone pipeline method is not allowed");
    return inner(input as RequestInfo, init);
  }) as typeof fetch;
}

export function twinCloneWriter(inner: typeof fetch = fetch): TwinCloneWriter {
  assertStartup("dashboard");
  const { url, key } = configuration();
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: guardedTwinFetch(url, inner) } });
  return {
    async findByCreator(id) {
      const r = await db.from("clones").select("id,slug").eq("intake->>flirt_creator_account_id", id).limit(1);
      if (r.error) throw new Error("Twin clone lookup failed");
      return r.data?.[0] ? { id: String(r.data[0].id), slug: String(r.data[0].slug) } : null;
    },
    async slugTaken(slug) {
      const r = await db.from("clones").select("id").eq("slug", slug).limit(1);
      if (r.error) throw new Error("Twin slug lookup failed");
      return !!r.data?.length;
    },
    async insert(row) {
      const r = await db.from("clones").insert(row).select("id,slug").single();
      if (r.error || !r.data) { const e: Error & { code?: string } = new Error("Twin clone insert failed"); e.code = r.error?.code; throw e; }
      return { id: String(r.data.id), slug: String(r.data.slug) };
    },
  };
}
