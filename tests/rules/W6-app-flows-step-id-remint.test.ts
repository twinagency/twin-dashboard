// RULE (regression guard, W6 close 2026-11-12): saveCampaign keeps every posted onboarding step `id` (migration 087).
// Origin: W6 canary. Commit 15e66f91 "flows: tidy guard" planted `s?.step_id` at app/flows/actions.ts:97; the form
// posts `id` (FlowsForm.tsx:287), the bot reads `id` (twin-bot src/data/supabase-store.ts:3111) and keys delivery on it
// (src/onboarding-state.ts:14-16). Re-minting ids makes every fan mid-onboarding see delivered steps as new.
// The app-flows lane caught it at blocker (docs/review/W6/app-flows.md, CANARY). Reverted on jaka/w6-close-20261112.
// Mutation record: tests/rules/mutations/W6-app-flows/m1-canary-15e66f91-step-id.txt (red 1 pass / 2 fail at 15e66f91).
// Harness: the real saveCampaign, transpiled with a fake require (precedent scripts/check-agency-clone-save.ts) for
// guard / next/cache / query-cache; the DB is faked at the wire: a real @supabase/supabase-js client whose `fetch`
// captures the PATCH body. Offline: the host is .invalid and the fake fetch never touches the network.
// Run: nice -n 10 node --import tsx --test tests/rules/W6-app-flows-step-id-remint.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

const nativeRequire = createRequire(import.meta.url);
const CLONE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Step = { id: string; type: string; after_messages: number; collect_field?: string };

const wire: { method: string; url: string; body: Record<string, unknown> }[] = [];
const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  wire.push({ method: String(init?.method), url: String(input), body: JSON.parse(String(init?.body ?? "null")) });
  return new Response(null, { status: 204 });
}) as typeof fetch;
const supabaseAdmin = createClient("https://offline.supabase.invalid", "offline-fixture", {
  auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fakeFetch },
});

const path = "app/flows/actions.ts";
const output = ts.transpileModule(readFileSync(path, "utf8"), { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const actions: Record<string, any> = {};
new Function("require", "exports", output)((name: string) => {
  if (name === "@/lib/agency-management") return { guardDashboardAction: async () => {} };
  if (name === "next/cache") return { revalidatePath() {} };
  if (name === "@/lib/query-cache") return { invalidateCloneCaches: async () => {} };
  if (name === "@/lib/supabase") return { supabaseAdmin };
  if (name === "node:crypto") return nativeRequire("node:crypto");
  throw new Error("Unexpected action import: " + name);
}, actions);

async function save(steps: unknown[]): Promise<Step[]> {
  const fd = new FormData();
  fd.set("onboarding_steps", JSON.stringify(steps));
  const before = wire.length;
  await actions.saveCampaign(CLONE, fd);
  assert.equal(wire.length, before + 1, "exactly one write per save");
  const call = wire.at(-1)!;
  assert.equal(call.method, "PATCH");
  assert.match(call.url, new RegExp(`/rest/v1/clones\\?id=eq\\.${CLONE}$`));
  return call.body.onboarding_steps as Step[];
}

test("control: a step posted with no id is minted a fresh UUID and keeps its other fields", async () => {
  const saved = await save([
    { type: "collect", after_messages: 3, collect_field: "name" },
    { type: "location_gate", after_messages: 5 },
  ]);
  assert.equal(saved.length, 2);
  for (const step of saved) assert.match(step.id, UUID);
  assert.notEqual(saved[0].id, saved[1].id);
  assert.deepEqual(saved.map(({ id: _id, ...rest }) => rest), [
    { type: "collect", after_messages: 3, collect_field: "name" },
    { type: "location_gate", after_messages: 5 },
  ]);
});

test("a step posted with its stable `id` (FlowsForm.tsx:287 shape) is written back with that id", async () => {
  const saved = await save([
    { id: "step-a", type: "text", after_messages: 1 },
    { id: "step-b", type: "collect", after_messages: 2, collect_field: "name" },
  ]);
  assert.deepEqual(saved.map(step => step.id), ["step-a", "step-b"], "a save must never re-mint an existing step id");
});

test("load-then-save is identity for step ids (a second save of the same list keeps them)", async () => {
  const first = await save([{ type: "text", after_messages: 1 }, { type: "collect", after_messages: 2, collect_field: "age" }]);
  // What page.tsx:519 loads and FlowsForm.tsx:287 posts back on the next save.
  const second = await save(first.map(step => ({ ...step })));
  assert.deepEqual(second.map(step => step.id), first.map(step => step.id), "every live fan sees a re-minted step as new");
});
