// KNOWN RED (W4 lib-dashboard-data-plus2 F1, F2, F11, docs/review/W4/lib-dashboard-data-plus2.md): lib/media-repair.ts
// guards that let wrong catalogue metadata (or the wrong target) through. Pure function calls, no database, no network.
// F1: bindConflict never checks `after.analysis_provider`, so a preview made by the fake analyser (provider "fake") binds
//     for apply.
// F2: captionContradictsFacts treats only "no" as a contradiction on 6 of 11 keys, and a "no" contradiction with no
//     replacement caption still stamps the row "analysed" with the old caption kept.
// F11: assertSafeSupabaseUrl accepts plain http:// for the live project, and accepts the live host with nothing in the
//      environment saying a remote run was meant (only a loopback rig should pass by default).
// Project refs are never literals here: the live host is read from lib/media-repair.ts (or CLAUDE.md once the literal is
// gone), the old-prod ref from CLAUDE.md, both at runtime. Analysis results are test-local (tests/support/media-repair-fixture.ts),
// not lib's fakeAnalyser. Team's Claude owns the fix.
// Intended runner: init.sh's known-red loop; not wired yet: orchestrator item.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { assertSafeSupabaseUrl, bindConflict, buildProposal, resolveItems, type CloneInfo, type Proposal } from "../../lib/media-repair";
import { A } from "../support/ids";
import { legacyRow, realAnalysis } from "../support/media-repair-fixture";
import { harness } from "../support/outcome";

const CLONE: CloneInfo = { id: A, slug: "alpha", vision_model: null };
const CTX = { runId: "r-test", now: () => new Date("2026-11-12T05:00:00Z") };

/** The Item apply binds, built by lib's own resolveItems. */
const toItem = (p: Proposal) => resolveItems({ proposals: [p], holds: [], file: "", sha256: "" }).items[0];

test("control: a proposal from a real provider binds against its unchanged row", () => {
  const row = legacyRow();
  const p = buildProposal(CTX, "photos", row, "alpha", realAnalysis(), true);
  assert.equal(p.outcome, "proposed");
  assert.equal(bindConflict(toItem(p), row, CLONE), null);
});

test("F1 bindConflict refuses a proposal made by the fake analyser (analysis_provider fake)", () => {
  const row = legacyRow();
  const p = buildProposal(CTX, "photos", row, "alpha", realAnalysis({ provider: "fake" }), true);
  harness(p.after.analysis_provider === "fake", `the proposal records provider fake (got ${String(p.after.analysis_provider)})`);
  const why = bindConflict(toItem(p), row, CLONE);
  assert.notEqual(why, null, `fake proposal binds for apply (visual_description ${JSON.stringify(p.after.visual_description)})`);
});

test("control: a caption the facts rule out (nipples no) is replaced by the new caption", () => {
  const row = legacyRow(1, { caption: "look at my nipples" });
  const p = buildProposal(CTX, "photos", row, "alpha", realAnalysis({ caption: "sunny beach day" }), true);
  assert.equal(p.outcome, "proposed");
  assert.equal(p.after.caption, "sunny beach day");
});

/** True when the proposal stamps the row analysed and keeps its old caption. */
const keepsCaptionAnalysed = (p: Proposal) => p.outcome === "proposed" && p.after.analysis_status === "analysed" && !("caption" in p.after);

test("F2 a caption claiming genitals while genitals is unclear is not kept on an analysed row", () => {
  const row = legacyRow(1, { caption: "show you my pussy" });
  const p = buildProposal(CTX, "photos", row, "alpha", realAnalysis({ evidence: { genitals: "unclear" }, caption: "sunny beach day" }), true);
  assert.ok(!keepsCaptionAnalysed(p), `outcome ${p.outcome}, status ${String(p.after.analysis_status)}, caption kept "${row.caption}" (only "yes" licenses a claim)`);
});

test("F2 a caption claiming bare buttocks (key not covered) while bare_buttocks is no is not kept on an analysed row", () => {
  const row = legacyRow(1, { caption: "my bare ass just for you" });
  const p = buildProposal(CTX, "photos", row, "alpha", realAnalysis({ caption: "sunny beach day" }), true);
  assert.ok(!keepsCaptionAnalysed(p), `outcome ${p.outcome}, status ${String(p.after.analysis_status)}, caption kept "${row.caption}"`);
});

test("F2 a contradicting caption with no replacement caption is not stamped analysed", () => {
  const row = legacyRow(1, { caption: "look at my nipples" });
  const p = buildProposal(CTX, "photos", row, "alpha", realAnalysis({ caption: null }), true);
  assert.ok(!(p.outcome === "proposed" && p.after.analysis_status === "analysed"),
    `outcome ${p.outcome}, status ${String(p.after.analysis_status)}, notes ${JSON.stringify(p.notes)}`);
});

// ── F11 ──────────────────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, "../..");
function refs(): { live: string; oldProd: string } {
  const claude = readFileSync(path.join(ROOT, "CLAUDE.md"), "utf8");
  const src = readFileSync(path.join(ROOT, "lib/media-repair.ts"), "utf8");
  const live = /"([a-z]{20})\.supabase\.co"/.exec(src)?.[1] ?? /Only ever `([a-z]{20})`/.exec(claude)?.[1];
  const oldProd = /NEVER `([a-z]{20})`, that is old prod/.exec(claude)?.[1];
  harness(live && oldProd && live !== oldProd, "could not read the project refs from lib/media-repair.ts / CLAUDE.md");
  return { live, oldProd };
}

test("control: old prod, unknown and look-alike hosts are refused; 127.0.0.1 is accepted", () => {
  const { live, oldProd } = refs();
  assert.throws(() => assertSafeSupabaseUrl(`https://${oldProd}.supabase.co`));
  assert.throws(() => assertSafeSupabaseUrl("https://example.supabase.co"));
  assert.throws(() => assertSafeSupabaseUrl(`https://${live}.supabase.co.evil.test`));
  assert.equal(assertSafeSupabaseUrl("http://127.0.0.1:54321"), "http://127.0.0.1:54321");
});

test("F11 plain http:// to the live project is refused (service key would travel in clear)", () => {
  const { live } = refs();
  assert.throws(() => assertSafeSupabaseUrl(`http://${live}.supabase.co`), /./, "http:// live URL accepted");
});

/** Runs fn with every Supabase / media-repair / remote-ish variable unset, then puts them back. */
function withoutRemoteEnv<T>(fn: () => T): T {
  const saved = Object.entries(process.env).filter(([k]) => /SUPABASE|MEDIA_REPAIR|REMOTE/i.test(k));
  for (const [k] of saved) delete process.env[k];
  try { return fn(); } finally { for (const [k, v] of saved) process.env[k] = v; }
}

test("F11 live host refused without explicit remote configuration", () => {
  const { live } = refs();
  withoutRemoteEnv(() =>
    assert.throws(() => assertSafeSupabaseUrl(`https://${live}.supabase.co`), /./, "https:// live URL accepted with no remote configuration in the environment"));
});
