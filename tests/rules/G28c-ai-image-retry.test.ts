// G28c round 1 (#411 Opus final + Flash): every AI image action converges on retry after ANY single failed step, and no failed
// step leaves a Free copy public without the row recording it. Direction is judged from what is actually public (the row's
// public_path), not only from row state, so a retry after a half-done narrowing takes the narrowing path again.
// Stateful fake: the row, the model's profile_image_id, and the ai-public / ai-private object sets live in memory and every
// PATCH / DELETE / upload applies to them. Step k (every wire call but the image row read) fails once with a 500; then a clean
// retry must resolve with the exact end state. Harness: tests/rules/G28-harness.ts.
import { startFakeSupabase, asAdmin, outcome, blockedFetches, type WireCall, type Reply } from "./G28-harness";
import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { deleteAiImage, setImageAccess, setImageStatus } from "../../app/ai-models/actions";

const MODEL = "aaaaaaaa-1111-4111-8111-111111111111";
const IMAGE = "bbbbbbbb-2222-4222-8222-222222222222";
const ORIG = `${MODEL}/${IMAGE}.jpg`, FREE = `${MODEL}/${IMAGE}.jpg`, BLUR = `${MODEL}/${IMAGE}.blur.jpg`;
type Row = { id: string; model_id: string; kind: string; storage_path: string; public_path: string | null; status: string; access: string; price_stars: number | null };
type State = { row: Row | null; profile: string | null; pub: Set<string>; priv: Set<string>; bought: number };
const base: Row = { id: IMAGE, model_id: MODEL, kind: "photo", storage_path: ORIG, public_path: FREE, status: "approved", access: "free", price_stars: null };

let sb!: Awaited<ReturnType<typeof startFakeSupabase>>;
let jpeg!: Buffer;
test.before(async () => {
  sb = await startFakeSupabase();
  jpeg = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#c33" } }).jpeg().toBuffer();
});
test.after(() => sb.close());

const fail500 = { status: 500, body: { statusCode: "500", code: "57014", error: "internal", message: "backend unavailable" } };
/** Wire the fake to `st`; a call `fail` picks (n = its index among failable calls) answers 500 without changing state. */
function wire(st: State, fail: (c: WireCall, n: number) => boolean = () => false) {
  let n = 0;
  sb.reset();
  sb.respond((c: WireCall): Reply | undefined => {
    if (c.method === "GET" && c.path === "/rest/v1/ai_model_images") return { body: st.row ? [{ ...st.row }] : [] };
    if (fail(c, n++)) return fail500;
    if (c.path === "/rest/v1/ai_model_images" && c.method === "PATCH") { if (st.row) Object.assign(st.row, c.body); return { body: [] }; }
    if (c.path === "/rest/v1/ai_model_images" && c.method === "DELETE") { st.row = null; return { body: [] }; }
    if (c.path === "/rest/v1/ai_models" && c.method === "PATCH") {
      if ("profile_image_id" in c.body && c.query.get("profile_image_id") === `eq.${st.profile}`) st.profile = c.body.profile_image_id;
      return { body: [] };
    }
    if (c.path === "/rest/v1/ai_model_purchases") return { body: [], headers: { "content-range": `*/${st.bought}` } };
    const obj = c.path.match(/^\/storage\/v1\/object\/(ai-public|ai-private)(?:\/(.*))?$/);
    if (obj) {
      const set = obj[1] === "ai-public" ? st.pub : st.priv;
      if (c.method === "DELETE") { const gone = (c.body?.prefixes ?? []).filter((p: string) => set.delete(p)); return { body: gone.map((name: string) => ({ name })) }; }
      if (c.method === "POST") { set.add(obj[2]); return { body: { Key: c.path, Id: "obj-1" } }; }
      if (c.method === "GET") return set.has(obj[2]) ? { raw: jpeg } : { status: 400, body: { statusCode: "404", error: "not_found", message: "Object not found" } };
    }
    return undefined;
  });
}

type Scenario = { name: string; start: () => State; act: () => Promise<unknown>; end: Omit<State, "pub" | "priv"> & { pub: string[]; priv: string[] }; narrowing: (r: Row | null) => boolean };
const s = (row: Row | null, profile: string | null, pub: string[], bought = 0): State => ({ row: row && { ...row }, profile, pub: new Set(pub), priv: new Set([ORIG]), bought });
const scenarios: Scenario[] = [
  { name: "reject an approved Free profile pic", start: () => s(base, IMAGE, [FREE]), act: () => setImageStatus(IMAGE, "rejected"),
    end: { row: { ...base, status: "rejected", public_path: null }, profile: null, pub: [], priv: [ORIG], bought: 0 }, narrowing: (r) => r?.status === "rejected" },
  { name: "Free profile pic to Locked", start: () => s(base, IMAGE, [FREE]), act: () => setImageAccess(IMAGE, "locked", 50),
    end: { row: { ...base, access: "locked", price_stars: 50, public_path: BLUR }, profile: null, pub: [BLUR], priv: [ORIG], bought: 0 }, narrowing: (r) => r?.access === "locked" },
  { name: "Locked to Free", start: () => s({ ...base, access: "locked", price_stars: 50, public_path: BLUR }, null, [BLUR]), act: () => setImageAccess(IMAGE, "free", null),
    end: { row: { ...base }, profile: null, pub: [FREE], priv: [ORIG], bought: 0 }, narrowing: () => false },
  { name: "approve a pending Locked pic", start: () => s({ ...base, status: "pending", access: "locked", price_stars: 50, public_path: null }, null, []), act: () => setImageStatus(IMAGE, "approved"),
    end: { row: { ...base, access: "locked", price_stars: 50, public_path: BLUR }, profile: null, pub: [BLUR], priv: [ORIG], bought: 0 }, narrowing: () => false },
  { name: "delete an approved Free profile pic", start: () => s(base, IMAGE, [FREE]), act: () => deleteAiImage(IMAGE),
    end: { row: null, profile: null, pub: [], priv: [], bought: 0 }, narrowing: (r) => !r || r.status === "rejected" },
];
const view = (st: State) => ({ row: st.row, profile: st.profile, pub: [...st.pub].sort(), priv: [...st.priv].sort(), bought: st.bought });

for (const sc of scenarios) {
  test(`retry converges: ${sc.name}, after each single failed step`, async () => {
    for (let k = 0; k < 12; k++) {
      const st = sc.start();
      wire(st, (_c, n) => n === k);
      const first = await outcome(asAdmin(sc.act));
      const at = `${sc.name}, step ${k} failed (${first}), state ${JSON.stringify(view(st))}`;
      if (first === "resolved") assert.deepEqual(view(st), sc.end, `claimed success with the wrong end state: ${at}`);
      if (st.pub.has(FREE)) assert.equal(st.row?.public_path, FREE, `a Free copy is public but the row does not record it: ${at}`);
      if (sc.narrowing(sc.end.row) && first !== "resolved" && st.row?.status === "approved" && st.row.access === "free") {
        assert.deepEqual(view(st), view(sc.start()), `the deny did not land, yet something else changed: ${at}`);
      }
      if (first === "resolved" && !st.row) continue; // deleted: nothing left to retry
      wire(st);
      assert.equal(await outcome(asAdmin(sc.act)), "resolved", `retry did not finish: ${at}`);
      assert.deepEqual(view(st), sc.end, `retry left the wrong end state: ${at}`);
    }
    assert.deepEqual(blockedFetches, []);
  });
}

test("a failed profile unset never stops the public takedown (reject, Free to Locked, delete)", async () => {
  for (const act of [() => setImageStatus(IMAGE, "rejected"), () => setImageAccess(IMAGE, "locked", 50), () => deleteAiImage(IMAGE)]) {
    const st = s(base, IMAGE, [FREE]);
    wire(st, (c) => c.path === "/rest/v1/ai_models");
    const result = await outcome(asAdmin(act));
    assert.notEqual(result, "resolved", "the model still points at the denied image");
    assert.equal(st.pub.has(FREE), false, `the Free copy stayed public because the profile unset failed (${result})`);
  }
  assert.deepEqual(blockedFetches, []);
});

test("a refused delete (a fan bought it) leaves the image denied with no public copy", async () => {
  const st = s(base, IMAGE, [FREE], 1);
  wire(st);
  const result = await outcome(asAdmin(() => deleteAiImage(IMAGE)));
  assert.match(result, /^rejected: A fan bought this one/);
  assert.deepEqual(view(st), { row: { ...base, status: "rejected", public_path: null }, profile: null, pub: [], priv: [ORIG], bought: 1 });
  assert.deepEqual(blockedFetches, []);
});

test("Locked to Free: row PATCH 500 and the rollback remove 500 report both, the Free copy is named", async () => {
  const st = s({ ...base, access: "locked", price_stars: 50, public_path: BLUR }, null, [BLUR]);
  wire(st, (c) => (c.method === "PATCH" && c.path === "/rest/v1/ai_model_images") || (c.method === "DELETE" && c.path === "/storage/v1/object/ai-public"));
  const result = await outcome(asAdmin(() => setImageAccess(IMAGE, "free", null)));
  assert.match(result, /^rejected: Not saved/, "the DB error comes first");
  assert.match(result, /still (up|public)/, `the operator is not told the Free copy is still public (${result})`);
  assert.deepEqual(blockedFetches, []);
});

test("Free to Locked whose Free remove fails twice keeps the Free copy recorded in public_path (never public and unrecorded)", async () => {
  const st = s(base, IMAGE, [FREE]);
  const freeRemove = (c: WireCall) => c.method === "DELETE" && c.path === "/storage/v1/object/ai-public" && (c.body?.prefixes ?? []).includes(FREE);
  for (let i = 0; i < 2; i++) {
    wire(st, freeRemove);
    assert.notEqual(await outcome(asAdmin(() => setImageAccess(IMAGE, "locked", 50))), "resolved");
    assert.equal(st.pub.has(FREE), true, "harness proof: the Free copy is still public");
    assert.equal(st.row?.public_path, FREE, `attempt ${i + 1}: the row stopped recording the public Free copy (${JSON.stringify(view(st))})`);
    assert.equal(st.row?.access, "locked");
  }
  assert.deepEqual(blockedFetches, []);
});
