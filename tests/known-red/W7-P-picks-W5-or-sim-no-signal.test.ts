// KNOWN RED, source-text (W5 lib-openrouter-plus6 F20). `orChat`'s `signal` is optional (lib/openrouter.ts:332) and the
// in-dash sim never passes one: `runSim` takes no signal (lib/sim.ts:97) and its two `orChat` calls per turn
// (lib/sim.ts:117,131) carry none, so a sim of up to 20 turns (40 paid calls) runs on after the client disconnects.
// Green when every orChat call in lib/sim.ts passes a `signal` and runSim accepts one (route then forwards req.signal).
// Reads source text only (lib/sim.ts imports the Supabase client); no DB, no network, never a paid call.
// Written by W7 P-picks (not the finding lane). Run: nice -n 10 node --import tsx --test <this file>
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
/** Each `orChat({ ... })` argument object in `src`, brace-matched. */
function orChatCalls(src: string): string[] {
  const out: string[] = [];
  for (let i = src.indexOf("orChat({"); i >= 0; i = src.indexOf("orChat({", i + 1)) {
    let depth = 0, j = src.indexOf("{", i);
    for (; j < src.length; j++) { if (src[j] === "{") depth++; else if (src[j] === "}" && --depth === 0) break; }
    out.push(src.slice(i, j + 1));
  }
  return out;
}

test("control: orChat forwards a caller's signal to fetch, and lib/sim.ts makes orChat calls", () => {
  assert.match(read("lib/openrouter.ts"), /signal:\s*opts\.signal/, "orChat passes opts.signal to fetch");
  assert.ok(orChatCalls(read("lib/sim.ts")).length >= 2, "lib/sim.ts has its orChat calls");
});

test("F20: every paid orChat call in the sim carries an abort signal", () => {
  const missing = orChatCalls(read("lib/sim.ts")).filter(c => !/\bsignal\b/.test(c));
  assert.equal(missing.length, 0, `${missing.length} orChat call(s) in lib/sim.ts pass no signal: a disconnected client cannot stop paid calls`);
});
