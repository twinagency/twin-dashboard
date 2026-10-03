import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { configureFlirtOfflineEnv } from "./flirt-offline-env";
import { identity, ID } from "../deployment/flirt-live-twin.cjs";
import { withDashboardAccess } from "../lib/dashboard-access";
import {
  buildClonePacket, buildTwinCloneRow, flirtClonePipelineEnabled, parseDateOfBirth, CloneBuildRefusal,
  PLACEHOLDER_TOKEN_PREFIX, type BuildInput,
} from "../lib/flirt-clone-build";
import { runCloneBuild, type CloneBuildStore, type CreatorRecord } from "../lib/flirt-clone-pipeline";
import { guardedTwinFetch, type TwinCloneWriter } from "../lib/flirt-twin-writer";
import { flirtOperatorAgencyPath } from "../lib/flirt-onboarding-policy";
import { agencyRequestAllowed } from "../lib/agency-policy";
import { POST as buildRoute } from "../app/agency/creators/build-clone/route";
import { POST as reviewRoute } from "../app/agency/creators/review/route";
import { GET as packetRoute } from "../app/agency/creators/build-packet/route";

const NOW = new Date("2026-10-03T00:00:00Z");
const ACCOUNT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ON = { FLIRT_CLONE_PIPELINE_ENABLED: "true", FLIRT_BACKEND_ENABLED: "true", FLIRT_SUPABASE_PROJECT_REF: "lkmfwpqegjluirfusnaw", FLIRT_LIVE_TWIN_ENABLED: "true" };

function input(over: Partial<BuildInput> = {}): BuildInput {
  return {
    account: { id: ACCOUNT, display_name: "Jane D", account_status: "approved" },
    application: { status: "approved", answers: {
      full_name: "Jane Doe", preferred_name: "Janey", stage_name: "Jane Fox", date_of_birth: "04/15/1999",
      phone_number: "+61 400 000 000", email_address: "jane@example.com", social_links: "ig.com/jane",
      height: "170cm", ethnicity: "Irish", currently_live: "Sydney",
      reply_today: "heyy just got home, you?", reply_missed: "aww i missed u too", texting_style: "lowercase, lots of emojis", top_emojis: "😘🔥",
      catch_phrases: "babe, obsessed", overall_tone: "Playful", boundaries: "no meetups", topics_avoid_ai: "my family",
      fav_colour: "pink", pets: "a cat called Mango", anything_else: "I love hiking",
    } },
    consent: { legal_name: "Jane Doe", consent_version: "v1", signed_at: "2026-10-01T00:00:00Z" },
    files: [
      { id: "f1", kind: "content_sfw_image", bucket: "onboarding-content", storage_path: "a/1.jpg", original_name: "1.jpg", mime_type: "image/jpeg", size_bytes: 10, storage_transfer_status: "verified" },
      { id: "f2", kind: "content_sfw_image", bucket: "onboarding-content", storage_path: "a/2.jpg", original_name: "2.jpg", mime_type: "image/jpeg", size_bytes: 10, storage_transfer_status: "pending" },
    ],
    now: NOW, ...over,
  };
}
const refusal = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: unknown) => e instanceof CloneBuildRefusal && e.code === code, `expected refusal ${code}`);

function pureChecks() {
  // flag
  assert.equal(flirtClonePipelineEnabled({}), false, "defaults OFF");
  assert.equal(flirtClonePipelineEnabled({ ...ON, FLIRT_CLONE_PIPELINE_ENABLED: "1" }), false);
  assert.equal(flirtClonePipelineEnabled({ ...ON, FLIRT_LIVE_TWIN_ENABLED: "false" }), false);
  assert.equal(flirtClonePipelineEnabled({ ...ON, FLIRT_SUPABASE_PROJECT_REF: "aouaenqayfltoqrmpitg" }), false);
  assert.equal(flirtClonePipelineEnabled(ON), true);
  // dob
  assert.equal(parseDateOfBirth("04 / 15 / 1999"), "1999-04-15");
  assert.equal(parseDateOfBirth("1999-04-15"), "1999-04-15");
  assert.equal(parseDateOfBirth("02/30/1999"), null);
  assert.equal(parseDateOfBirth("soon"), null);

  // happy path: the exact Twin payload
  const packet = buildClonePacket(input());
  assert.equal(packet.name, "Jane Fox");
  assert.deepEqual(packet.facts, { date_of_birth: "1999-04-15", stage_name: "Jane Fox", real_name: "Jane Doe", height: "170cm", ethnicity: "Irish", current_city: "Sydney", hard_limits_extra: "no meetups\nmy family" });
  assert.match(packet.fields.example_texts, /heyy just got home/);
  assert.match(packet.fields.quirks, /babe, obsessed/);
  assert.match(packet.fields.life_tastes, /Mango/);
  assert.match(packet.fields.notes, /hiking/);
  assert.deepEqual(packet.files.map((f) => f.id), ["f1"], "only verified uploads are handed over");
  const row = buildTwinCloneRow(packet, "jane-fox");
  assert.equal(row.status, "paused", "never created active");
  assert.equal(row.bot_token, PLACEHOLDER_TOKEN_PREFIX + ACCOUNT, "placeholder token, never a real one");
  assert.equal(row.slug, "jane-fox"); assert.equal(row.name, "Jane Fox");
  assert.equal((row.drip_steps as unknown[]).length, 4);
  assert.deepEqual(Object.keys(row.intake as object).sort(), ["answers", "fields", "flirt_creator_account_id"]);
  assert.equal((row.intake as any).flirt_creator_account_id, ACCOUNT);
  const serialised = JSON.stringify(row);
  for (const secret of ["+61 400", "jane@example.com", "ig.com/jane"]) assert.ok(!serialised.includes(secret), `contact detail leaked: ${secret}`);

  // refusals
  refusal(() => buildClonePacket(input({ consent: null })), "no_consent");
  refusal(() => buildClonePacket(input({ consent: { legal_name: "  ", consent_version: "v1", signed_at: "2026-10-01" } })), "no_consent");
  refusal(() => buildClonePacket(input({ account: { id: ACCOUNT, display_name: "J", account_status: "applicant" } })), "not_approved");
  refusal(() => buildClonePacket(input({ application: { status: "submitted", answers: { date_of_birth: "04/15/1999" } } })), "not_approved");
  refusal(() => buildClonePacket(input({ application: { status: "approved", answers: {} } })), "no_answers");
  refusal(() => buildClonePacket(input({ application: { status: "approved", answers: { stage_name: "X" } } })), "dob_missing");
  refusal(() => buildClonePacket(input({ application: { status: "approved", answers: { stage_name: "X", date_of_birth: "never" } } })), "dob_invalid");
  refusal(() => buildClonePacket(input({ application: { status: "approved", answers: { stage_name: "X", date_of_birth: "10/04/2008" } } })), "under_age");
  // 18th birthday is tomorrow: still under age. Today: allowed.
  refusal(() => buildClonePacket(input({ application: { status: "approved", answers: { stage_name: "X", date_of_birth: "10/04/2008" } } })), "under_age");
  assert.ok(buildClonePacket(input({ application: { status: "approved", answers: { stage_name: "X", date_of_birth: "10/03/2008" } } })));
  refusal(() => buildClonePacket(input({ account: { id: ACCOUNT, display_name: null, account_status: "approved" }, application: { status: "approved", answers: { date_of_birth: "04/15/1999" } } })), "no_name");
}

function fakes(record: CreatorRecord | null, opts: { existing?: boolean; taken?: string[]; race?: boolean; linkFails?: boolean } = {}) {
  const calls = { load: 0, saveLink: [] as string[], find: 0, insert: [] as Record<string, unknown>[], factories: 0 };
  const store: CloneBuildStore = {
    async load() { calls.load++; return record; },
    async saveLink(_id, slug) { if (opts.linkFails) throw new Error("db down"); calls.saveLink.push(slug); },
  };
  let inserted: { id: string; slug: string } | null = opts.existing ? { id: "t0", slug: "already-there" } : null;
  const writer: TwinCloneWriter = {
    async findByCreator() { calls.find++; return inserted; },
    async slugTaken(slug) { return (opts.taken ?? []).includes(slug); },
    async insert(row) {
      calls.insert.push(row);
      if (opts.race) { inserted = { id: "t9", slug: "raced" }; const e: Error & { code?: string } = new Error("dup"); e.code = "23505"; throw e; }
      inserted = { id: "t1", slug: String(row.slug) }; return inserted;
    },
  };
  return { calls, deps: { env: ON, now: NOW, store: () => { calls.factories++; return store; }, writer: () => { calls.factories++; return writer; } } };
}
const record = (over: Partial<BuildInput> = {}, link: CreatorRecord["link"] = null): CreatorRecord => { const { now: _n, ...rest } = input(over); return { input: rest, link }; };

async function orchestratorChecks() {
  // FLAG OFF = no-op: no factory, no read, no write, no network.
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("flag off must not touch the network"); };
  try {
    const off = fakes(record());
    assert.deepEqual(await runCloneBuild(ACCOUNT, { ...off.deps, env: {} }), { kind: "disabled" });
    assert.deepEqual(await runCloneBuild(ACCOUNT, { ...off.deps, env: { ...ON, FLIRT_CLONE_PIPELINE_ENABLED: "false" } }), { kind: "disabled" });
    assert.equal(off.calls.factories, 0); assert.equal(off.calls.load, 0); assert.equal(off.calls.insert.length, 0);
  } finally { globalThis.fetch = original; }

  // creates the expected payload
  const ok = fakes(record());
  const built = await runCloneBuild(ACCOUNT, ok.deps);
  assert.equal(built.kind, "built"); assert.equal((built as any).slug, "jane-fox");
  assert.equal(ok.calls.insert.length, 1);
  assert.equal(ok.calls.insert[0].status, "paused");
  assert.equal(ok.calls.insert[0].bot_token, PLACEHOLDER_TOKEN_PREFIX + ACCOUNT);
  assert.deepEqual(ok.calls.saveLink, ["jane-fox"]);

  // CONSENT REQUIRED: refused before Twin is even constructed
  const noConsent = fakes(record({ consent: null }));
  const refused = await runCloneBuild(ACCOUNT, noConsent.deps);
  assert.deepEqual([refused.kind, (refused as any).code], ["refused", "no_consent"]);
  assert.equal(noConsent.calls.insert.length, 0); assert.equal(noConsent.calls.find, 0);
  assert.equal(noConsent.calls.factories, 1, "only the FLIRT store was constructed, never the Twin writer");

  // not approved
  assert.equal(((await runCloneBuild(ACCOUNT, fakes(record({ account: { id: ACCOUNT, display_name: "J", account_status: "applicant" } })).deps)) as any).code, "not_approved");
  // unknown creator
  assert.equal(((await runCloneBuild(ACCOUNT, fakes(null).deps)) as any).code, "unknown_creator");
  // already linked: nothing written
  const linked = fakes(record({}, { twin_slug: "jane-fox" }));
  assert.deepEqual(await runCloneBuild(ACCOUNT, linked.deps), { kind: "already_linked", slug: "jane-fox" });
  assert.equal(linked.calls.insert.length, 0);
  // clone already in Twin from a half-finished run: reuse, no second insert
  const reuse = fakes(record(), { existing: true });
  const reused = await runCloneBuild(ACCOUNT, reuse.deps);
  assert.deepEqual([reused.kind, (reused as any).reused, (reused as any).slug], ["built", true, "already-there"]);
  assert.equal(reuse.calls.insert.length, 0); assert.deepEqual(reuse.calls.saveLink, ["already-there"]);
  // slug taken by another girl: suffix with the account id, never overwrite
  const taken = fakes(record(), { taken: ["jane-fox"] });
  assert.equal(((await runCloneBuild(ACCOUNT, taken.deps)) as any).slug, "jane-fox-aaaaaa");
  // double click race
  const race = fakes(record(), { race: true });
  const raced = await runCloneBuild(ACCOUNT, race.deps);
  assert.deepEqual([raced.kind, (raced as any).slug], ["built", "raced"]);
  // link save failure is reported and recoverable
  const lf = await runCloneBuild(ACCOUNT, fakes(record(), { linkFails: true }).deps);
  assert.equal(lf.kind, "error"); assert.match((lf as any).message, /Build clone again/);
}

async function guardChecks() {
  const twin = "https://aouaenqayfltoqrmpitg.supabase.co";
  const seen: string[] = [];
  const guard = guardedTwinFetch(twin, (async (input: any, init: any) => { seen.push(`${init?.method || "GET"} ${new URL(String(input)).pathname}`); return new Response("[]"); }) as typeof fetch);
  const row = (o: object) => JSON.stringify({ status: "paused", bot_token: PLACEHOLDER_TOKEN_PREFIX + "x", ...o });
  await guard(`${twin}/rest/v1/clones?select=id&slug=eq.a`);
  await guard(`${twin}/rest/v1/clones?select=id,slug&intake-%3E%3Eflirt_creator_account_id=eq.a`.replace("intake-%3E%3E", "intake->>"), { method: "GET" });
  await guard(`${twin}/rest/v1/clones?select=id,slug`, { method: "POST", body: row({}) });
  assert.equal(seen.length, 3);
  const denied: [string, RequestInit?][] = [
    [`${twin}/rest/v1/clones?select=*`],                                             // unfiltered read
    [`${twin}/rest/v1/clones?select=bot_token&status=eq.active`],                    // other filter
    [`${twin}/rest/v1/users?select=id&slug=eq.a`],                                   // other table
    [`${twin}/rest/v1/clones?id=eq.1`, { method: "PATCH", body: row({}) }],
    [`${twin}/rest/v1/clones?id=eq.1`, { method: "DELETE" }],
    [`${twin}/rest/v1/clones`, { method: "POST", body: row({ status: "active" }) }], // never active
    [`${twin}/rest/v1/clones`, { method: "POST", body: JSON.stringify({ status: "paused", bot_token: "123:REAL" }) }],
    [`${twin}/rest/v1/clones`, { method: "POST", body: `[${row({})},${row({})}]` }], // bulk
    [`${twin}/rest/v1/clones`, { method: "POST", body: "not json" }],
    [`${twin}/rest/v1/rpc/anything`, { method: "POST", body: row({}) }],
    [`${twin}/storage/v1/object/media/x`, { method: "POST", body: "x" }],
    [`https://cnnsllgzskqkvdovyiiv.supabase.co/rest/v1/clones?slug=eq.a`],           // other project
  ];
  for (const [url, init] of denied) await assert.rejects(async () => guard(url, init), `must deny ${init?.method || "GET"} ${url}`);
  assert.equal(seen.length, 3, "denied requests never reach the network");
}

type Mock = { flirt: string[]; twin: string[]; twinBodies: any[] };
function mockFetch(mode: { consent: boolean; applicationStatus?: string }): Mock & { restore(): void } {
  const seen: Mock = { flirt: [], twin: [], twinBodies: [] };
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String((input as Request).url ?? input));
    const method = init?.method || "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    let result: unknown = [];
    if (url.hostname === "aouaenqayfltoqrmpitg.supabase.co") {
      seen.twin.push(`${method} ${url.pathname}`);
      if (method === "POST") { seen.twinBodies.push(body); result = { id: "99999999-9999-9999-9999-999999999999", slug: body.slug }; }
      return new Response(JSON.stringify(result), { status: method === "POST" ? 201 : 200, headers: { "content-type": "application/json" } });
    }
    assert.equal(url.hostname, "lkmfwpqegjluirfusnaw.supabase.co");
    seen.flirt.push(`${method} ${url.pathname}`);
    switch (url.pathname) {
      case "/rest/v1/partner_agencies": result = { id: ID, name: "FLIRT" }; break;
      case "/rest/v1/agency_creators": result = []; break;
      case "/rest/v1/creator_agency_assignments": result = { creator_account_id: ACCOUNT }; break;
      case "/rest/v1/creator_applications":
        result = method === "PATCH" ? [{ id: "cccccccc-cccc-cccc-cccc-cccccccccccc" }]
          : { id: "cccccccc-cccc-cccc-cccc-cccccccccccc", status: mode.applicationStatus ?? "submitted", answers: input_().application!.answers };
        break;
      case "/rest/v1/creator_accounts": result = method === "PATCH" ? [{ id: ACCOUNT }] : { id: ACCOUNT, display_name: "Jane D", account_status: "approved" }; break;
      case "/rest/v1/creator_consents": result = mode.consent ? { legal_name: "Jane Doe", consent_version: "v1", signed_at: "2026-10-01T00:00:00Z" } : null; break;
      case "/rest/v1/creator_files": result = []; break;
      case "/rest/v1/creator_clone_links": result = method === "POST" ? [] : null; break;
      default: throw new Error(`Unexpected FLIRT call ${url.pathname}`);
    }
    return new Response(JSON.stringify(result), { status: method === "POST" ? 201 : 200, headers: { "content-type": "application/json" } });
  };
  return Object.assign(seen, { restore() { globalThis.fetch = original; } });
}
const input_ = () => input();

async function routeChecks() {
  configureFlirtOfflineEnv();
  Object.assign(process.env, {
    NODE_ENV: "production", FLIRT_SUPABASE_PROJECT_REF: "lkmfwpqegjluirfusnaw", SUPABASE_URL: "https://lkmfwpqegjluirfusnaw.supabase.co",
    FLIRT_LIVE_TWIN_ENABLED: "true", FLIRT_LIVE_TWIN_URL: "https://aouaenqayfltoqrmpitg.supabase.co", FLIRT_LIVE_TWIN_SERVICE_KEY: "sb_secret_" + "x".repeat(30),
  });
  delete process.env.FLIRT_CLONE_PIPELINE_ENABLED;
  const origin = process.env.DASHBOARD_PUBLIC_ORIGIN!;
  const req = (path: string, fields: Record<string, string>, o = origin) => new NextRequest(origin + path, { method: "POST", headers: { origin: o }, body: new URLSearchParams(fields) });
  const location = (r: Response) => r.headers.get("location") ?? "";

  // policy wiring
  for (const p of ["/agency/creators/build-clone", "/agency/creators/build-packet"]) assert.equal(flirtOperatorAgencyPath(p), true);
  assert.equal(agencyRequestAllowed("/agency/creators/build-clone", "POST", false), true);
  assert.equal(agencyRequestAllowed("/agency/creators/build-clone", "POST", true), false);

  // FLAG OFF: approve behaves exactly as before and nothing reaches Twin; build button and packet are inert
  let m = mockFetch({ consent: true, applicationStatus: "submitted" });
  try {
    await withDashboardAccess(identity(), async () => {
      assert.match(location(await reviewRoute(req("/agency/creators/review", { creator_account_id: ACCOUNT, decision: "approve" }))), /result=reviewed$/);
      assert.match(location(await buildRoute(req("/agency/creators/build-clone", { creator_account_id: ACCOUNT }))), /result=build_off$/);
      assert.equal((await packetRoute(new NextRequest(origin + `/agency/creators/build-packet?id=${ACCOUNT}`))).status, 404);
    });
    assert.deepEqual(m.twin, [], "flag off: zero Twin requests");
    assert.ok(!m.flirt.some((c) => c.includes("creator_clone_links")), "flag off: no link written");
  } finally { m.restore(); }

  // FLAG ON, no consent: approval is saved, clone is NOT built, Twin untouched
  Object.assign(process.env, { FLIRT_CLONE_PIPELINE_ENABLED: "true" });
  m = mockFetch({ consent: false });
  try {
    await withDashboardAccess(identity(), async () => {
      assert.match(location(await reviewRoute(req("/agency/creators/review", { creator_account_id: ACCOUNT, decision: "approve" }))), /result=build_no_consent$/);
    });
    assert.ok(m.flirt.includes("PATCH /rest/v1/creator_accounts"), "approval itself was still recorded");
    assert.deepEqual(m.twin, []);
  } finally { m.restore(); }

  // FLAG ON, consent on file: approving builds one paused clone in Twin and links it
  m = mockFetch({ consent: true, applicationStatus: "approved" });
  try {
    await withDashboardAccess(identity(), async () => {
      assert.match(location(await reviewRoute(req("/agency/creators/review", { creator_account_id: ACCOUNT, decision: "approve" }))), /result=built$/);
    });
    assert.equal(m.twinBodies.length, 1);
    assert.equal(m.twinBodies[0].status, "paused");
    assert.ok(String(m.twinBodies[0].bot_token).startsWith(PLACEHOLDER_TOKEN_PREFIX));
    assert.ok(m.twin.every((c) => c.endsWith("/rest/v1/clones")), "only the clones table is touched in Twin: " + m.twin.join(","));
    assert.ok(m.twin.filter((c) => c.startsWith("POST")).length === 1);
    assert.ok(m.flirt.includes("POST /rest/v1/creator_clone_links"), "link saved in FLIRT");
    // reject / reviewing never build
    m.twin.length = 0;
    await withDashboardAccess(identity(), async () => {
      await reviewRoute(req("/agency/creators/review", { creator_account_id: ACCOUNT, decision: "reject" }));
      await reviewRoute(req("/agency/creators/review", { creator_account_id: ACCOUNT, decision: "reviewing" }));
      // origin check and sign-in still enforced on the new route
      assert.equal((await buildRoute(req("/agency/creators/build-clone", { creator_account_id: ACCOUNT }, "https://evil.example"))).status, 403);
    });
    assert.deepEqual(m.twin, []);
    assert.equal((await withDashboardAccess(null, () => buildRoute(req("/agency/creators/build-clone", { creator_account_id: ACCOUNT })))).status, 401);
  } finally { m.restore(); delete process.env.FLIRT_CLONE_PIPELINE_ENABLED; }
}

async function main() {
  pureChecks();
  await orchestratorChecks();
  await guardChecks();
  await routeChecks();
  console.log("FLIRT CLONE PIPELINE PASSED: flag off is a no-op, consent and age are required, the Twin payload is one paused placeholder-token clone, and Twin writes are confined to that one insert");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
