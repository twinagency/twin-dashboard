import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MOXY_MANAGEMENT_AGENCY_ID } from "../lib/agency-management-policy";
import { isAgencySequenceTable, sequenceSelection, scopeSequenceRead, scopeSequenceWrite, sequenceVideoSelection, scopeSequenceVideoFamily } from "../lib/agency-sequence";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const agency = { id: MOXY_MANAGEMENT_AGENCY_ID, name: "Moxy", canManage: true, cloneIds: [id(1)] };
const tables: Record<string, Record<string, unknown>[]> = {
  video_sequences: [
    { id: id(11), clone_id: id(1), source_video_id: id(31), content_family_id: id(71) },
    { id: id(12), clone_id: id(2), source_video_id: id(32), content_family_id: id(72) },
  ],
  video_sequence_revisions: [
    { id: id(21), sequence_id: id(11), state: "draft", approved_by: null, approved_at: null },
    { id: id(22), sequence_id: id(12), state: "draft", approved_by: null, approved_at: null },
    { id: id(23), sequence_id: id(11), state: "published", approved_by: "Owner", approved_at: "2026-10-08" },
  ],
  videos: [
    { id: id(31), clone_id: id(1), storage_path: `${id(1)}/source.mp4`, content_family_id: id(71) },
    { id: id(32), clone_id: id(2), storage_path: `${id(2)}/source.mp4`, content_family_id: id(72) },
    { id: id(33), clone_id: id(1), storage_path: `${id(1)}/other.mp4`, content_family_id: null },
  ],
  users: [{ id: id(41), clone_id: id(1) }, { id: id(42), clone_id: id(2) }],
  video_sequence_sessions: [{ clone_id: id(1), user_id: id(41), status: "active", lock_version: 2 }],
};
const lookups: {table:string; filters:[string,unknown][]}[] = [];
const db = { from(table: string) {
  let rows = tables[table] ?? [];
  const query = { table, filters: [] as [string, unknown][] };
  lookups.push(query);
  const builder = {
    select() { return builder; },
    eq(key: string, value: unknown) { query.filters.push([key, value]); rows = rows.filter(row => row[key] === value); return builder; },
    in(key: string, values: unknown[]) { query.filters.push([key, values]); rows = rows.filter(row => values.includes(row[key])); return builder; },
    order() { return builder; },
    range(start: number, end: number) { rows = rows.slice(start, end + 1); return builder; },
    maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
    then(resolve: (value: unknown) => void) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
  };
  return builder;
} } as unknown as SupabaseClient;
const url = (table: string, params: Record<string, string> = {}) => {
  const result = new URL(`https://test.supabase.co/rest/v1/${table}`);
  Object.entries(params).forEach(([key, value]) => result.searchParams.set(key, value));
  return result;
};
const write = (table: string, method: string, body: unknown, params: Record<string,string> = {}) => scopeSequenceWrite(url(table, params), method, body, agency, db);
let checks = 0;
async function rejects(call: () => unknown | Promise<unknown>) { await assert.rejects(async () => call()); checks++; }
function ok(value: unknown) { assert.ok(value); checks++; }

async function main() {
  ok(sequenceSelection("video_sequences", "id,title,created_at,source_video_id,video_sequence_revisions(id,revision_no,state)").includes("video_sequence_revisions(id,revision_no,state)"));
  ok(sequenceSelection("video_sequence_revisions", "id,revision_no,state,approved_by,approved_at,published_at,video_sequences!inner(id,clone_id,title,source_video_id)").includes("video_sequences!inner"));
  for (const selection of ["secret", "clones(bot_token)", "alias:video_sequence_revisions(id)", "video_sequence_revisions(video_sequences(id))", "id,,title"]) {
    await rejects(() => sequenceSelection("video_sequences", selection));
  }
  ok(!isAgencySequenceTable("video_sequence_entitlements"));
  const list = await scopeSequenceRead(url("video_sequences", { select: "id,title", clone_id: `eq.${id(2)}`, or: `(clone_id.eq.${id(2)})`, and: `(title.eq.test)` }), agency, db);
  ok(list.searchParams.getAll("and").includes(`(clone_id.in.(${id(1)}))`));
  ok(list.searchParams.getAll("and").includes("(title.eq.test)"));
  const rev = await scopeSequenceRead(url("video_sequence_revisions", { select: "id,state", id: `eq.${id(22)}` }), agency, db);
  ok(rev.searchParams.getAll("and").includes(`(sequence_id.in.(${id(11)}))`));
  const parts = await scopeSequenceRead(url("video_sequence_parts", { select: "position,caption" }), agency, db);
  ok(parts.searchParams.getAll("and").includes(`(revision_id.in.(${id(21)},${id(23)}))`));
  ok(!parts.search.includes(id(22)));
  const empty = await scopeSequenceRead(url("video_sequence_parts", { select: "id" }), {...agency, cloneIds: []}, db);
  ok(empty.searchParams.get("and") === "(revision_id.in.(00000000-0000-0000-0000-000000000000))");
  ok(lookups.filter(q => q.table === "video_sequences").every(q => q.filters.some(([key]) => key === "clone_id")));

  const sequenceBody = { clone_id: id(1), title: "Test", source_video_id: id(31), content_family_id: id(71) };
  await write("video_sequences", "POST", sequenceBody); checks++;
  await rejects(() => write("video_sequences", "POST", {...sequenceBody, clone_id: id(2)}));
  await rejects(() => write("video_sequences", "POST", {...sequenceBody, source_video_id: id(32)}));
  await rejects(() => write("video_sequences", "POST", {...sequenceBody, content_family_id: id(72)}));
  await rejects(() => write("video_sequences", "PATCH", {clone_id:id(2)}, {id:`eq.${id(11)}`}));
  await rejects(() => scopeSequenceWrite(url("video_sequences"), "POST", sequenceBody, {...agency, canManage:false}, db));
  await rejects(() => write("video_sequences", "POST", sequenceBody, {on_conflict:"id"}));
  await write("video_sequence_revisions", "POST", {sequence_id:id(11),revision_no:1,state:"draft"}); checks++;
  await rejects(() => write("video_sequence_revisions", "POST", {sequence_id:id(12),revision_no:1,state:"draft"}));
  await rejects(() => write("video_sequence_revisions", "POST", {sequence_id:id(11),revision_no:1,state:"published"}));
  await rejects(() => write("video_sequence_revisions", "PATCH", {sequence_id:id(12)}, {id:`eq.${id(21)}`}));
  await rejects(() => write("video_sequence_revisions", "PATCH", {state:"processing",approved_by:"Owner",approved_at:"2026-10-08"}, {id:`eq.${id(22)}`}));
  const approved = await write("video_sequence_revisions", "PATCH", {state:"processing",approved_by:"Owner",approved_at:"2026-10-08"}, {id:`eq.${id(21)}`});
  ok(approved.searchParams.getAll("and").includes(`(sequence_id.in.(${id(11)}))`));
  ok(approved.searchParams.getAll("and").includes("(state.eq.draft)"));
  await rejects(() => write("video_sequence_revisions", "PATCH", {state:"published",published_at:"2026-10-08"}, {id:`eq.${id(21)}`}));

  const clip = {revision_id:id(21),position:1,is_preview:false,storage_path:`pending/${id(21)}/1`,caption:"Test clip",source_start_seconds:0,source_end_seconds:10,price_stars:100,requires_position:null};
  await write("video_sequence_parts", "POST", [clip]); checks++;
  await write("video_sequence_parts", "DELETE", {}, {revision_id:`eq.${id(21)}`}); checks++;
  await rejects(() => write("video_sequence_parts", "POST", [{...clip, revision_id:id(22)}]));
  await rejects(() => write("video_sequence_parts", "POST", [clip,{...clip,revision_id:id(22)}]));
  await rejects(() => write("video_sequence_parts", "POST", [{...clip, storage_path:`${id(2)}/private.mp4`}]));
  await rejects(() => write("video_sequence_parts", "POST", [{...clip,duration_seconds:10}]));
  await rejects(() => write("video_sequence_parts", "DELETE", {}, {revision_id:`eq.${id(23)}`}));
  await rejects(() => write("video_sequence_parts", "DELETE", {}));

  const job = {clone_id:id(1),revision_id:id(21),source_video_id:id(31),source_storage_path:`${id(1)}/source.mp4`,cut_points:[{position:1,start:0,end:10}],approved_by:"Owner",approved_at:"2026-10-08"};
  await write("video_sequence_jobs", "POST", job); checks++;
  await rejects(() => write("video_sequence_jobs", "POST", {...job, source_video_id:id(32)}));
  await rejects(() => write("video_sequence_jobs", "POST", {...job, source_storage_path:`${id(2)}/private.mp4`}));
  await rejects(() => write("video_sequence_jobs", "POST", {...job, revision_id:id(22)}));
  await rejects(() => write("video_sequence_jobs", "POST", {...job, status:"succeeded"}));
  const sessionPatch = {status:"paused",pause_reason:"Test",updated_at:"2026-10-08",lock_version:3};
  const sessionFilter = {clone_id:`eq.${id(1)}`,user_id:`eq.${id(41)}`};
  const session = await write("video_sequence_sessions", "PATCH", sessionPatch, sessionFilter);
  ok(session.searchParams.getAll("and").includes(`(user_id.in.(${id(41)}))`));
  ok(session.searchParams.getAll("and").includes("(lock_version.eq.2)"));
  await rejects(() => write("video_sequence_sessions", "PATCH", {...sessionPatch,revision_id:id(22)}, sessionFilter));
  await rejects(() => write("video_sequence_sessions", "PATCH", sessionPatch, {...sessionFilter,user_id:`eq.${id(42)}`}));
  await rejects(() => write("video_sequence_sessions", "PATCH", {...sessionPatch,lock_version:2}, sessionFilter));
  await rejects(() => write("video_sequence_entitlements", "PATCH", {revoked_at:null}));

  const familyRead = sequenceVideoSelection(url("videos", {select:"id,clone_id,content_family_id"}), agency);
  ok(familyRead.searchParams.get("and") === `(clone_id.in.(${id(1)}))`);
  await rejects(() => sequenceVideoSelection(url("videos", {select:"id,content_family_id,clones(bot_token)"}), agency));
  const family = await scopeSequenceVideoFamily(url("videos", {id:`eq.${id(33)}`}), {content_family_id:id(73)}, agency, db);
  ok(family.searchParams.getAll("and").includes("(content_family_id.is.null)"));
  await rejects(() => scopeSequenceVideoFamily(url("videos", {id:`eq.${id(31)}`}), {content_family_id:id(73)}, agency, db));
  await rejects(() => scopeSequenceVideoFamily(url("videos", {id:`eq.${id(32)}`}), {content_family_id:id(73)}, agency, db));
  await rejects(() => scopeSequenceVideoFamily(url("videos", {id:`eq.${id(33)}`}), {content_family_id:id(73),clone_id:id(2)}, agency, db));
  console.log(`Agency sequence access: ${checks} checks passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
