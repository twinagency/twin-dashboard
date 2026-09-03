// ── Checks for the Twin public API (app/api/v1/*) and the sim endpoints ──────
// Run:  npm run test:public
//
// THE CHECK THAT MATTERS IS TENANT ISOLATION. Everything else here is hygiene.
// A key belongs to one model; if any path lets it see another model's revenue,
// fans or messages, the whole product is unshippable. That is asserted three
// ways: the projection, the query construction, and the route signatures.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  hashKey,
  keyPrefix,
  digestsEqual,
  rateLimit,
  _resetRateLimits,
  presentedKey,
  tenantFromRow,
  RATE_LIMIT_PER_MINUTE,
} from "../lib/api-tenant";
import {
  projectRevenue,
  projectFleetRevenue,
  clampFanLimit,
  PUBLIC_FAN_COLUMNS,
  PUBLIC_FLEET_FAN_COLUMNS,
  NEVER_PUBLIC,
  MAX_FAN_LIMIT,
} from "../lib/api-public";
import { validateKeyRequest } from "../lib/api-keys-admin";
import { simRevenue, simFans, seedFrom } from "../lib/api-sim";
import { generateKey } from "../lib/api-keys-admin";
import type { AnalyticsData } from "../lib/analytics-data";

let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}\n      ${e instanceof Error ? e.message : String(e)}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function eq(a: unknown, b: unknown, what: string): void {
  if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function sourceCode(p: string | URL): string {
  return readFileSync(p, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}
function publicRouteFiles(): string[] {
  const root = new URL("../app/api/v1/", import.meta.url).pathname;
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((e) => {
      const p = join(dir, e);
      return statSync(p).isDirectory() ? walk(p) : e === "route.ts" ? [p] : [];
    });
  return walk(root);
}

// A realistic getAnalytics() return, including everything a model must NOT see.
const ANALYTICS = {
  period: "1M",
  totals: { revenueStars: 5000, costUsd: 12.34, profitUsd: 40.1, sales: 80, fans: 120, buyers: 30 },
  clones: [
    { id: "c1", name: "Model A", color: "#111", revenueStars: 5000, costUsd: 12.34, profitUsd: 40.1, sales: 80, margin: 0.76 },
    { id: "c2", name: "Model B", color: "#222", revenueStars: 9999, costUsd: 50, profitUsd: 200, sales: 300, margin: 0.9 },
  ],
  byKind: [{ key: "credits", label: "Message credits", stars: 3000, sales: 50, share: 0.6 }],
  byFeature: [{ key: "photo", label: "Photos", stars: 2000, sales: 30, avgStars: 66, share: 0.4 }],
  paywallFunnel: { collecting: false, messaged: 100, paywalled: 60, purchased: 20, paywallPct: 0.6, purchasePct: 0.33 },
  byFlow: [{ key: "classic", label: "Classic", clones: 2, stars: 5000, costUsd: 12.34, profitUsd: 40.1, sales: 80, share: 1 }],
  byDay: [{ label: "2026-08-01", stars: 100 }],
  byHour: [{ hour: 20, label: "8 PM", stars: 100 }],
  byDow: [{ dow: 1, label: "Mon", stars: 100 }],
  byTier: [{ key: "whale", label: "Whale", users: 2, stars: 4000, share: 0.8 }],
  funnel: { fans: 120, buyers: 30, repeat: 10, buyerPct: 0.25, repeatPct: 0.33 },
} as unknown as AnalyticsData;

// Every string appearing anywhere in a nested payload.
function deepKeys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => deepKeys(x, out));
  else if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v)) {
      out.add(k);
      deepKeys(val, out);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// A. WHAT A MODEL MAY SEE — the projection
// ─────────────────────────────────────────────────────────────────────────────

check("A1 our AI cost never reaches a model", () => {
  const keys = deepKeys(projectRevenue(ANALYTICS, null));
  for (const banned of ["costUsd", "cost_usd", "profitUsd", "margin"]) {
    assert(!keys.has(banned), `${banned} is in the model-facing payload`);
  }
});

check("A2 the fleet-wide per-clone breakdown never reaches a model", () => {
  const p = projectRevenue(ANALYTICS, null) as unknown as Record<string, unknown>;
  assert(!("clones" in p), "the per-clone array (every other model's revenue) is exposed");
  assert(!("byFlow" in p), "byFlow carries costUsd and the fleet's classic/smart split");
  const s = JSON.stringify(p);
  assert(!s.includes("Model B"), "another model's name appears in the payload");
  assert(!s.includes("9999"), "another model's revenue appears in the payload");
});

check("A3 the projection is an allowlist, so a new upstream field is withheld by default", () => {
  const withNewField = {
    ...ANALYTICS,
    totals: { ...ANALYTICS.totals, secretNewMetric: 42 },
    somethingAddedLater: { internal: true },
  } as unknown as AnalyticsData;
  const keys = deepKeys(projectRevenue(withNewField, null));
  assert(!keys.has("secretNewMetric"), "a field added to totals upstream leaked straight through");
  assert(!keys.has("somethingAddedLater"), "a field added upstream leaked straight through");
});

check("A4 the numbers a model SHOULD see do survive the projection", () => {
  const p = projectRevenue(ANALYTICS, null);
  eq(p.totals.revenueStars, 5000, "revenueStars");
  eq(p.totals.buyers, 30, "buyers");
  eq(p.byKind[0].stars, 3000, "byKind");
  eq(p.funnel.repeat, 10, "funnel");
  eq(p.byTier[0].users, 2, "byTier");
});

check("A5 no fan field is a credential or a prompt blob", () => {
  for (const banned of NEVER_PUBLIC) {
    assert(!(PUBLIC_FAN_COLUMNS as readonly string[]).includes(banned), `${banned} is in PUBLIC_FAN_COLUMNS`);
  }
});

check("A6 chat content is not a public fan field", () => {
  for (const banned of ["content", "chat_history", "summary", "details", "preferences"]) {
    assert(!(PUBLIC_FAN_COLUMNS as readonly string[]).includes(banned), `${banned} exposes conversation content`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// B. TENANT ISOLATION — the boundary itself
// ─────────────────────────────────────────────────────────────────────────────

check("B1 the fan query filters on clone_id, and not from a parameter", () => {
  const src = sourceCode(new URL("../lib/api-public.ts", import.meta.url));
  assert(src.includes('.eq("clone_id", cloneId)'), "publicFans must filter on the key's clone_id");
  assert(!/searchParams|params\.get/.test(src), "the projection layer must never read request parameters");
});

check("B2 no public route accepts a clone parameter", () => {
  for (const p of publicRouteFiles()) {
    const src = sourceCode(p);
    assert(
      !/params\.get\(\s*["'](clone|clone_id|cloneId)["']\s*\)/.test(src),
      `${p} reads a clone parameter — tenancy must come from the key alone`,
    );
  }
});

check("B3 a clone parameter is REJECTED rather than ignored", () => {
  const src = sourceCode(new URL("../lib/api-public-route.ts", import.meta.url));
  assert(src.includes('params.has("clone")'), "withModelKey must reject ?clone= explicitly");
  // The rejection must produce a 400. Matching the bare status rather than a
  // call shape, because argument formatting is not the thing under test.
  const rejection = src.slice(src.indexOf('params.has("clone")'));
  assert(/\b400\b/.test(rejection.slice(0, 400)), "rejecting it must be an error, not a silent drop");
});

check("B4 every public route is wrapped in withModelKey", () => {
  const routes = publicRouteFiles();
  assert(routes.length >= 3, `expected the public endpoint set, found ${routes.length}`);
  for (const p of routes) {
    const src = sourceCode(p);
    assert(
      /export const GET = withModelKey\(/.test(src),
      `${p} is not wrapped in withModelKey — it is an unauthenticated public endpoint`,
    );
  }
});

check("B5 the public API is read-only and exposes no chat transcripts", () => {
  for (const p of publicRouteFiles()) {
    const src = sourceCode(p);
    for (const verb of ["POST", "PUT", "PATCH", "DELETE"]) {
      assert(!src.includes(`export const ${verb}`), `${p} exports ${verb}`);
    }
    assert(!src.includes("chat_history"), `${p} reaches chat_history — transcripts are internal only`);
  }
});

check("B6 the handler signature hands over a tenant, not a raw request only", () => {
  const src = sourceCode(new URL("../lib/api-public-route.ts", import.meta.url));
  assert(src.includes("tenant: Tenant"), "withModelKey must pass the resolved tenant to the handler");
});

// ─────────────────────────────────────────────────────────────────────────────
// C. KEYS
// ─────────────────────────────────────────────────────────────────────────────

check("C1 a key is stored as a sha256 digest, never in plaintext", () => {
  const key = "abcdefghijklmnopqrstuvwxyz012345";
  const h = hashKey(key);
  eq(h.length, 64, "sha256 hex length");
  assert(!h.includes(key), "the digest must not contain the key");
  eq(hashKey(key), h, "hashing is deterministic");
  assert(hashKey(key + "x") !== h, "a different key gives a different digest");
});

check("C2 the stored prefix is too short to be useful to a guesser", () => {
  const key = "abcdefghijklmnopqrstuvwxyz012345";
  eq(keyPrefix(key), "abcdefgh", "prefix");
  eq(keyPrefix(key).length, 8, "prefix length");
});

check("C3 digest comparison rejects mismatches, including length mismatches", () => {
  const a = hashKey("one");
  assert(digestsEqual(a, hashKey("one")), "equal digests must match");
  assert(!digestsEqual(a, hashKey("two")), "different digests must not match");
  assert(!digestsEqual(a, a.slice(0, 10)), "a length mismatch must not throw or match");
});

check("C4 resolveKey only ever matches live keys", () => {
  const src = sourceCode(new URL("../lib/api-tenant.ts", import.meta.url));
  assert(src.includes('.is("revoked_at", null)'), "the lookup must exclude revoked keys");
  assert(src.includes("if (data.revoked_at) return null"), "and re-check after fetching");
});

check("C5 the key is never read from a query string", () => {
  eq(presentedKey(new Headers({})), null, "no header, no key");
  const src = sourceCode(new URL("../lib/api-tenant.ts", import.meta.url));
  assert(!/searchParams/.test(src), "a key in a URL lands in access logs and browser history");
});

check("C6 rate limiting admits a normal caller and stops a render loop", () => {
  _resetRateLimits();
  const t = 1_000_000;
  for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) {
    assert(rateLimit("k1", t).allowed, `request ${i + 1} should be allowed`);
  }
  assert(!rateLimit("k1", t).allowed, "the request past the limit must be refused");
});

check("C7 the rate limit is per key, so one caller cannot starve another", () => {
  _resetRateLimits();
  const t = 2_000_000;
  for (let i = 0; i < RATE_LIMIT_PER_MINUTE + 5; i++) rateLimit("noisy", t);
  assert(rateLimit("quiet", t).allowed, "a second key must be unaffected");
});

check("C8 the window resets", () => {
  _resetRateLimits();
  const t = 3_000_000;
  for (let i = 0; i < RATE_LIMIT_PER_MINUTE + 5; i++) rateLimit("k2", t);
  assert(!rateLimit("k2", t).allowed, "still limited inside the window");
  assert(rateLimit("k2", t + 60_001).allowed, "allowed again after the window");
});

check("C9 fan limits are capped", () => {
  eq(clampFanLimit(999_999), MAX_FAN_LIMIT, "cap");
  eq(clampFanLimit(-1), 100, "default");
  eq(clampFanLimit("nonsense"), 100, "default");
});

// ─────────────────────────────────────────────────────────────────────────────
// D. THE SIM SURFACE — its safety property is that it touches nothing
// ─────────────────────────────────────────────────────────────────────────────

check("D1 the generator never touches the database", () => {
  const src = sourceCode(new URL("../lib/api-sim.ts", import.meta.url));

  // Assert the PROPERTY (it has no database client) rather than scanning for
  // suspicious substrings. Two earlier attempts here were false positives —
  // "from(" matched the helper `seedFrom(`, then ".from(" matched
  // `Array.from(`. A check that cries wolf trains people to ignore it, and
  // the import list is both stricter and unambiguous: a module that imports
  // no client cannot reach the database, whatever its call sites look like.
  const imports = [...src.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  for (const spec of imports) {
    assert(
      !/supabase/i.test(spec),
      `api-sim.ts imports "${spec}" — the generator must read and write nothing`,
    );
  }
  // Type-only imports are erased at runtime, so the ones it does have are fine;
  // what must not exist is a value import of a client.
  assert(!/\bcreateClient\b/.test(src), "api-sim.ts constructs a database client");
  assert(!/\bsupabaseAdmin\b/.test(src), "api-sim.ts references the admin client");
});

check("D2 the sim routes never touch the database either", () => {
  for (const p of ["revenue", "fans"]) {
    const src = sourceCode(new URL(`../app/api/admin/v1/sim/${p}/route.ts`, import.meta.url));
    assert(!src.includes("supabaseAdmin"), `sim/${p} must not reach Supabase`);
    for (const w of [".insert(", ".update(", ".upsert(", ".delete("]) {
      assert(!src.includes(w), `sim/${p} must never write`);
    }
  }
});

check("D3 sim output is deterministic for a given seed", () => {
  const now = 1_800_000_000_000;
  const a = JSON.stringify(simRevenue(7, "1M", now));
  const b = JSON.stringify(simRevenue(7, "1M", now));
  eq(a, b, "same seed, same payload");
  assert(a !== JSON.stringify(simRevenue(8, "1M", now)), "a different seed gives different data");
});

check("D4 a string seed works and is stable", () => {
  eq(seedFrom("kait"), seedFrom("kait"), "same string, same seed");
  assert(seedFrom("kait") !== seedFrom("cat"), "different strings, different seeds");
  assert(seedFrom(null) > 0, "a missing seed still produces a usable one");
});

check("D5 sim revenue matches the real payload's shape exactly", () => {
  const real = new Set(Object.keys(projectRevenue(ANALYTICS, null)));
  const sim = new Set(Object.keys(simRevenue(1, "1M", Date.now())));
  for (const k of real) assert(sim.has(k), `sim payload is missing "${k}" — a dashboard would break on repoint`);
  for (const k of sim) assert(real.has(k), `sim payload has extra key "${k}" that the real endpoint never returns`);
});

check("D6 sim fans match the public fan field set exactly", () => {
  const f = simFans(3, 5, Date.now()).fans[0];
  const keys = new Set(Object.keys(f));
  for (const c of PUBLIC_FAN_COLUMNS) assert(keys.has(c), `sim fan is missing "${c}"`);
  for (const k of keys) {
    assert((PUBLIC_FAN_COLUMNS as readonly string[]).includes(k), `sim fan has extra field "${k}"`);
  }
});

check("D7 sim breakdowns add up to the sim total", () => {
  const r = simRevenue(11, "1M", Date.now());
  const kind = r.byKind.reduce((a, b) => a + b.stars, 0);
  const feature = r.byFeature.reduce((a, b) => a + b.stars, 0);
  eq(kind, r.totals.revenueStars, "byKind must sum to the total");
  eq(feature, r.totals.revenueStars, "byFeature must sum to the total");
});

check("D8 every simulated fan is visibly fake", () => {
  for (const f of simFans(5, 25, Date.now()).fans) {
    assert(String(f.name).includes("(sim)"), `a sim fan is named "${f.name}" with no marker`);
    assert(String(f.username).startsWith("sim_fan_"), "a sim username must be unmistakable");
  }
});

check("D9 sim responses are labelled as synthetic in the route, not just by path", () => {
  for (const p of ["revenue", "fans"]) {
    const src = sourceCode(new URL(`../app/api/admin/v1/sim/${p}/route.ts`, import.meta.url));
    assert(src.includes("simulated: true"), `sim/${p} must mark its payload simulated`);
    assert(src.includes("warning"), `sim/${p} must carry a warning in the payload`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// F. THE MIDDLEWARE MUST NOT EAT THE API
//
// A real bug, and the nastiest kind: invisible in every environment I tested
// in. middleware.ts's matcher covers /api/*, and in PRODUCTION it redirects
// anything without a dashboard session cookie to /login. An API caller carries
// a bearer key, not a cookie, so both APIs returned a 307 and an HTML login
// page instead of data. Every test ran against a dev server, where that block
// returns early — so nothing caught it until someone asked whether the creator
// API actually works from the open internet.
//
// The lesson is narrow and worth keeping: I checked that the routes don't TRUST
// the middleware, and never checked that the middleware doesn't BREAK the
// routes. Same seam, opposite direction.
// ─────────────────────────────────────────────────────────────────────────────

check("F1 middleware exempts the self-authenticating API prefixes", () => {
  const src = sourceCode(new URL("../middleware.ts", import.meta.url));
  assert(src.includes('"/api/v1/"'), "the creator API must be exempt from the session-cookie gate");
  assert(src.includes('"/api/admin/"'), "the admin API must be exempt from the session-cookie gate");
});

check("F2 the exemption uses trailing slashes, so it cannot match a sibling path", () => {
  const src = sourceCode(new URL("../middleware.ts", import.meta.url));
  assert(!/"\/api\/v1"[,\s\]]/.test(src), '"/api/v1" without a trailing slash would also match "/api/v1x"');
  assert(!/"\/api\/admin"[,\s\]]/.test(src), '"/api/admin" without a trailing slash would also match a sibling');
});

check("F3 the exemption is checked BEFORE the NODE_ENV bypass", () => {
  // Otherwise the rule differs between dev and production, and testing locally
  // says nothing about what the boxes will do — which is exactly how this bug
  // survived.
  const src = sourceCode(new URL("../middleware.ts", import.meta.url));
  const exemption = src.indexOf("SELF_AUTHENTICATED_PREFIXES.some");
  const bypass = src.indexOf("NODE_ENV");
  assert(exemption > 0, "the exemption must exist");
  assert(bypass > 0, "the dev bypass is expected to still be there");
  assert(exemption < bypass, "the API exemption must run before the dev bypass, so it behaves the same everywhere");
});

check("F4 no OTHER route is exempted from the login gate", () => {
  const src = sourceCode(new URL("../middleware.ts", import.meta.url));
  const list = /SELF_AUTHENTICATED_PREFIXES\s*=\s*\[([^\]]*)\]/.exec(src);
  assert(list, "the exemption list must be a single readable array");
  const entries = [...list[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  eq(entries.length, 2, "exactly two prefixes may skip the login gate");
  // /api/dashboard and friends still rely on the cookie gate; quietly adding
  // one here would expose an internal endpoint to the internet.
  for (const e of entries) {
    assert(["/api/v1/", "/api/admin/"].includes(e), `unexpected exempt prefix: ${e}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// E. KEY MANAGEMENT — the dashboard page and the CLI must be one thing
// ─────────────────────────────────────────────────────────────────────────────

check("E1 generated keys are long, unique and URL-safe", () => {
  const a = generateKey();
  const b = generateKey();
  eq(a.length, 43, "43 chars from 32 base64url bytes");
  assert(a !== b, "two keys must differ");
  assert(/^[A-Za-z0-9_-]+$/.test(a), "must be URL-safe with no padding");
});

check("E2 the CLI and the dashboard mint keys the same way", () => {
  const cli = sourceCode(new URL("../scripts/issue-api-key.ts", import.meta.url));
  assert(cli.includes("generateKey"), "the CLI must use the shared generator");
  assert(!cli.includes("randomBytes"), "a second generator in the CLI will drift from the UI's");
});

check("E3 revocation is an update, never a delete, so keys stay auditable", () => {
  const src = sourceCode(new URL("../lib/api-keys-admin.ts", import.meta.url));
  assert(!src.includes(".delete("), "revoking must not delete the row");
  assert(src.includes('.is("revoked_at", null)'), "only live keys may be revoked, so a second revoke is a no-op");
});

check("E4 the plaintext key is hashed before it reaches the database", () => {
  const src = sourceCode(new URL("../lib/api-keys-admin.ts", import.meta.url));
  assert(src.includes("key_hash: hashKey(key)"), "the insert must store the hash");
  assert(!/key_plain|key_value|key:\s*key\b/.test(src), "the plaintext key must never be a stored column");
});

check("E5 issuing a key does not write the key into the log", () => {
  const src = sourceCode(new URL("../app/api-access/actions.ts", import.meta.url));
  assert(src.includes("system_logs"), "issuance should be recorded");
  assert(!/message:.*result\.key|detail:.*result\.key/.test(src), "the credential must never reach system_logs");
  assert(!/\bconsole\.(log|error)\s*\([^)]*key\b/.test(src), "the credential must never be console-logged");
});

check("E6 the UI never renders a key hash", () => {
  for (const f of ["KeyManager.tsx", "page.tsx", "ApiDocs.tsx"]) {
    const src = sourceCode(new URL(`../app/api-access/${f}`, import.meta.url));
    assert(!src.includes("key_hash"), `${f} references key_hash`);
  }
});

check("E7 the docs render from the same constants the API enforces", () => {
  const src = sourceCode(new URL("../app/api-access/ApiDocs.tsx", import.meta.url));
  // A hand-typed field list would drift from lib/api-public.ts silently, and
  // docs are exactly the artefact nobody re-reads to check.
  //
  // Assert the constant is RENDERED, not merely imported. The first version of
  // this check looked for the identifier anywhere in the file and passed
  // happily when the render was swapped for a hardcoded array, because the now
  // unused import still contained the name.
  assert(/PUBLIC_FAN_COLUMNS\.map\(/.test(src), "the fan field list must be rendered from the constant");
  assert(/\{RATE_LIMIT_PER_MINUTE\}/.test(src), "the rate limit must be rendered from the constant");
  // And nothing may render a literal list of field-shaped strings beside it.
  assert(
    !/\[\s*"telegram_id"/.test(src),
    "a hardcoded fan field list will drift from the API the first time one is edited and not the other",
  );
});

check("E8 the docs describe the endpoints that actually exist", () => {
  const docs = sourceCode(new URL("../app/api-access/ApiDocs.tsx", import.meta.url));
  const routes = publicRouteFiles().map((p) => p.split("/api/v1/")[1].replace("/route.ts", ""));
  for (const r of routes) {
    assert(docs.includes(`/api/v1/${r}`), `the docs never mention /api/v1/${r}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// G. FLEET KEYS (migration 127) — a wider key must not be a deeper one
//
// The whole risk of this feature in one sentence: widening a key from one girl
// to ten must not also widen it from revenue to profit. Section A already
// proves the per-clone projection withholds our cost; these prove the FLEET
// projection withholds it too, per model, where the temptation to just pass
// a.clones straight through is strongest.
// ─────────────────────────────────────────────────────────────────────────────

check("G1 a fleet key still never sees our AI cost, margin or profit", () => {
  const keys = deepKeys(projectFleetRevenue(ANALYTICS, null));
  for (const banned of ["costUsd", "cost_usd", "profitUsd", "margin"]) {
    assert(!keys.has(banned), `${banned} is in the FLEET payload`);
  }
});

check("G2 the per-model breakdown carries revenue only, never our margin on her", () => {
  const p = projectFleetRevenue(ANALYTICS, null);
  eq(p.scope, "fleet", "scope must be stated in the body so a client can branch on it");
  eq(p.models.length, 2, "every clone must appear");
  eq(p.models[0].revenueStars, 5000, "revenueStars must survive");
  eq(p.models[1].name, "Model B", "the other model IS visible to a fleet key, on purpose");
  for (const m of p.models) {
    const got = Object.keys(m).sort().join(",");
    eq(
      got,
      "id,name,revenueAud,revenueStars,revenueUsd,sales",
      "the per-model shape must be exactly these six fields",
    );
  }
});

check("G3 the fleet projection is an allowlist too, so a new upstream field is withheld", () => {
  const withNewField = {
    ...ANALYTICS,
    clones: ANALYTICS.clones.map((c) => ({ ...c, secretPerGirlMetric: 42 })),
  } as unknown as AnalyticsData;
  const keys = deepKeys(projectFleetRevenue(withNewField, null));
  assert(!keys.has("secretPerGirlMetric"), "a field added to clones[] upstream leaked straight through");
});

check("G4 a fleet row that still names a clone is REFUSED, not read as either one", () => {
  // The half-migrated / tampered row. Reading it as "fleet" would honour a
  // widening the constraint was supposed to prevent; reading it as "clone"
  // would silently ignore a stated scope. Refusing is the only safe answer.
  assert(tenantFromRow({ id: "k", clone_id: "c1", scope: "fleet", label: "x" }) === null, "accepted a fleet row with a clone_id");
  assert(tenantFromRow({ id: "k", clone_id: null, scope: "clone", label: "x" }) === null, "accepted a clone row with no clone_id");
});

check("G5 an unknown, missing or empty scope can only ever NARROW", () => {
  // The direction that matters. A corrupted scope must never resolve to fleet.
  for (const scope of [null, undefined, "", "FLEET", "fleet ", "admin", "0"]) {
    const t = tenantFromRow({ id: "k", clone_id: null, scope, label: "x" });
    assert(t === null || (t as { scope: string }).scope !== "fleet", `scope ${JSON.stringify(scope)} widened to fleet`);
  }
  // And the same value with a clone_id present must resolve to that clone only.
  const t = tenantFromRow({ id: "k", clone_id: "c1", scope: "wat", label: "x" });
  assert(t === null, "an unknown scope with a clone_id must be refused rather than assumed");
  eq(tenantFromRow({ id: "k", clone_id: "c1", scope: null, label: "x" })?.scope, "clone", "a null scope is a clone key");
});

check("G6 the two legal rows resolve to exactly the two legal tenants", () => {
  const c = tenantFromRow({ id: "k1", clone_id: "c1", scope: "clone", label: "one girl" });
  eq(c?.scope, "clone", "clone scope");
  eq(c?.cloneId, "c1", "clone id");
  const f = tenantFromRow({ id: "k2", clone_id: null, scope: "fleet", label: "everyone" });
  eq(f?.scope, "fleet", "fleet scope");
  eq(f?.cloneId, null, "a fleet tenant must carry no clone id at all");
});

check("G7 a fleet key cannot be minted by leaving the model out", () => {
  // "fleet" must be ASKED FOR. An empty or missing model must be an error, not
  // a silent widening into the broadest credential the system issues.
  assert(validateKeyRequest(null, "no model picked", "clone").ok === false, "an empty model minted a key");
  assert(validateKeyRequest("", "empty string", "clone").ok === false, "an empty string model minted a key");
  assert(validateKeyRequest("c1", "both", "fleet").ok === false, "a fleet key was allowed to also name a model");
  // And the two legal requests are still accepted, or the guard is just broken.
  assert(validateKeyRequest("c1", "her dashboard", "clone").ok === true, "a normal per-model key was refused");
  assert(validateKeyRequest(null, "lovable", "fleet").ok === true, "a legitimate fleet key was refused");
});

check("G8 the unfiltered fan query exists once and is reached only behind a fleet check", () => {
  const src = sourceCode(new URL("../lib/api-public.ts", import.meta.url));
  // publicFans keeps its filter. That is section B1's property and must survive.
  assert(src.includes('.eq("clone_id", cloneId)'), "publicFans lost its clone_id filter");
  // There must be exactly ONE function that reads users without that filter.
  const unfiltered = src.split("export async function").filter((f) => f.includes('.from("users")') && !f.includes('.eq("clone_id"'));
  eq(unfiltered.length, 1, "there must be exactly one unfiltered fan query, and it must be the fleet one");
  assert(unfiltered[0].startsWith(" publicFleetFans"), "the unfiltered fan query is not publicFleetFans");

  // And the route must gate it on the key's scope, not on anything from the request.
  const route = sourceCode(new URL("../app/api/v1/fans/route.ts", import.meta.url));
  assert(/tenant\.scope === "fleet"/.test(route), "the fans route must branch on tenant.scope");
  assert(!/params\.get\(\s*["']scope["']/.test(route), "scope must never be read from the request");
});

check("G9 the fleet fan columns are the per-clone set plus clone_id, and nothing else", () => {
  const extra = (PUBLIC_FLEET_FAN_COLUMNS as readonly string[]).filter(
    (c) => !(PUBLIC_FAN_COLUMNS as readonly string[]).includes(c),
  );
  eq(extra.join(","), "clone_id", "a fleet key must gain clone_id and no other field");
  for (const banned of NEVER_PUBLIC) {
    assert(!(PUBLIC_FLEET_FAN_COLUMNS as readonly string[]).includes(banned), `${banned} is in the fleet fan columns`);
  }
});

check("G10 the public revenue path never runs the cost rollup it cannot return", () => {
  // This is the 500 that started all of this: revenue_usage_rollup timing out
  // (code 57014) on an endpoint contractually forbidden from returning its
  // result. If a future edit drops includeCost:false, the timeout comes back.
  const src = sourceCode(new URL("../lib/api-public.ts", import.meta.url));
  const calls = src.match(/getAnalytics\([^)]*\)/g) ?? [];
  assert(calls.length >= 2, `expected both public revenue paths to call getAnalytics, found ${calls.length}`);
  for (const c of calls) {
    assert(/includeCost:\s*false/.test(c), `a public getAnalytics call does not pass includeCost:false: ${c}`);
  }
});

check("G11 the docs on the page describe both kinds of key", () => {
  const docs = sourceCode(new URL("../app/api-access/ApiDocs.tsx", import.meta.url));
  assert(/All models/.test(docs), "the docs never mention the All models key");
  assert(/scope/.test(docs), "the docs never tell a caller how to find out which key it holds");
  assert(/clone_id/.test(docs), "the docs never mention the extra fan field a fleet key gets");
});

// ─────────────────────────────────────────────────────────────────────────────

const total = passed + failures.length;
if (failures.length) {
  console.error(`\n  ${failures.length} of ${total} CHECKS FAILED\n`);
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  process.exit(1);
}
console.log(`\n  ALL ${total} CHECKS PASSED\n`);
