// KNOWN RED (W5 lib-openrouter-plus6 F1, F10; F2 parked; docs/review/W5/lib-openrouter-plus6.md). MONEY. lib/platform-cut.ts.
// F1: the agency "Creator earnings split" can neither list nor save. listAgencyCreatorCuts/setAgencyCreatorCut read
//     and write through supabaseAdmin, whose fetch is lib/agency-fetch.ts dashboardFetch; their only callers are
//     agencies (app/agency/creator-split/page.tsx:28, actions.ts:44), and the agency path refuses agency_creators
//     (no AGENCY_COLUMNS entry → 403) and any upsert. Controls: the same calls as admin (access null) work, which
//     proves the fake models the routes; and the refusals that must survive the fix (pass today because everything is
//     refused): an agency naming another agency's id never sees that agency's creator in the list, an agency without
//     the manage right lists no rows, and both saves are rejected with zero agency_creator_cuts writes (a list may
//     reject or come back without the leak, either is fine). A fix that swaps in the service client without
//     authorizing turns those controls red.
// F2: payouts terms (lib/payouts/access.ts:28 payoutTerms → creatorTerms) use only the clone's own platform_cuts row,
//     while getCutPctForClone falls back to the owning agency's row. NEEDS OWNER (money): creatorTerms' comment
//     :240-242 says "no fallback" on purpose, the header :9-10 says it falls back. The red is parked as test.skip
//     until the owner rules; its control (a clone's own row → 0.7 on both paths) still runs.
// F10: getCloneRatesFor answers {} (everyone at the login rate, 200 with wrong dollars) for ANY read error whose
//     message mentions usd_per_star, not only the missing-column 42703 it is meant for (stubbed 42501 here). The
//     alternative fix "delete the tolerance once the migration is confirmed applied" turns the 42703 control red: that
//     fix needs a TEST-CHANGE to that control.
// Every test uses its own clone id, and the F10 tests their own agency id, so React cache() memoization in
// platform-cut.ts (termsMemo, cloneRatesMemo; inert outside an RSC render today) can never couple two tests.
// PostgREST faked at the wire (tests/support/postgrest-wire.ts, verbatim from W4; agency-scoped reads via
// tests/support/W5-lib-openrouter-plus6-wire.ts). Any other host throws; an unmodelled request crashes the test.
// Team's Claude owns the fix. Intended runner: init.sh's known-red loop (init.sh:54-56); not wired yet: orchestrator item.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { pgError, refuseFakeError, rowsReply, useWire } from "../support/postgrest-wire";
import { harness, scopedRows } from "../support/W5-lib-openrouter-plus6-wire";
import { getCloneRatesFor, getCutPctForClone, invalidateCutCache, listAgencyCreatorCuts, setAgencyCreatorCut } from "../../lib/platform-cut";
import { withDashboardAccess } from "../../lib/dashboard-access";
import { LYNQ_MANAGEMENT_AGENCY_ID, MOXY_MANAGEMENT_AGENCY_ID } from "../../lib/agency-management-policy";
import { JESS_KATE_PORTAL, TETHER_PORTAL, TOP_ONLYFANS_AGENCY } from "../../lib/partner-portals";
import { payoutTerms, type PayoutViewer } from "../../lib/payouts/access";
import type { AgencyIdentity } from "../../lib/agency-identity";

/** Per-test ids: clone n, an "other" clone n, and a plain (non-manage) agency n. */
const cloneId = (n: number) => `aaaaaaaa-bbbb-4ccc-8ddd-${String(n).padStart(12, "0")}`;
const otherCloneId = (n: number) => `aaaaaaaa-bbbb-4ccc-8ddd-${String(500 + n).padStart(12, "0")}`;
const plainAgencyId = (n: number) => `bbbbbbbb-cccc-4ddd-8eee-${String(n).padStart(12, "0")}`;
// agencyCanManage() is true for these ids (the last two only with canManage true), with no membership row.
const MANAGE_IDS = [LYNQ_MANAGEMENT_AGENCY_ID, JESS_KATE_PORTAL.id, TETHER_PORTAL.id, MOXY_MANAGEMENT_AGENCY_ID, TOP_ONLYFANS_AGENCY.id];
const agencyOf = (id: string, cloneIds: string[], canManage = true): AgencyIdentity => ({ id, name: "Fake Agency", cloneIds, canManage });

let links: Record<string, unknown>[] = [];
let clones: Record<string, unknown>[] = [];
let platformCuts: Record<string, unknown>[] = [];
const wire = useWire((w) => {
  w.on("GET /rest/v1/agency_creators", (req) => scopedRows(links)(req));
  w.on("GET /rest/v1/clones", (req) => scopedRows(clones)(req));
  w.on("GET /rest/v1/agency_creator_cuts", scopedRows([]));
  w.on("POST /rest/v1/agency_creator_cuts", () => ({ status: 201 }));
  w.on("PATCH /rest/v1/agency_creator_cuts", () => ({ status: 204 }));
  w.on("GET /rest/v1/platform_cuts", (req) => rowsReply(platformCuts)(req));
});
beforeEach(() => {
  invalidateCutCache();
  links = [];
  clones = [];
  platformCuts = [];
});
/** agencyId owns clone c (agency_creators row + clones row). */
function owns(agencyId: string, c: string, usdPerStar: number | null = null) {
  links.push({ agency_id: agencyId, clone_id: c, usd_per_star: usdPerStar });
  clones.push({ id: c, name: `Creator ${c.slice(-3)}` });
}
const settle = <T>(p: Promise<T>) => p.then((v) => ({ ok: true as const, v }), (e: unknown) => ({ ok: false as const, e }));
const cutWrites = () => [...wire.calls("POST /rest/v1/agency_creator_cuts"), ...wire.calls("PATCH /rest/v1/agency_creator_cuts")];
const why = (r: { ok: boolean; e?: unknown }) => (r.ok ? "resolved" : `rejected: ${String((r.e as Error)?.message ?? r.e)}`);

// ── F1 ──────────────────────────────────────────────────────────────────────
test("control: F1 as admin (access null) the creator split lists the agency's creator", async () => {
  const c = cloneId(1);
  owns(MANAGE_IDS[0], c);
  const rows = await withDashboardAccess(null, () => listAgencyCreatorCuts(MANAGE_IDS[0]));
  assert.deepEqual(rows.map((r) => r.cloneId), [c]);
});

test("control: F1 as admin (access null) saving a 10 % creator cut writes agency_creator_cuts", async () => {
  const c = cloneId(2);
  owns(MANAGE_IDS[1], c);
  await withDashboardAccess(null, () => setAgencyCreatorCut(MANAGE_IDS[1], c, 10, "t"));
  assert.equal(cutWrites().length, 1);
});

test("control: F1 an agency listing ANOTHER agency's creator split never sees that agency's creator", async () => {
  const mine = cloneId(5), theirs = otherCloneId(5), other = plainAgencyId(5);
  owns(MANAGE_IDS[0], mine);
  owns(other, theirs);
  const r = await settle(withDashboardAccess(agencyOf(MANAGE_IDS[0], [mine]), () => listAgencyCreatorCuts(other)));
  assert.ok(!r.ok || !r.v.some((x) => x.cloneId === theirs), `listed another agency's creator: ${JSON.stringify(r.ok ? r.v : null)}`);
});

test("control: F1 an agency saving a cut on ANOTHER agency's creator is refused and writes nothing", async () => {
  const mine = cloneId(6), theirs = otherCloneId(6), other = plainAgencyId(6);
  owns(MANAGE_IDS[3], mine);
  owns(other, theirs);
  const r = await settle(withDashboardAccess(agencyOf(MANAGE_IDS[3], [mine]), () => setAgencyCreatorCut(other, theirs, 10, "t")));
  assert.equal(cutWrites().length, 0, `a write reached agency_creator_cuts for another agency (save ${why(r)})`);
  assert.equal(r.ok, false);
});

test("control: F1 an agency WITHOUT the manage right lists no creator split rows", async () => {
  const c = cloneId(7), plain = plainAgencyId(7);
  owns(plain, c);
  const r = await settle(withDashboardAccess(agencyOf(plain, [c], false), () => listAgencyCreatorCuts(plain)));
  assert.ok(!r.ok || r.v.length === 0, `a non-manage agency listed its creator split: ${JSON.stringify(r.ok ? r.v : null)}`);
});

test("control: F1 an agency WITHOUT the manage right cannot save a cut and writes nothing", async () => {
  const c = cloneId(8), plain = plainAgencyId(8);
  owns(plain, c);
  const r = await settle(withDashboardAccess(agencyOf(plain, [c], false), () => setAgencyCreatorCut(plain, c, 10, "t")));
  assert.equal(cutWrites().length, 0, `a non-manage agency wrote agency_creator_cuts (save ${why(r)})`);
  assert.equal(r.ok, false);
});

test("F1: a manage-capable agency sees its own creator on the creator split page", async () => {
  const c = cloneId(3);
  owns(MANAGE_IDS[2], c);
  const r = await settle(withDashboardAccess(agencyOf(MANAGE_IDS[2], [c]), () => listAgencyCreatorCuts(MANAGE_IDS[2])));
  if (!r.ok) refuseFakeError(r.e);
  assert.ok(r.ok, `listAgencyCreatorCuts for the owning agency ${why(r)}`);
  assert.deepEqual(r.v.map((x) => x.cloneId), [c]);
});

test("F1: a manage-capable agency saving a 10 % cut on its own creator reaches agency_creator_cuts", async () => {
  const c = cloneId(4);
  owns(MANAGE_IDS[4], c);
  const r = await settle(withDashboardAccess(agencyOf(MANAGE_IDS[4], [c]), () => setAgencyCreatorCut(MANAGE_IDS[4], c, 10, "t")));
  if (!r.ok) refuseFakeError(r.e);
  assert.equal(cutWrites().length, 1, `no write reached agency_creator_cuts; save ${why(r)}`);
  assert.ok(r.ok);
});

// ── F2 (parked: needs owner) ────────────────────────────────────────────────
const viewer: PayoutViewer = { audience: "admin", cloneIds: null, canManage: true, actor: "internal-admin", brand: "twin" };

async function bothTerms(c: string) {
  const pct = await withDashboardAccess(null, () => getCutPctForClone(c));
  invalidateCutCache();
  const terms = await withDashboardAccess(null, () => payoutTerms(c, viewer));
  return { platformMult: 1 - pct / 100, payoutMult: terms.starMult };
}

test("control: F2 a clone with its own 30 % row gets 0.7 on payouts and from getCutPctForClone", async () => {
  const c = cloneId(9);
  platformCuts = [{ agency_id: null, clone_id: c, cut_pct: 30, usd_per_star: null }];
  const t = await bothTerms(c);
  assert.ok(Math.abs(t.platformMult - 0.7) < 1e-9, `platform ${t.platformMult}`);
  assert.ok(Math.abs(t.payoutMult - 0.7) < 1e-9, `payout ${t.payoutMult}`);
});

test.skip("NEEDS OWNER F2: a clone with no row of its own under an agency at 30 % is credited the same multiplier on payouts as its platform cut (0.7)"
  + " (skipped: creatorTerms' 'no fallback' (platform-cut.ts:240-242) vs the header's fallback order (:9-10) is an owner money decision)", async () => {
  const c = cloneId(10), a = plainAgencyId(10);
  owns(a, c);
  platformCuts = [{ agency_id: a, clone_id: null, cut_pct: 30, usd_per_star: null }];
  const t = await bothTerms(c);
  harness(Math.abs(t.platformMult - 0.7) < 1e-9, `getCutPctForClone falls back to the agency row (${t.platformMult})`);
  assert.ok(Math.abs(t.payoutMult - t.platformMult) < 1e-9,
    `payouts credit ${t.payoutMult} × gross, the clone's platform cut leaves ${t.platformMult} × gross`);
});

// ── F10 ─────────────────────────────────────────────────────────────────────
test("control: F10 a valid read returns the agency's per-creator rate", async () => {
  const c = cloneId(11), a = plainAgencyId(11);
  owns(a, c, 0.02);
  assert.deepEqual(await getCloneRatesFor(agencyOf(a, [c], false)), { [c]: 0.02 });
});

test("control: F10 a missing usd_per_star column (42703, migration not applied) degrades to the login rate", async () => {
  const c = cloneId(12), a = plainAgencyId(12);
  wire.on("GET /rest/v1/agency_creators", () => pgError(400, "42703", "column agency_creators.usd_per_star does not exist"));
  assert.deepEqual(await getCloneRatesFor(agencyOf(a, [c], false)), {});
});

test("F10: a permission error (42501) on the usd_per_star read fails, never silently drops the negotiated rates", async () => {
  const c = cloneId(13), a = plainAgencyId(13);
  wire.on("GET /rest/v1/agency_creators", () => pgError(403, "42501", "permission denied for column usd_per_star"));
  const r = await settle(getCloneRatesFor(agencyOf(a, [c], false)));
  assert.equal(r.ok, false, `resolved ${JSON.stringify(r.ok ? r.v : null)}: the negotiated per-creator rate silently became the login rate`);
});
