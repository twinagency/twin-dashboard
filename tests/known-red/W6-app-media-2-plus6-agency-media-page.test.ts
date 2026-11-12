// KNOWN RED (configured but inert; W6-app-media-2-plus6 finding 6, HIGH; found by the Codex final pass).
// /media with a creator selected (app/media/page.tsx:19) renders components/CloneMediaPage.tsx, whose reads go through
// supabaseAdmin -> dashboardFetch -> scopeReadUrl -> scopedSelection for any agency session (lib/agency-query.ts:12-30).
// Its clones select names `browse_enabled`, absent from AGENCY_COLUMNS.clones, and it reads `catalogue_bundles`, which has no
// agency column list at all, so both reads are refused ("Unsupported agency column" / "restricted to administrators"), the
// clone read error is thrown (CloneMediaPage.tsx:19) and the page fails. Agencies are allowed /media (lib/agency-policy.ts:29).
// Condition: a managing agency session opens /media with one of its creators selected (clone_scope cookie or a single clone).
// Harness: the select strings are read from the REAL component source (so the test follows it) and judged by the REAL
// scopedSelection. Offline; no session is created.
// Run: nice -n 10 node --import tsx --test tests/known-red/W6-app-media-2-plus6-agency-media-page.test.ts
// Owning files: components/CloneMediaPage.tsx (programme lane 44), lib/agency-columns.ts (lane 64). Not wired into npm.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { scopedSelection } from "../../lib/agency-query";

const source = readFileSync("components/CloneMediaPage.tsx", "utf8");
const reads = [...source.matchAll(/from\("([a-z_]+)"\)\.select\("([^"]+)"\)/g)].map(([, table, select]) => ({ table, select }));

test("control: the component's photos/videos/bundle reads are admitted for an agency", () => {
  assert.ok(reads.length >= 5, `expected the 5 page reads, found ${reads.length}`);
  for (const { table, select } of reads.filter((r) => ["photos", "videos", "photo_bundles"].includes(r.table))) {
    assert.doesNotThrow(() => scopedSelection(table, select), `${table}: ${select}`);
  }
});

test("HIGH: every read the agency media page makes is admitted by the agency column allowlist", () => {
  const refused: string[] = [];
  for (const { table, select } of reads) {
    try { scopedSelection(table, select); } catch (error) { refused.push(`${table}(${select}): ${(error as Error).message}`); }
  }
  assert.deepEqual(refused, [], "an agency /media page read is refused, so the page throws");
});
