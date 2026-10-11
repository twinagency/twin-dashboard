/**
 * Checks for the catalogue repair batch (lib/media-repair.ts) against the ISOLATED local rig only:
 * throwaway Postgres + PostgREST in docker (scripts/media-repair-db/rig.sh up). Nothing here can reach Supabase, OpenRouter or Telegram:
 * the analyser is a fake, storage is an in-memory map, and blank creds are used (this file never imports config or the live client).
 *
 *   bash scripts/media-repair-db/rig.sh up && tsx --tsconfig scripts/tsconfig.json scripts/check-media-repair-db.ts; bash scripts/media-repair-db/rig.sh down
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  runRepair, rollbackRun, buildInventory, formatInventory, fakeAnalyser, fakeFacts, assertWritable, assertSafeSupabaseUrl, readOnlyFetch,
  classify, captionContradictsFacts, type Analyser, type Ctx, type RunOpts,
} from "../lib/media-repair";
import { ANALYSIS_VERSION, type AnalysisResult } from "../lib/media-analysis-contract";

const REST = "http://127.0.0.1:55444";
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const h = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role: "service_role" })}`;
const KEY = `${h}.${createHmac("sha256", "media-repair-local-secret-0123456789abcdef0123").update(h).digest("base64url")}`;
const MIGRATION = path.resolve(__dirname, "../../twin-bot-wt-vision/db/migrations/20261012000000_media_analysis_state.sql");
const ROLLBACK = path.resolve(__dirname, "../../twin-bot-wt-vision/db/manual/ROLLBACK_20261012000000_media_analysis_state.sql");

function sql(text: string): string {
  return execFileSync("docker", ["exec", "-i", "media-repair-pg17", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-q"], { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
const rows = (q: string) => JSON.parse(sql(`select coalesce(json_agg(t), '[]') from (${q}) t`));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); checks++; };
const eq = (a: unknown, b: unknown, msg: string) => { assert.deepEqual(a, b, msg); checks++; };

// supabase-js appends /rest/v1; the bare PostgREST container serves from the root
const rigFetch = ((i: any, init?: RequestInit) => fetch(String(typeof i === "string" ? i : i.url ?? i).replace("/rest/v1/", "/"), init)) as typeof fetch;
const db = createClient(REST, KEY, { auth: { persistSession: false }, global: { fetch: rigFetch } });
const tmp = mkdtempSync(path.join(tmpdir(), "media-repair-"));
let runN = 0;
const bytesOf = (p: string) => Buffer.from(`bytes:${p}`);

function mkCtx(over: Partial<Ctx> = {}): Ctx {
  return {
    db, runId: `r${++runN}`, stateDir: path.join(tmp, `r${runN}`), log: () => {}, concurrency: 3, retries: 2, retryBaseMs: 1, costPhoto: 0.0015, costVideo: 0.003,
    download: async (p) => bytesOf(p), analyse: fakeAnalyser, ...over,
  };
}
const OPTS: RunOpts = { mode: "apply", scope: "all" };

// ── fixture: prod-shaped rows on top of the migrated schema ─────────────────────────────────────────────────
const A = "a0000000-0000-0000-0000-00000000000a", B = "b0000000-0000-0000-0000-00000000000b";
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
function seed() {
  sql(`truncate clones, user_received_media cascade;
insert into clones(id,slug,vision_model) values ('${A}','alpha','qwen/qwen3-vl-32b'),('${B}','beta','qwen/qwen2.5-vl-72b-instruct');
insert into photos(id,clone_id,storage_path,caption,star_value,is_free,telegram_file_id,tags,auto_desc,visual_description,explicitness,is_nude,nsfw) values
 ('${id(1)}','${A}','a/p1.jpg','mmm look at my nipples',900,false,'tg1','{topless,solo}','topless selfie','A woman in a bedroom. Nipples not visible.','explicit',true,true),
 ('${id(2)}','${A}','a/p2.jpg','so cute today',700,true,'tg2','{outdoor}','beach','A woman on a beach in a bikini.','suggestive',false,false),
 ('${id(3)}','${A}','a/p3.jpg',null,800,false,null,'{}',null,null,'none',false,false),
 ('${id(4)}','${A}','a/p4.jpg','hand fixed caption',800,false,'tg4','{custom}','hand fixed','hand fixed description. no nipples shown','none',false,false),
 ('${id(5)}','${B}','b/p5.jpg','b caption',500,false,'tg5','{x}','b desc','B description',  'none',false,false),
 ('${id(6)}','${A}','a/p6.jpg','done already',600,false,'tg6','{y}','six','six desc','none',false,false);
update photos set metadata_edited_at = now() where id='${id(4)}';
update photos set analysis_status='analysed', analysis_version=2 where id='${id(6)}';
insert into videos(id,clone_id,storage_path,caption,star_value,tags,auto_desc,visual_description,explicitness) values
 ('${id(11)}','${A}','a/v1.mp4','vid cap',1200,'{}',null,null,'none'),('${id(12)}','${B}','b/v2.mp4','vid2',1300,'{solo}','v2','V2 desc, pussy not visible.','suggestive');
insert into photo_bundles(id,clone_id,name,star_price) values ('${id(21)}','${A}','bundle a',2000),('${id(22)}','${B}','bundle b',2000);
insert into photo_bundle_items(id,bundle_id,storage_path,caption,auto_desc,tags,visual_description) values
 ('${id(31)}','${id(21)}','a/p1.jpg','mmm look at my nipples','topless selfie','{topless,solo}','A woman in a bedroom. Nipples not visible. (cut at 320'),
 ('${id(32)}','${id(22)}','a/p1.jpg','OTHER CLONE bundle same path','keep','{keep}','keep this'),
 ('${id(33)}','${id(21)}','a/other.jpg','x','x','{x}','x');
insert into user_received_media(id,media_id,media_type) values (gen_random_uuid(),'${id(1)}','photo');`);
}
const snap = (cols: string, t: string, order = "id") => rows(`select ${cols} from ${t} order by ${order}`);
const PROTECTED = "id,clone_id,storage_path,star_value,is_free,telegram_file_id,teaser_caption,created_at";
const allState = () => ({
  photos: snap("*", "photos"), videos: snap("*", "videos"), items: snap("*", "photo_bundle_items"), recv: snap("*", "user_received_media"),
});

async function main() {
  try { await fetch(REST, { signal: AbortSignal.timeout(2000) }); } catch { throw new Error("rig is not up: run `bash scripts/media-repair-db/rig.sh up` first"); }

  // ── 0. before the migration ────────────────────────────────────────────────────────────────────────────
  // fixture.sql is the existing shape; start from it even if an earlier run left the migration applied.
  sql(readFileSync(ROLLBACK, "utf8"));
  sql(`truncate clones cascade; insert into clones(id,slug,vision_model) values ('${A}','alpha','qwen/qwen3-vl-32b');
       insert into photos(id,clone_id,storage_path,caption,star_value,tags,visual_description) values ('${id(1)}','${A}','a/p1.jpg','c',900,'{x}','Nipples not visible.');`);
  await wait(500);
  const preBefore = snap("*", "photos");
  const preInv = await buildInventory(mkCtx());
  eq(preInv.migrated, false, "pre-migration: inventory reports schema not migrated");
  eq(preInv.totals.photos.legacy, 1, "pre-migration: every row reads as legacy");
  ok(formatInventory(preInv, 0.0015, 0.003).includes("NO - every row"), "pre-migration: inventory text warns");
  const preSum = await runRepair(mkCtx(), { ...OPTS, mode: "preview" });
  eq([preSum.migrated, preSum.proposed], [false, 1], "pre-migration: preview still works");
  const pv = readFileSync(path.join(tmp, `r${runN}`, "preview.jsonl"), "utf8");
  ok(JSON.parse(pv.trim()).premigration === true, "pre-migration: proposal flagged premigration");
  await assert.rejects(() => runRepair(mkCtx(), OPTS), /migration 20261012000000 .* not applied/);
  checks++;
  eq(snap("*", "photos"), preBefore, "pre-migration: apply refused, nothing written");

  // ── 1. migration: apply, re-apply, constraint, rollback, re-apply ──────────────────────────────────────
  sql(readFileSync(MIGRATION, "utf8"));
  sql(readFileSync(MIGRATION, "utf8"));
  const colCount = () => Number(sql(`select count(*) from information_schema.columns where table_schema='public' and table_name in ('photos','videos') and column_name in ('analysis_status','analysis_version','analysis_model','analysis_provider','analysis_error','analysed_at','visual_facts','metadata_edited_at')`));
  eq(colCount(), 16, "migration: 8 columns on each table, idempotent on re-apply");
  eq(sql(`select analysis_status from photos limit 1`), "legacy", "migration: existing rows default to legacy");
  eq(sql(`select tags from photos limit 1`), "{x}", "migration: existing content untouched");
  assert.throws(() => sql(`update photos set analysis_status='bogus'`)); checks++;
  sql(readFileSync(ROLLBACK, "utf8"));
  eq(colCount(), 0, "rollback sql: drops every added column");
  eq(sql(`select tags||star_value::text from photos limit 1`), "{x,900}", "rollback sql: catalogue content intact");
  sql(readFileSync(ROLLBACK, "utf8"));
  sql(readFileSync(MIGRATION, "utf8"));
  eq(colCount(), 16, "migration: re-applies after rollback");
  await wait(800);

  // ── 2. inventory ────────────────────────────────────────────────────────────────────────────────────────
  seed(); await wait(300);
  const inv = await buildInventory(mkCtx());
  eq(inv.migrated, true, "inventory: migrated");
  eq([inv.totals.photos.total, inv.totals.videos.total], [6, 2], "inventory: totals");
  eq([inv.totals.photos.legacy, inv.totals.photos.analysed], [5, 1], "inventory: status counts");
  eq(inv.totals.photos.protectedManual, 1, "inventory: manual-edit counted");
  eq(inv.totals.photos.unanalysed, 1, "inventory: unanalysed photo (p3)");
  eq(inv.totals.photos.negated, 2, "inventory: negated descriptions (p1, p4)");
  eq(inv.totals.videos.negated, 1, "inventory: negated video description");
  eq(inv.totals.photos.eligible, 4, "inventory: eligible photos = legacy and not manually edited");
  const txt = formatInventory(inv, 0.0015, 0.003);
  ok(/scope all\s*: 4 photos \+ 2 videos = \$0\.01/.test(txt), "inventory: cost estimate line");
  ok(classify({ tags: [], explicitness: "none", is_nude: false, auto_desc: "", visual_description: null, analysis_status: "legacy", metadata_edited_at: null } as any).failedLooking, "classify: failed-looking = what a failed call used to save");

  // ── 3. preview writes nothing ───────────────────────────────────────────────────────────────────────────
  const before = allState();
  const pc = mkCtx();
  const ps = await runRepair(pc, { ...OPTS, mode: "preview" });
  eq(allState(), before, "preview: database byte-identical after");
  eq(ps.proposed, 6, "preview: 4 photos + 2 videos proposed");
  const prev = readFileSync(path.join(pc.stateDir, "preview.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  eq(prev.length, 6, "preview: JSONL line per row");
  ok(prev.every((p) => !("star_value" in p.after) && !("is_free" in p.after) && !("storage_path" in p.after)), "preview: proposals never carry protected fields");
  ok(!prev.some((p) => p.id === id(4) || p.id === id(6)), "preview: manual-edited and already-analysed rows not selected");
  const ro = createClient(REST, KEY, { auth: { persistSession: false }, global: { fetch: readOnlyFetch(rigFetch) } });
  const roWrite = await ro.from("photos").update({ tags: ["z"] }).eq("id", id(1)).then(() => "ran", (e) => String(e));
  ok(String(roWrite).includes("read-only") || (await ro.from("photos").update({ tags: ["z"] }).eq("id", id(1))).error != null, "preview: read-only client cannot write");
  eq(sql(`select tags from photos where id='${id(1)}'`), "{topless,solo}", "preview: read-only client left the row alone");
  // no-resume re-run of preview in the same run skips what it already proposed
  const ps2 = await runRepair(pc, { ...OPTS, mode: "preview" });
  eq([ps2.selected, ps2.skippedDone], [0, 6], "preview: resumable, nothing redone");

  // ── 4. apply ────────────────────────────────────────────────────────────────────────────────────────────
  const calls: string[] = [];
  const counting: Analyser = async (t, b, m) => { calls.push(`${t}:${b}`); return fakeAnalyser(t, b, m); };
  const ac = mkCtx({ analyse: counting });
  const prot0 = { p: snap(PROTECTED, "photos"), v: snap(PROTECTED, "videos"), r: snap("*", "user_received_media") };
  const as = await runRepair(ac, OPTS);
  eq([as.applied, as.conflicts, as.failed], [6, 0, 0], "apply: all six eligible rows applied");
  eq(calls.length, 6, "apply: one analysis call per row");
  eq({ p: snap(PROTECTED, "photos"), v: snap(PROTECTED, "videos"), r: snap("*", "user_received_media") }, prot0, "apply: star_value/is_free/storage_path/clone_id/telegram_file_id/created_at and purchases untouched");
  const p1 = rows(`select * from photos where id='${id(1)}'`)[0];
  eq([p1.analysis_status, p1.analysis_version, p1.analysis_model, p1.analysis_provider, p1.analysis_error], ["analysed", ANALYSIS_VERSION, "qwen/qwen3-vl-32b", "fake", null], "apply: stamped status/version/model/provider (model as reported by the analyser)");
  ok(p1.analysed_at, "apply: analysed_at set");
  eq(p1.tags, ["solo"], "apply: stale topless tag replaced by the facts");
  eq([p1.is_nude, p1.explicitness], [false, "suggestive"], "apply: flags corrected together");
  eq(p1.visual_facts.evidence.nipples, "no", "apply: visual_facts stored");
  eq(p1.caption, "fake caption", "apply: caption that contradicts the facts (nipples vs evidence no) replaced");
  eq(sql(`select caption from photos where id='${id(2)}'`), "so cute today", "apply: harmless caption kept");
  eq(sql(`select caption from photos where id='${id(3)}'`), "", "apply: null caption stays null");
  eq(sql(`select visual_description||tags::text from photos where id='${id(4)}'`), "hand fixed description. no nipples shown{custom}", "apply: manually edited row untouched");
  eq(sql(`select analysis_status from photos where id in ('${id(4)}','${id(6)}') order by id`).split("\n"), ["legacy", "analysed"], "apply: protected/already-analysed rows keep their status");
  eq(sql(`select analysis_status, array_length(tags,1) from videos where id='${id(11)}'`), "analysed|1", "apply: video row repaired");
  const bk = readFileSync(path.join(ac.stateDir, "backup.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  eq(bk.filter((b) => b.kind === "row").length, 6, "apply: a backup line per row");
  ok(bk.every((b) => !("star_value" in b.after)), "apply: backup carries no protected field");
  // bundle items
  const it31 = rows(`select * from photo_bundle_items where id='${id(31)}'`)[0];
  eq([it31.tags, it31.caption, it31.auto_desc], [["solo"], "fake caption", "fake photos 17b".replace("17b", String(bytesOf("a/p1.jpg").length) + "b")], "bundle item: same storage_path + clone gets the corrected values");
  ok(it31.visual_description.includes("white bikini top"), "bundle item: truncated description replaced");
  eq(sql(`select tags::text||visual_description from photo_bundle_items where id='${id(32)}'`), "{keep}keep this", "bundle item: same path in ANOTHER clone untouched");
  eq(sql(`select tags from photo_bundle_items where id='${id(33)}'`), "{x}", "bundle item: different path untouched");
  const again = await runRepair(ac, OPTS);
  eq([again.selected, again.skippedDone], [0, 0], "apply: second pass finds nothing eligible (rows now analysed)");

  // ── 5. rollback ─────────────────────────────────────────────────────────────────────────────────────────
  // a person edits p2 after the apply (sets the stamp, as the dashboard does)
  sql(`update photos set tags='{hand,edit}', metadata_edited_at=now() where id='${id(2)}'`);
  // and p3's tags change without a stamp (another process): also must not be rolled back
  sql(`update photos set tags='{other}' where id='${id(3)}'`);
  const rb = await rollbackRun(ac);
  eq(rb.errors, [], "rollback: no errors");
  eq([rb.restored, rb.changedSince], [4 + 2 - 2, 2], "rollback: 4 rows restored (p1, p5, v11, v12), 2 changed since apply left alone");
  eq(rb.itemsRestored, 1, "rollback: bundle item restored");
  eq(sql(`select tags from photos where id='${id(2)}'`), "{hand,edit}", "rollback: row edited after apply NOT rolled back");
  eq(sql(`select tags from photos where id='${id(3)}'`), "{other}", "rollback: concurrently changed row NOT rolled back");
  const r1 = rows(`select * from photos where id='${id(1)}'`)[0];
  eq([r1.tags, r1.caption, r1.analysis_status, r1.visual_facts, r1.analysis_model, r1.is_nude], [["topless", "solo"], "mmm look at my nipples", "legacy", null, null, true], "rollback: restored to the exact old values incl. status stamp");
  eq(sql(`select tags::text||visual_description from photo_bundle_items where id='${id(31)}'`), "{topless,solo}A woman in a bedroom. Nipples not visible. (cut at 320", "rollback: item restored");
  const rb2 = await rollbackRun(ac);
  eq([rb2.restored, rb2.alreadyRestored], [0, 5], "rollback: second run is a no-op (4 rows + 1 item already restored)");

  // ── 6. interrupted batch + resume ───────────────────────────────────────────────────────────────────────
  seed(); await wait(100);
  const calls2: string[] = [];
  const cnt2: Analyser = async (t, b, m) => { calls2.push(String(b)); return fakeAnalyser(t, b, m); };
  const ic = mkCtx({ analyse: cnt2, concurrency: 1, afterRow: (n) => { if (n === 3) throw new Error("CRASH"); } });
  await assert.rejects(() => runRepair(ic, OPTS), /CRASH/); checks++;
  const doneAfterCrash = Number(sql(`select count(*) from photos where analysis_status='analysed'`)) - 1 + Number(sql(`select count(*) from videos where analysis_status='analysed'`));
  eq(doneAfterCrash, 3, "interrupt: exactly 3 rows were applied before the crash");
  const resumed = await runRepair({ ...ic, afterRow: undefined }, OPTS);
  eq([resumed.selected, resumed.applied], [3, 3], "resume: the 3 applied rows are no longer eligible, the other 3 are applied");
  eq(calls2.length, 6, "resume: no row was analysed (paid for) twice");
  eq(Number(sql(`select count(*) from photos where analysis_status='legacy' and metadata_edited_at is null`)) + Number(sql(`select count(*) from videos where analysis_status='legacy'`)), 0, "resume: nothing left legacy");

  // crash between the photo write and the bundle-item copy: resume finishes the copy
  seed(); await wait(100);
  sql(`create or replace function pg_temp.noop() returns void language sql as 'select 1';
       create function public.block_items() returns trigger language plpgsql as $$ begin raise exception 'items blocked'; end $$;
       create trigger block_items before update on public.photo_bundle_items for each row execute function public.block_items();`);
  const bc = mkCtx({ concurrency: 1 });
  await assert.rejects(() => runRepair(bc, { ...OPTS, table: "photos" }), /items blocked/); checks++;
  eq(sql(`select analysis_status from photos where id='${id(1)}'`), "analysed", "item crash: photo already written");
  eq(sql(`select tags from photo_bundle_items where id='${id(31)}'`), "{topless,solo}", "item crash: item not copied yet");
  sql(`drop trigger block_items on public.photo_bundle_items; drop function public.block_items();`);
  await runRepair(bc, { ...OPTS, table: "photos" });
  eq(sql(`select tags from photo_bundle_items where id='${id(31)}'`), "{solo}", "item crash: resume completes the bundle-item copy");

  // ── 7. concurrent edit between read and write ───────────────────────────────────────────────────────────
  seed(); await wait(100);
  const racing: Analyser = async (t, b, m) => {
    if (String(b).includes("a/p2.jpg")) sql(`update photos set tags='{edited,mid,run}' where id='${id(2)}'`); // a person saves while the model thinks
    if (String(b).includes("a/p3.jpg")) sql(`update photos set metadata_edited_at=now(), caption='new hand caption' where id='${id(3)}'`);
    return fakeAnalyser(t, b, m);
  };
  const cc = mkCtx({ analyse: racing });
  const cs = await runRepair(cc, { ...OPTS, table: "photos" });
  eq(cs.conflicts, 2, "concurrent edit: 2 rows changed after being read are skipped as conflicts");
  eq(sql(`select tags from photos where id='${id(2)}'`), "{edited,mid,run}", "concurrent edit: the person's tags survive");
  eq(sql(`select caption||analysis_status from photos where id='${id(3)}'`), "new hand captionlegacy", "concurrent edit: metadata_edited_at set mid-run blocks the write");
  eq(sql(`select tags from photo_bundle_items where id='${id(31)}'`), "{solo}", "concurrent edit: the other rows still repaired");

  // ── 8. failed / transient / invalid / needs_review analyses never write ─────────────────────────────────
  seed(); await wait(100);
  let transientLeft = 1; const tries: Record<string, number> = {};
  const flaky: Analyser = async (t, b, m) => {
    const p = String(b); tries[p] = (tries[p] ?? 0) + 1;
    const res = (over: Partial<AnalysisResult>): AnalysisResult => ({ status: "failed", model: "m", provider: null, latencyMs: 1, costUsd: null, version: ANALYSIS_VERSION, ...over });
    if (p.includes("a/p1")) return res({ error: "OpenRouter 402: no credits" });
    if (p.includes("a/p2")) { if (transientLeft-- > 0) return res({ error: "OpenRouter 429: rate limited" }); return fakeAnalyser(t, b, m); }
    if (p.includes("a/p3")) throw new Error("socket exploded");
    if (p.includes("b/p5")) { const r = await fakeAnalyser(t, b, m); return { ...r, fields: { ...r.fields!, explicitness: "wild" as any } }; }
    if (p.includes("a/v1")) { const r = await fakeAnalyser(t, b, m); return { ...r, status: "needs_review", error: "claims contradict" }; }
    return fakeAnalyser(t, b, m);
  };
  const before8 = snap("*", "photos").filter((r: any) => [id(1), id(3), id(5)].includes(r.id));
  const fc = mkCtx({ analyse: flaky });
  const fs8 = await runRepair(fc, OPTS);
  eq([fs8.failed, fs8.needsReview, fs8.applied], [3, 1, 2], "failures: 3 failed (402, thrown, invalid), 1 needs_review, rest applied");
  eq(tries["bytes:a/p1.jpg"], 1, "failures: a non-transient error is not retried");
  eq(tries["bytes:a/p2.jpg"], 2, "failures: a transient 429 is retried and then succeeds");
  eq(snap("*", "photos").filter((r: any) => [id(1), id(3), id(5)].includes(r.id)), before8, "failures: failed rows keep every old value and status (no blank 'clean' row)");
  eq(sql(`select analysis_status from videos where id='${id(11)}'`), "legacy", "failures: needs_review leaves the row alone");
  const failed = readFileSync(path.join(fc.stateDir, "failed.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  eq(failed.length, 4, "failures: failure report has an entry per failed/review row");
  ok(readFileSync(path.join(fc.stateDir, "report.txt"), "utf8").includes("FAILURES"), "failures: report.txt lists them");
  const retry = await runRepair({ ...fc, analyse: fakeAnalyser }, OPTS);
  eq([retry.applied, retry.skippedDone], [3, 1], "resume: failed rows are retried (needs_review is not), others skipped");

  // ── 9. guards and limits ────────────────────────────────────────────────────────────────────────────────
  assert.throws(() => assertWritable(["star_value"])); assert.throws(() => assertWritable(["is_free"])); assert.throws(() => assertWritable(["storage_path"]));
  assert.throws(() => assertWritable(["clone_id"])); assert.throws(() => assertWritable(["telegram_file_id"])); assert.throws(() => assertWritable(["tags"], ["caption"]));
  checks += 6;
  assert.doesNotThrow(() => assertWritable(["tags", "visual_facts", "analysis_status"])); checks++;
  eq(assertSafeSupabaseUrl("http://127.0.0.1:55444"), "http://127.0.0.1:55444", "url guard: loopback allowed");
  ok(assertSafeSupabaseUrl("https://aouaenqayfltoqrmpitg.supabase.co"), "url guard: approved project allowed");
  assert.throws(() => assertSafeSupabaseUrl("https://example.supabase.co")); assert.throws(() => assertSafeSupabaseUrl("https://aouaenqayfltoqrmpitg.evil.com.attacker.io/x")); assert.throws(() => assertSafeSupabaseUrl(undefined));
  checks += 3;
  ok(captionContradictsFacts("show you my pussy", fakeFacts()) && !captionContradictsFacts("show you my pussy", fakeFacts({ genitals: "unclear" })) && !captionContradictsFacts("hi there", fakeFacts()), "caption rule: only an explicit 'no' contradicts");

  seed(); await wait(100);
  let inflight = 0, peak = 0;
  const slow: Analyser = async (t, b, m) => { inflight++; peak = Math.max(peak, inflight); await wait(15); inflight--; return fakeAnalyser(t, b, m); };
  await runRepair(mkCtx({ analyse: slow, concurrency: 50 }), { ...OPTS, mode: "preview" });
  ok(peak <= 8 && peak > 1, `concurrency cap: requested 50, peak in flight ${peak} (cap 8)`);
  const lim = await runRepair(mkCtx(), { ...OPTS, mode: "preview", limit: 2, spread: true });
  eq(lim.selected, 2, "limit: --limit honoured");
  const prob = await runRepair(mkCtx(), { ...OPTS, mode: "preview", scope: "problem" });
  eq(prob.selected, 4, "scope problem: only p1 (negated), p3 (blank), v11 (blank), v12 (negated); clean legacy rows p2, p5 skipped");

  // ── 10. long/awkward values survive the guarded UPDATE URL ──────────────────────────────────────────────
  seed(); await wait(100);
  const longDesc = ("Awkward \"quoted\", comma; {brace} value with unicode é and 100% sure. ").repeat(14);
  sql(`update photos set visual_description=$q$${longDesc}$q$, tags='{"a,b","c d","e\\"f",g}', caption=$q$it's "x", y$q$ where id='${id(2)}'`);
  const wide = await runRepair(mkCtx(), { ...OPTS, table: "photos" });
  eq([wide.applied, wide.conflicts], [4, 0], `guard URL: long/quoted values (${longDesc.length} chars, tags with commas and quotes) still match and apply`);
  // second apply of different facts: jsonb old-value guard (visual_facts non-null now)
  sql(`update photos set analysis_status='failed' where id='${id(2)}'`);
  const rerun = await runRepair(mkCtx({ analyse: async (t, b, m) => { const r = await fakeAnalyser(t, b, m); return { ...r, fields: { ...r.fields!, visual_facts: fakeFacts({ nipples: "yes" }, ["x"]) , tags: ["nipples"] } }; } }), { ...OPTS, table: "photos" });
  eq([rerun.applied, rerun.conflicts], [1, 0], "guard: jsonb visual_facts old-value filter matches on a re-analysis");
  eq(JSON.parse(sql(`select visual_facts from photos where id='${id(2)}'`)).evidence.nipples, "yes", "guard: new facts written over the old ones");

  rmSync(tmp, { recursive: true, force: true });
  console.log(`media repair db checks: ${checks} passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
