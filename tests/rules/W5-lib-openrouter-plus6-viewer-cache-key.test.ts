// CHARACTERIZATION (W5 lib-openrouter-plus6 "Rules check": the viewer cache key carries viewer id, roster, canManage,
// starMult and usdPerStar; docs/review/W5/lib-openrouter-plus6.md). Holds today; mutation-proven
// (tests/rules/mutations/W5-lib-openrouter-plus6/). lib/revenue-cache.ts:153 keys its NET cache on
// viewerCacheKey(access) (lib/platform-cut.ts:332-337): if a cut or star-rate change left the key unchanged, the
// previous terms' NET figures would be served for up to 60 s after an admin edited the cut.
// Terms come from the lib's own test seam (__setViewerTermsOverrideForTests), except the last case, which drives the
// real terms lookup through PostgREST faked at the wire (tests/support/postgrest-wire.ts): the agency's platform_cuts
// row changes, invalidateCutCache() runs (what setCut does after a write), and the key must change with it.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { __setViewerTermsOverrideForTests, invalidateCutCache, viewerCacheKey, type ViewerTerms } from "../../lib/platform-cut";
import type { AgencyIdentity } from "../../lib/agency-identity";
import { rowsReply, useWire } from "../support/postgrest-wire";
import { harness } from "../support/W5-lib-openrouter-plus6-wire";

let platformCuts: Record<string, unknown>[] = [];
const wire = useWire((w) => {
  w.on("GET /rest/v1/platform_cuts", (req) => rowsReply(platformCuts)(req));
});

const agency: AgencyIdentity = { id: "agency-1", name: "Fake Agency", cloneIds: ["c-2", "c-1"], canManage: true };
afterEach(() => __setViewerTermsOverrideForTests(null));

async function keyWith(terms: ViewerTerms, access: AgencyIdentity = agency): Promise<string> {
  __setViewerTermsOverrideForTests(async () => terms);
  return viewerCacheKey(access);
}

test("the same agency, roster and terms give the same key (roster order does not matter)", async () => {
  const a = await keyWith({ starMult: 0.8, usdPerStar: 0.013 });
  const b = await keyWith({ starMult: 0.8, usdPerStar: 0.013 }, { ...agency, cloneIds: ["c-1", "c-2"] });
  assert.equal(a, b);
});

test("a cut change (starMult 0.8 → 0.7) changes the key for the same agency and roster", async () => {
  const a = await keyWith({ starMult: 0.8, usdPerStar: 0.013 });
  const b = await keyWith({ starMult: 0.7, usdPerStar: 0.013 });
  assert.notEqual(a, b);
});

test("a star-rate change (0.013 → 0.02 per star) changes the key for the same agency and roster", async () => {
  const a = await keyWith({ starMult: 0.8, usdPerStar: 0.013 });
  const b = await keyWith({ starMult: 0.8, usdPerStar: 0.02 });
  assert.notEqual(a, b);
});

test("a different roster or manage right changes the key at the same terms", async () => {
  const t = { starMult: 0.8, usdPerStar: 0.013 };
  const base = await keyWith(t);
  assert.notEqual(await keyWith(t, { ...agency, cloneIds: ["c-1"] }), base);
  assert.notEqual(await keyWith(t, { ...agency, canManage: false }), base);
});

test("a different agency id alone (same roster, manage right and terms) changes the key", async () => {
  const t = { starMult: 0.8, usdPerStar: 0.013 };
  assert.notEqual(await keyWith(t, { ...agency, id: "agency-2" }), await keyWith(t));
});

test("the admin (null access) key is the plain admin key, with no terms lookup", async () => {
  __setViewerTermsOverrideForTests(async () => { throw new Error("terms looked up for admin"); });
  assert.equal(await viewerCacheKey(null), "admin");
});

test("wire: after the agency's platform_cuts row changes (20 % → 30 %) and invalidateCutCache(), the key changes", async () => {
  __setViewerTermsOverrideForTests(null);
  platformCuts = [{ agency_id: agency.id, clone_id: null, cut_pct: 20, usd_per_star: null }];
  invalidateCutCache();
  const before = await viewerCacheKey(agency);
  harness(wire.calls("GET /rest/v1/platform_cuts").length >= 1, "the terms lookup read platform_cuts on the wire");
  platformCuts = [{ agency_id: agency.id, clone_id: null, cut_pct: 30, usd_per_star: null }];
  invalidateCutCache();
  const after = await viewerCacheKey(agency);
  assert.notEqual(after, before, `the cut moved 20 % → 30 % but the NET cache key stayed ${before}`);
});
