// Offline check: the /bot-v2 proxy refuses clones.engine switches (both directions) while V2
// message credits are enabled or metered work is open, fails closed on read errors, and allows
// the switch exactly as before when the schema is not applied. Fake Supabase, no network.
import fs from "node:fs";
import path from "node:path";
import { engineSwitchGate, guardEngineSwitch, MSG_ENABLED, type GuardDb } from "../lib/engine-switch-guard";

let passed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, extra = "") {
  if (cond) { passed++; console.log(`  ok  ${label}`); } else { failures.push(`${label} ${extra}`); console.log(`  FAIL ${label} ${extra}`); }
}

type R = { data: unknown; error: { code?: string; message?: string; status?: number } | null };
function fake(row: R, rpc: R): GuardDb & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { calls.push("select"); return row; } }) }) }),
    rpc: async (fn) => { calls.push("rpc:" + fn); return rpc; },
  };
}
const rowOk = (en: boolean | null): R => ({ data: { v2_credits_enabled: en }, error: null });
const work = (n: number): R => ({ data: { ok: true, contract: 1, reserved_turns: n, oldest_reserved_at: null, open_exceptions: 0, awaiting_receipt_refunds: 0 }, error: null });
const colMissing: R = { data: null, error: { code: "42703", message: "column clones.v2_credits_enabled does not exist" } };
const rpcMissing: R = { data: null, error: { code: "PGRST202", message: "Could not find the function public.v2credit_open_work(p_clone_id) in the schema cache", status: 404 } };
const http500: R = { data: null, error: { code: "500", message: "boom", status: 500 } };

async function main() {
  // guard decisions
  let r = await guardEngineSwitch(fake(colMissing, rpcMissing), "c1");
  ok("allows when feature not installed (column and rpc missing)", r.allow === true);
  r = await guardEngineSwitch(fake(rowOk(false), rpcMissing), "c1");
  ok("allows when column exists but rpc missing", r.allow === true);
  r = await guardEngineSwitch(fake(rowOk(false), work(0)), "c1");
  ok("allows when disabled and 0 open", r.allow === true);
  const f = fake(rowOk(true), work(0));
  r = await guardEngineSwitch(f, "c1");
  ok("refuses when enabled", !r.allow && r.status === 409 && r.error === MSG_ENABLED);
  r = await guardEngineSwitch(fake(rowOk(false), work(3)), "c1");
  ok("refuses when reserved_turns > 0, with the count", !r.allow && r.status === 409 && /3 metered replies are still unresolved/.test(r.error));
  r = await guardEngineSwitch(fake(rowOk(false), http500), "c1");
  ok("fails closed when open_work errors 500", !r.allow && r.status === 409);
  r = await guardEngineSwitch(fake(http500, work(0)), "c1");
  ok("fails closed when the clone read errors 500", !r.allow);
  r = await guardEngineSwitch(fake(rowOk(false), { data: { ok: false }, error: null }), "c1");
  ok("fails closed on ok:false", !r.allow);
  r = await guardEngineSwitch(fake(rowOk(false), { data: null, error: null }), "c1");
  ok("fails closed on empty open_work result", !r.allow);
  r = await guardEngineSwitch(fake(rowOk(null), work(0)), "c1");
  ok("fails closed when enabled flag is null", !r.allow);
  r = await guardEngineSwitch(fake({ data: null, error: null }, work(0)), "c1");
  ok("refuses unknown creator", !r.allow && r.status === 404);
  const thrower = { from: () => { throw new Error("net"); }, rpc: async () => work(0) } as unknown as GuardDb;
  r = await guardEngineSwitch(thrower, "c1");
  ok("fails closed when the client throws", !r.allow);

  // proxy gate, both directions
  for (const to of ["v2", "live"]) {
    const body = JSON.stringify({ id: "c1", engine: to });
    const g1 = await engineSwitchGate("POST", ["api", "girls", "engine"], body, () => fake(rowOk(true), work(0)));
    ok(`${to}: refused with 409 + {ok:false,error} when enabled`, !!g1 && g1.status === 409 && (await g1.json()).ok === false);
    const g2 = await engineSwitchGate("POST", ["api", "girls", "engine"], body, () => fake(rowOk(false), work(2)));
    ok(`${to}: refused when open work`, !!g2 && g2.status === 409);
    const g3 = await engineSwitchGate("POST", ["api", "girls", "engine"], body, () => fake(rowOk(false), work(0)));
    ok(`${to}: forwarded when clean`, g3 === null);
    const g4 = await engineSwitchGate("POST", ["api", "girls", "engine"], body, () => fake(colMissing, rpcMissing));
    ok(`${to}: forwarded when schema not applied`, g4 === null);
  }
  ok("bad JSON body is refused", (await engineSwitchGate("POST", ["api", "girls", "engine"], "{nope", () => fake(rowOk(false), work(0))))?.status === 400);
  ok("other paths untouched", (await engineSwitchGate("POST", ["api", "girls", "details"], "{}", () => fake(rowOk(true), work(9)))) === null);
  ok("GET untouched", (await engineSwitchGate("GET", ["api", "girls", "engine"], "", () => fake(rowOk(true), work(9)))) === null);

  // wiring: the route must run the gate before it forwards upstream
  const src = fs.readFileSync(path.join(__dirname, "../app/bot-v2/[[...path]]/route.ts"), "utf8");
  const gi = src.indexOf("engineSwitchGate(req.method");
  const fi = src.indexOf("await fetch(target");
  const ri = src.indexOf("if (refused) return refused;");
  ok("route calls the gate and returns its refusal before fetch", gi > 0 && ri > gi && fi > ri);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
}
main();
