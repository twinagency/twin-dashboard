import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgencyIdentity } from "./agency-identity";
import { agencyCanManage } from "./agency-management-policy";
import { scopedSelection } from "./agency-query";
import { serviceClient } from "./supabase-service";
import { canEditRevision, canTransitionRevision, canTransitionSession, type RevisionState, type SessionStatus } from "./sequence-policy";

// Sequence children do not have clone_id. Resolve their ownership through the
// fixed parent chain; never treat a caller's parent filter as authorization.
const COLUMNS: Record<string, readonly string[]> = {
  video_sequences: ["id", "clone_id", "title", "source_video_id", "content_family_id", "created_at"],
  video_sequence_revisions: ["id", "sequence_id", "revision_no", "state", "approved_by", "approved_at", "published_at"],
  video_sequence_parts: ["id", "revision_id", "position", "is_preview", "caption", "price_stars", "storage_path", "source_start_seconds", "source_end_seconds", "requires_position", "duration_seconds"],
  video_sequence_jobs: ["id", "clone_id", "revision_id", "status", "created_at"],
  video_sequence_sessions: ["clone_id", "user_id", "revision_id", "status", "lock_version", "pause_reason", "updated_at"],
};
const EMPTY = "00000000-0000-0000-0000-000000000000";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error("Invalid sequence resource");
  return value;
}
function clone(agency: AgencyIdentity, value: unknown): string {
  const id = uuid(value);
  if (!agency.cloneIds.includes(id)) throw new Error("Creator access denied");
  return id;
}
function single(url: URL, field: string): string {
  const values = url.searchParams.getAll(field);
  if (values.length !== 1 || !values[0].startsWith("eq.")) throw new Error("A single sequence resource must be selected");
  return uuid(values[0].slice(3));
}
function andIds(url: URL, field: string, ids: string[]) {
  const validated = ids.map(uuid);
  url.searchParams.append("and", `(${field}.in.(${(validated.length ? validated : [EMPTY]).join(",")}))`);
}
function fields(body: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body) || !Object.keys(body).length || Object.keys(body).some(key => !allowed.includes(key))) throw new Error("Unsupported sequence field");
  return body as Record<string, unknown>;
}
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }

export function isAgencySequenceTable(table: string): boolean { return Object.hasOwn(COLUMNS, table); }

/** Only the two joins used by the sequence screens are admitted. No aliases,
 * arbitrary relationships, functions, or recursive nesting. */
export function sequenceSelection(table: string, selection: string, nested = false): string {
  const allowed = COLUMNS[table];
  if (!allowed) throw new Error("Unsupported sequence table");
  const compact = selection.replace(/\s/g, "");
  const parts = compact.match(/[^,()]+\([^()]*\)|[^,()]+/g) ?? [];
  if (!parts.length || parts.join(",") !== compact) throw new Error("Unsupported related sequence data");
  const output = parts.flatMap(field => {
    if (field === "*") return [...allowed];
    if (allowed.includes(field)) return [field];
    const related = !nested && (
      table === "video_sequences" ? /^video_sequence_revisions\(([^()]*)\)$/.exec(field)
        : table === "video_sequence_revisions" ? /^video_sequences!inner\(([^()]*)\)$/.exec(field) : null
    );
    if (!related) throw new Error("Unsupported sequence column");
    const child = table === "video_sequences" ? "video_sequence_revisions" : "video_sequences";
    return [`${child}${table === "video_sequence_revisions" ? "!inner" : ""}(${sequenceSelection(child, related[1], true)})`];
  });
  return [...new Set(output)].join(",");
}

async function idsFor(db: SupabaseClient, table: string, owner: string, owners: string[]): Promise<string[]> {
  if (!owners.length) return [];
  const ids: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from(table).select("id").in(owner, owners).order("id").range(offset, offset + 999);
    if (error) throw new Error("Sequence ownership unavailable");
    const rows = data ?? [];
    ids.push(...rows.map(row => uuid(row.id)));
    if (rows.length < 1000) return ids;
  }
}
async function ownedSequence(db: SupabaseClient, agency: AgencyIdentity, value: unknown) {
  const id = uuid(value);
  const { data, error } = await db.from("video_sequences").select("id,clone_id,source_video_id,content_family_id").eq("id", id).in("clone_id", agency.cloneIds).maybeSingle();
  if (error || !data) throw new Error("Sequence access denied");
  clone(agency, data.clone_id);
  return data as { id: string; clone_id: string; source_video_id: string | null; content_family_id: string };
}
async function ownedRevision(db: SupabaseClient, agency: AgencyIdentity, value: unknown) {
  const id = uuid(value);
  const { data, error } = await db.from("video_sequence_revisions").select("id,sequence_id,state,approved_by,approved_at").eq("id", id).maybeSingle();
  if (error || !data) throw new Error("Revision access denied");
  const sequence = await ownedSequence(db, agency, data.sequence_id);
  return { ...data, id, sequence } as { id: string; sequence_id: string; state: RevisionState; approved_by: string | null; approved_at: string | null; sequence: Awaited<ReturnType<typeof ownedSequence>> };
}
async function ownedVideo(db: SupabaseClient, agency: AgencyIdentity, value: unknown, cloneId?: string) {
  const { data, error } = await db.from("videos").select("id,clone_id,storage_path,content_family_id").eq("id", uuid(value)).in("clone_id", agency.cloneIds).maybeSingle();
  if (error || !data || (cloneId && data.clone_id !== cloneId)) throw new Error("Source video access denied");
  clone(agency, data.clone_id);
  return data as { id: string; clone_id: string; storage_path: string; content_family_id: string | null };
}

export async function scopeSequenceRead(input: URL, agency: AgencyIdentity, db: SupabaseClient = serviceClient()): Promise<URL> {
  const url = new URL(input);
  const table = url.pathname.split("/").pop()!;
  url.searchParams.set("select", sequenceSelection(table, url.searchParams.get("select") || "*"));
  agency.cloneIds.forEach(uuid);
  if (table === "video_sequence_revisions" || table === "video_sequence_parts") {
    const sequences = await idsFor(db, "video_sequences", "clone_id", agency.cloneIds);
    const ids = table === "video_sequence_parts" ? await idsFor(db, "video_sequence_revisions", "sequence_id", sequences) : sequences;
    andIds(url, table === "video_sequence_parts" ? "revision_id" : "sequence_id", ids);
  } else andIds(url, "clone_id", agency.cloneIds);
  return url;
}

/** Existing sequence actions are the only callers; this transport layer also
 * proves tenant ownership and rejects re-parenting and ownership/entitlement edits. */
export async function scopeSequenceWrite(input: URL, method: string, body: unknown, agency: AgencyIdentity, db: SupabaseClient = serviceClient()): Promise<URL> {
  if (!agencyCanManage(agency)) throw new Error("Read-only agency access");
  const url = new URL(input);
  const table = url.pathname.split("/").pop()!;
  if (!isAgencySequenceTable(table) || url.searchParams.has("on_conflict")) throw new Error("Unsupported sequence write");
  if (url.searchParams.has("select")) url.searchParams.set("select", sequenceSelection(table, url.searchParams.get("select")!));
  if (table === "video_sequences" && method === "POST") {
    const row = fields(body, ["clone_id", "title", "source_video_id", "content_family_id"]);
    const cloneId = clone(agency, row.clone_id);
    if (!text(row.title) || row.title.length > 200) throw new Error("Invalid sequence title");
    uuid(row.content_family_id);
    if (row.source_video_id) {
      const source = await ownedVideo(db, agency, row.source_video_id, cloneId);
      if (source.content_family_id !== row.content_family_id) throw new Error("Source content family does not match");
    }
    return url;
  }
  if (table === "video_sequence_revisions" && method === "POST") {
    const row = fields(body, ["sequence_id", "revision_no", "state"]);
    await ownedSequence(db, agency, row.sequence_id);
    if (row.state !== "draft" || !Number.isSafeInteger(row.revision_no) || Number(row.revision_no) < 1) throw new Error("New revisions must be drafts");
    return url;
  }
  if (table === "video_sequence_revisions" && method === "PATCH") {
    const row = fields(body, ["state", "approved_by", "approved_at", "published_at"]);
    const revision = await ownedRevision(db, agency, single(url, "id"));
    if (typeof row.state !== "string" || !canTransitionRevision(revision.state, row.state as RevisionState)) throw new Error("Invalid revision transition");
    if (row.state === "processing" && (!text(row.approved_by) || !text(row.approved_at))) throw new Error("Approval is required");
    if (row.state === "published" && (!revision.approved_by || !revision.approved_at || !text(row.published_at))) throw new Error("Approved revision required");
    andIds(url, "id", [revision.id]);
    andIds(url, "sequence_id", [revision.sequence.id]);
    url.searchParams.append("and", `(state.eq.${revision.state})`);
    return url;
  }
  if (table === "video_sequence_parts" && (method === "POST" || method === "DELETE")) {
    const rows = method === "POST" ? (Array.isArray(body) ? body : [body]) : [];
    if (method === "POST" && (!rows.length || rows.length > 1000)) throw new Error("Invalid clip list");
    const revisionId = method === "DELETE" ? single(url, "revision_id") : uuid((rows[0] as Record<string, unknown>)?.revision_id);
    const revision = await ownedRevision(db, agency, revisionId);
    if (!canEditRevision(revision.state)) throw new Error("This revision is not editable");
    andIds(url, "revision_id", [revision.id]);
    for (const value of rows) {
      const row = fields(value, ["revision_id", "position", "is_preview", "storage_path", "caption", "source_start_seconds", "source_end_seconds", "price_stars", "requires_position"]);
      if (row.revision_id !== revision.id || !Number.isSafeInteger(row.position) || Number(row.position) < 0 || row.storage_path !== `pending/${revision.id}/${row.position}`) throw new Error("Invalid draft clip ownership or storage");
    }
    return url;
  }
  if (table === "video_sequence_jobs" && method === "POST") {
    const row = fields(body, ["clone_id", "revision_id", "source_storage_path", "source_video_id", "cut_points", "approved_by", "approved_at"]);
    const revision = await ownedRevision(db, agency, row.revision_id);
    const cloneId = clone(agency, row.clone_id);
    if (revision.sequence.clone_id !== cloneId || revision.sequence.source_video_id !== row.source_video_id || !canEditRevision(revision.state)) throw new Error("Invalid render source");
    const source = await ownedVideo(db, agency, row.source_video_id, cloneId);
    if (row.source_storage_path !== source.storage_path || !text(row.approved_by) || !text(row.approved_at) || !Array.isArray(row.cut_points) || !row.cut_points.length) throw new Error("Invalid approved render");
    return url;
  }
  if (table === "video_sequence_sessions" && method === "PATCH") {
    const row = fields(body, ["status", "pause_reason", "updated_at", "lock_version"]);
    const cloneId = clone(agency, single(url, "clone_id"));
    const userId = single(url, "user_id");
    const { data: user, error: userError } = await db.from("users").select("id").eq("id", userId).eq("clone_id", cloneId).maybeSingle();
    if (userError || !user) throw new Error("Fan access denied");
    const { data: session, error } = await db.from(table).select("status,lock_version").eq("clone_id", cloneId).eq("user_id", userId).maybeSingle();
    if (error || !session || !["active", "paused", "stopped"].includes(String(row.status)) || !canTransitionSession(session.status as SessionStatus, row.status as SessionStatus) || row.lock_version !== session.lock_version + 1) throw new Error("Invalid fan session transition");
    andIds(url, "clone_id", [cloneId]);
    andIds(url, "user_id", [userId]);
    url.searchParams.append("and", `(lock_version.eq.${session.lock_version})`);
    return url;
  }
  throw new Error("Unsupported sequence write");
}

/** Source recordings need this one field for duplicate-purchase protection.
 * Ordinary video reads/writes continue through the existing policy. */
export function sequenceVideoSelection(input: URL, agency: AgencyIdentity): URL {
  const url = new URL(input);
  const selection = (url.searchParams.get("select") || "*").split(",").map(field => field.trim());
  url.searchParams.set("select", selection.map(field => field === "content_family_id" ? field : scopedSelection("videos", field)).join(","));
  andIds(url, "clone_id", agency.cloneIds);
  return url;
}
export async function scopeSequenceVideoFamily(input: URL, body: unknown, agency: AgencyIdentity, db: SupabaseClient = serviceClient()): Promise<URL> {
  if (!agencyCanManage(agency)) throw new Error("Read-only agency access");
  const row = fields(body, ["content_family_id"]);
  uuid(row.content_family_id);
  const url = new URL(input);
  if (url.searchParams.has("on_conflict")) throw new Error("Agency upserts are not allowed");
  const source = await ownedVideo(db, agency, single(url, "id"));
  if (source.content_family_id) throw new Error("Content family cannot be reassigned");
  andIds(url, "clone_id", [source.clone_id]);
  url.searchParams.append("and", "(content_family_id.is.null)");
  if (url.searchParams.has("select")) url.searchParams.set("select", sequenceVideoSelection(url, agency).searchParams.get("select")!);
  return url;
}
