// G30b shared-media route fakes, shared by G30b-shared-media-retry-route.test.ts and G04c1-shared-media-refresh.test.ts.
// `sharedFakeDb(store)` is an in-memory serviceClient whose shared_media_transfers insert is unique per (account, source) among
// LIVE rows only (an independent copy of the partial unique index in 20261113100300; the index itself is proven against real
// PostgreSQL in G30b-shared-media-retry-index.test.mjs), and whose `.or()` evaluates the PostgREST logic tree itself (`and()`/`or()`
// nesting, `eq`/`neq`/`in`/`is` with an optional `not.`, SQL null semantics). Synthetic values only.
import { CONTENT_SCHEMA } from "../../lib/onlyfans/content";
import { MAX_CHUNK_BYTES, MEDIA_SCHEMA } from "../../lib/onlyfans/vault-media";
import { PREFLIGHT, SUPABASE, calls, servicePath, type Call } from "../helpers/W3-api-onlyfans-plus7-harness";

export type Row = Record<string, unknown>;
export type Store = { rows: Row[]; racer: Row | null }; // racer: inserted by a "concurrent" request just before the route's own insert
export const ROUTE = "onlyfans-content/accounts/[accountId]/shared-media";
export const C = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", S = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", FILE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const JOB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd", ACTOR = "agency-user:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee:ffffffff-ffff-4fff-8fff-ffffffffffff";
export const UPLOADS = "/onlyfans/content/v1/accounts/of-a/vault/uploads";
// Independent of lib/shared-media.ts: retryable only for these exact (status, error_code) pairs with no vault media id.
const live = (r: Row) => r.media_id != null || !(r.status === "expired" && r.error_code === "media_request_expired" || r.status === "superseded" && r.error_code === "media_connection_changed");
const sameKey = (a: Row, b: Row) => ["account_id", "source_kind", "source_id"].every(k => a[k] === b[k]);
const SOURCE = new Uint8Array(1024).fill(7); SOURCE.set([255, 216, 255, 224]);

// PostgREST logic tree: comma list at depth 0, `and(..)`/`or(..)` groups, `col.[not.]op.value` leaves. A comparison with a SQL
// null is unknown, which this two-valued fake treats as false (sound here: no group is negated).
function splitTop(list: string) {
  const parts: string[] = []; let depth = 0, start = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === "(") depth++; else if (list[i] === ")") depth--;
    else if (list[i] === "," && depth === 0) { parts.push(list.slice(start, i)); start = i + 1; }
  }
  return [...parts, list.slice(start)];
}
export function orTerm(term: string): (r: Row) => boolean {
  const group = /^(and|or)\((.*)\)$/.exec(term);
  if (group) { const terms = splitTop(group[2]).map(orTerm); return group[1] === "and" ? r => terms.every(t => t(r)) : r => terms.some(t => t(r)); }
  const m = /^(\w+)\.(not\.)?(eq|neq|in|is)\.(.*)$/.exec(term); if (!m) throw Error(`unsupported or term ${term}`);
  const [, col, not, op, raw] = m;
  if (op === "is") { if (raw !== "null") throw Error(`unsupported is ${raw}`); return r => (r[col] == null) !== !!not; }
  const list = op === "in" ? raw.replace(/^\(|\)$/g, "").split(",") : [raw];
  return r => r[col] != null && (list.includes(r[col] as string) !== (op === "neq")) !== !!not;
}
export function sharedFakeDb(store: Store) {
  return {
    storage: { from: () => ({ createSignedUrl: async (path: string) => ({ data: { signedUrl: `${SUPABASE}/storage/v1/object/sign/media/${path}?sig=synthetic` }, error: null }) }) },
    from(table: string) {
      const preds: Array<(r: Row) => boolean> = [];
      let op: { kind: "select" } | { kind: "update"; patch: Row } | { kind: "insert"; value: Row } = { kind: "select" };
      const result = (): { data: Row[] | null; error: { code: string } | null } => {
        if (table === "photos") return { data: [{ id: S, clone_id: C, storage_path: `${C}/photos/saved.jpg` }].filter(r => preds.every(p => p(r))), error: null };
        if (op.kind === "insert") {
          if (store.racer) { store.rows.push(store.racer); store.racer = null; }
          const row = { job_id: null, media_id: null, status: "prepared", processing: false, received_bytes: 0, error_code: null, ...op.value };
          if (store.rows.some(r => sameKey(r, row) && live(r))) return { data: null, error: { code: "23505" } };
          store.rows.push(row); return { data: [{ ...row }], error: null };
        }
        const hit = store.rows.filter(r => preds.every(p => p(r)));
        if (op.kind === "update") { const patch = op.patch; hit.forEach(r => Object.assign(r, patch)); }
        return { data: hit.map(r => ({ ...r })), error: null };
      };
      const q: Record<string, unknown> = {
        select: () => q, order: () => q, limit: () => q,
        eq: (k: string, v: unknown) => { preds.push(r => r[k] === v); return q; },
        is: (k: string, v: null) => { if (v !== null) throw Error("unsupported is"); preds.push(r => r[k] == null); return q; },
        or: (filter: string) => { preds.push(orTerm(`or(${filter})`)); return q; },
        insert: (value: Row) => { op = { kind: "insert", value }; return q; },
        update: (patch: Row) => { op = { kind: "update", patch }; return q; },
        maybeSingle: async () => { const r = result(); if (r.error) return r; return (r.data?.length ?? 0) > 1 ? { data: null, error: { code: "PGRST116" } } : { ...r, data: r.data?.[0] ?? null }; },
        then: (a: (v: unknown) => unknown, b: (e: unknown) => unknown) => Promise.resolve(result()).then(a, b),
      };
      return q;
    },
  };
}
export const receipt = (over: Row = {}): Row => ({ id: "receipt-1", clone_id: C, source_kind: "photo", source_id: S, account_id: "of-a", storage_path: `${C}/photos/saved.jpg`,
  file_name: `${S}.jpg`, size_bytes: 1024, source_sha256: "1".repeat(64), chunk_sha256: ["2".repeat(64)], file_id: FILE, connection_revision: 3, actor: ACTOR,
  job_id: null, media_id: null, status: "prepared", processing: false, received_bytes: 0, error_code: null, ...over });

/** A backend `GET .../vault/uploads` answer listing `jobs`. */
export const uploadsList = (jobs: unknown[]) => Response.json({ schemaVersion: CONTENT_SCHEMA, ok: true, accountId: "of-a",
  uploads: { schemaVersion: MEDIA_SCHEMA, accountId: "of-a", maxFiles: 20, maxFileBytes: 1024 ** 3, chunkBytes: MAX_CHUNK_BYTES, enabled: true, jobs } });
/** The default wire: the saved source, an empty upload list, and a create that answers a pending job. */
export const answer = (c: Call) => {
  if (c.method === "GET" && c.url.startsWith(`${SUPABASE}/storage/v1/object/sign/media/${C}/photos/saved.jpg?`))
    return new Response(SOURCE, { status: 200, headers: { "content-type": "image/jpeg", "content-length": String(SOURCE.length) } });
  const path = servicePath(c);
  if (c.method === "GET" && path === UPLOADS) return uploadsList([]);
  if (c.method === "POST" && path === UPLOADS) {
    const f = (c.body as { files: Array<{ fileId: string; name: string; size: number }> }).files[0], now = new Date().toISOString();
    return Response.json({ schemaVersion: CONTENT_SCHEMA, ok: true, accountId: "of-a", upload: { jobId: JOB, kind: "upload", status: "pending", lastError: null, cleanupRequired: false,
      requestedAt: now, updatedAt: now, files: [{ ...f, receivedBytes: f.size, prefixDigest: null, status: "staged", mediaId: null, processing: false, error: null }] } });
  }
  return Response.json({ ok: false }, { status: 404 });
};
export const creates = () => calls.filter(c => c.method === "POST" && servicePath(c) === UPLOADS);
export const createdFile = () => (creates()[0]?.body as { files: Array<{ fileId: string }> } | undefined)?.files[0].fileId;
export const work = () => calls.filter(c => c.path !== PREFLIGHT); // every upstream call but the agency transport's auth preflight
