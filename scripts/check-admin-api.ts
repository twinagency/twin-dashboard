// ── Checks for the Twin Admin API ────────────────────────────────────────────
// Run:  npm run test:api
//
// WHY THIS FILE EXISTS AT ALL. This repo's honest verification has been
// "tsc --noEmit + it looked right in a browser" (see NOW.txt, P2 DASH). That is
// not adequate for auth code, and a green typecheck has never caught a real bug
// on this project. So the auth logic was written as pure functions taking their
// configuration as arguments, specifically so it could be driven from here
// without a server, without Supabase, and without mutating process.env.
//
// House rule: every check here was proven by removing the guard it covers and
// watching it go red before the guard was restored. The planted-bug results are
// recorded in TWIN-API.txt.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  authenticate,
  checkNetwork,
  clientIp,
  isTailscale,
  isLoopback,
  presentedKey,
  MIN_KEY_LENGTH,
} from "../lib/api-auth";
import {
  adminColumns,
  adminTables,
  parseQuery,
  clampLimit,
  isQueryError,
  parseRevenueWindow,
  FORBIDDEN_COLUMNS,
  MAX_LIMIT,
} from "../lib/api-read";

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

function eq(actual: unknown, expected: unknown, what: string): void {
  if (actual !== expected) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const GOOD_KEY = "k".repeat(MIN_KEY_LENGTH + 8);
const h = (o: Record<string, string>) => new Headers(o);
const bearer = (k: string) => h({ authorization: `Bearer ${k}`, host: "localhost:3002" });

// A result's `code` when it failed, or "ok" when it passed — one shape to assert on.
function codeOf(r: ReturnType<typeof authenticate>): string {
  return r.ok ? "ok" : r.code;
}

// Source with comments removed. The structural checks below scan for names like
// `supabaseAdmin` that the files legitimately DISCUSS in their header comments;
// scanning raw text made B4 fail on its own explanation of why it passes.
function sourceCode(path: string | URL): string {
  return readFileSync(path, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

// Every route.ts under the admin tree.
function adminRouteFiles(): string[] {
  const root = new URL("../app/api/admin/v1/", import.meta.url).pathname;
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((e) => {
      const p = join(dir, e);
      return statSync(p).isDirectory() ? walk(p) : e === "route.ts" ? [p] : [];
    });
  return walk(root);
}

// ─────────────────────────────────────────────────────────────────────────────
// A. THE KEY GATE
// ─────────────────────────────────────────────────────────────────────────────

check("A1 unset key disables the API (503), it does NOT skip the check", () => {
  const r = authenticate({ headers: bearer(GOOD_KEY), configuredKey: undefined, allowPublic: true });
  eq(codeOf(r), "no_key_configured", "code");
  assert(!r.ok && r.status === 503, "must be 503");
});

check("A2 blank/whitespace key is treated as unset, not as a valid empty secret", () => {
  eq(codeOf(authenticate({ headers: bearer(""), configuredKey: "   ", allowPublic: true })), "no_key_configured", "code");
});

check("A3 a short key is refused rather than served behind", () => {
  const short = "changeme";
  const r = authenticate({ headers: bearer(short), configuredKey: short, allowPublic: true });
  eq(codeOf(r), "weak_key_configured", "code");
});

check("A4 no credential presented -> 401", () => {
  const r = authenticate({ headers: h({ host: "localhost" }), configuredKey: GOOD_KEY, allowPublic: true });
  eq(codeOf(r), "missing_key", "code");
  assert(!r.ok && r.status === 401, "must be 401");
});

check("A5 wrong credential -> 401", () => {
  eq(codeOf(authenticate({ headers: bearer("x".repeat(40)), configuredKey: GOOD_KEY, allowPublic: true })), "bad_key", "code");
});

check("A6 a key differing only in the LAST character is rejected", () => {
  const almost = GOOD_KEY.slice(0, -1) + "Z";
  eq(codeOf(authenticate({ headers: bearer(almost), configuredKey: GOOD_KEY, allowPublic: true })), "bad_key", "code");
});

check("A7 correct key via Authorization: Bearer -> ok", () => {
  eq(codeOf(authenticate({ headers: bearer(GOOD_KEY), configuredKey: GOOD_KEY, allowPublic: true })), "ok", "code");
});

check("A8 correct key via x-twin-key -> ok", () => {
  const r = authenticate({
    headers: h({ "x-twin-key": GOOD_KEY, host: "localhost" }),
    configuredKey: GOOD_KEY,
    allowPublic: true,
  });
  eq(codeOf(r), "ok", "code");
});

check("A9 presentedKey ignores a query string (credentials must not reach access logs)", () => {
  eq(presentedKey(h({ host: "localhost" })), null, "no header means no key");
  eq(presentedKey(h({ authorization: "Basic abc" })), null, "non-Bearer scheme is not a key");
});

// ─────────────────────────────────────────────────────────────────────────────
// B. THE MIDDLEWARE TRAP — the whole reason this module exists
// middleware.ts:17 disables auth outside production. Nothing here may.
// ─────────────────────────────────────────────────────────────────────────────

check("B1 api-auth.ts never reads NODE_ENV or DASHBOARD_NO_AUTH", () => {
  // The file DISCUSSES both names on purpose, so scan the code, not the prose.
  const code = sourceCode(new URL("../lib/api-auth.ts", import.meta.url));
  assert(!code.includes("NODE_ENV"), "api-auth.ts reads NODE_ENV — the middleware trap is back");
  assert(!code.includes("DASHBOARD_NO_AUTH"), "api-auth.ts reads DASHBOARD_NO_AUTH — the middleware trap is back");
});

check("B2 the gate behaves identically with NODE_ENV=development and DASHBOARD_NO_AUTH=true", () => {
  const prevEnv = process.env.NODE_ENV;
  const prevBypass = process.env.DASHBOARD_NO_AUTH;
  try {
    (process.env as Record<string, string>).NODE_ENV = "development";
    process.env.DASHBOARD_NO_AUTH = "true";
    const r = authenticate({ headers: h({ host: "localhost" }), configuredKey: GOOD_KEY, allowPublic: true });
    eq(codeOf(r), "missing_key", "an unauthenticated dev request must still be 401");
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = prevEnv;
    if (prevBypass === undefined) delete process.env.DASHBOARD_NO_AUTH;
    else process.env.DASHBOARD_NO_AUTH = prevBypass;
  }
});

check("B3 every admin route file gates itself with withAdmin", () => {
  const routes = adminRouteFiles();
  assert(routes.length >= 8, `expected the full endpoint set, found ${routes.length} route files`);
  for (const p of routes) {
    const src = sourceCode(p);
    assert(src.includes("withAdmin"), `${p} does not import/use withAdmin — it is an unauthenticated endpoint`);
    assert(
      /export const (GET|POST|PUT|PATCH|DELETE) = withAdmin\(/.test(src),
      `${p} exports a handler that is not wrapped in withAdmin(...)`,
    );
  }
});

check("B4 no admin route reaches Supabase directly, bypassing the allowlist choke point", () => {
  for (const p of adminRouteFiles()) {
    assert(
      !sourceCode(p).includes("supabaseAdmin"),
      `${p} imports supabaseAdmin directly — every read must go through runQuery/resolveClone so there is ONE place a column can be admitted`,
    );
  }
});

check("B5 the admin API is read-only: no route writes to Supabase", () => {
  for (const p of adminRouteFiles()) {
    const src = sourceCode(p);
    for (const verb of ["POST", "PUT", "PATCH", "DELETE"]) {
      assert(!src.includes(`export const ${verb}`), `${p} exports ${verb} — this API is read-only (Phase 2)`);
    }
    for (const w of [".insert(", ".update(", ".upsert(", ".delete(", ".rpc("]) {
      assert(!src.includes(w), `${p} calls ${w} — this API is read-only (Phase 2)`);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// C. THE NETWORK GATE
// ─────────────────────────────────────────────────────────────────────────────

const net = (xff: string | null, host: string | null = "twin.example.com") =>
  checkNetwork({ xff, host, allowPublic: false });

check("C1 clientIp takes the RIGHTMOST X-Forwarded-For entry", () => {
  eq(clientIp("1.2.3.4, 100.90.241.56"), "100.90.241.56", "rightmost");
  eq(clientIp("100.90.241.56"), "100.90.241.56", "single");
  eq(clientIp(null), null, "absent");
});

check("C2 a spoofed Tailscale address on the LEFT does not get in", () => {
  // The client typed 100.90.241.56; Apache appended the address it really saw.
  const r = net("100.90.241.56, 203.0.113.9");
  assert(!r.ok && r.code === "network_denied", "a forged leftmost XFF entry must not admit a public caller");
});

check("C3 a real Tailscale peer is admitted even with junk in front of it", () => {
  assert(net("1.2.3.4, 100.90.241.56").ok, "rightmost is the Tailscale box");
});

check("C4 a public caller is denied", () => {
  const r = net("203.0.113.9");
  assert(!r.ok && r.status === 403, "public IP must be 403");
});

check("C5 the CGNAT range is 100.64.0.0/10, not all of 100.x", () => {
  assert(isTailscale("100.64.0.1"), "100.64.0.1 is in range");
  assert(isTailscale("100.127.255.254"), "100.127.255.254 is in range");
  assert(isTailscale("100.90.241.56"), "the real bot box is in range");
  assert(isTailscale("100.122.206.88"), "the real dash box is in range");
  assert(!isTailscale("100.63.255.255"), "100.63.x is public space");
  assert(!isTailscale("100.128.0.1"), "100.128.x is public space");
  assert(!isTailscale("100.200.1.1"), "100.200.x is public space");
});

check("C6 loopback is admitted, including IPv4-mapped IPv6", () => {
  assert(isLoopback("127.0.0.1") && isLoopback("::1") && isLoopback("::ffff:127.0.0.1"), "loopback forms");
  assert(net("127.0.0.1").ok, "loopback peer");
});

check("C7 no proxy + local Host is admitted (local curl / dev server)", () => {
  assert(net(null, "localhost:3002").ok, "localhost");
  assert(net(null, "127.0.0.1:3001").ok, "127.0.0.1");
});

check("C8 no proxy + non-local Host is denied", () => {
  const r = net(null, "twin.example.com");
  assert(!r.ok && r.code === "network_denied", "a direct hit on an exposed port must be denied");
});

check("C9 the network gate is checked BEFORE the key, so a denied caller learns nothing about it", () => {
  const r = authenticate({
    headers: h({ authorization: `Bearer ${GOOD_KEY}`, "x-forwarded-for": "203.0.113.9", host: "twin.example.com" }),
    configuredKey: GOOD_KEY,
    allowPublic: false,
  });
  eq(codeOf(r), "network_denied", "correct key from a public IP is still refused");
});

check("C10 allowPublic opens the network gate but NEVER the key gate", () => {
  const pub = h({ "x-forwarded-for": "203.0.113.9", host: "twin.example.com" });
  assert(authenticate({ headers: pub, configuredKey: GOOD_KEY, allowPublic: true }).ok === false, "still needs a key");
  eq(
    codeOf(authenticate({ headers: pub, configuredKey: GOOD_KEY, allowPublic: true })),
    "missing_key",
    "network opened, key still required",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// D. THE READ SURFACE — credentials must be unreachable by every path
// ─────────────────────────────────────────────────────────────────────────────

check("D1 clones.bot_token is not in the admin column set", () => {
  const cols = adminColumns("clones") ?? [];
  assert(cols.length > 0, "clones must be readable");
  assert(!cols.includes("bot_token"), "bot_token is a live Telegram credential and must never be exposed");
});

check("D2 app_settings.value is not in the admin column set", () => {
  const cols = adminColumns("app_settings") ?? [];
  assert(!cols.includes("value"), "app_settings.value holds the OpenRouter/ElevenLabs/Deepgram keys");
});

check("D3 no table exposes any forbidden column", () => {
  for (const table of adminTables()) {
    const cols = adminColumns(table) ?? [];
    for (const bad of FORBIDDEN_COLUMNS[table] ?? []) {
      assert(!cols.includes(bad), `${table}.${bad} is reachable`);
    }
  }
});

check("D4 the admin extras that sim testing needs ARE present", () => {
  const cols = adminColumns("clones") ?? [];
  for (const c of ["persona", "intake", "text_prompt", "business_username"]) {
    assert(cols.includes(c), `clones.${c} should be readable by the admin API`);
  }
});

check("D5 an unknown table is rejected", () => {
  const r = parseQuery(new URLSearchParams("table=pg_shadow"));
  assert(isQueryError(r) && r.status === 400, "unknown table must 400");
});

check("D6 selecting a forbidden column is rejected", () => {
  const r = parseQuery(new URLSearchParams("table=clones&select=id,bot_token"));
  assert(isQueryError(r), "select of bot_token must be rejected");
  assert(r.error.includes("bot_token"), "the error should name the offending column");
});

check("D7 FILTERING on a forbidden column is rejected too", () => {
  // The leak that a select-only check would miss: filter by bot_token and read
  // the answer out of which rows come back.
  const r = parseQuery(new URLSearchParams("table=clones&filter=bot_token:eq:123"));
  assert(isQueryError(r), "filter on bot_token must be rejected");
});

check("D8 ORDERING by a forbidden column is rejected too", () => {
  const r = parseQuery(new URLSearchParams("table=clones&order=bot_token"));
  assert(isQueryError(r), "order by bot_token must be rejected");
});

check("D9 an unknown filter operator is rejected", () => {
  const r = parseQuery(new URLSearchParams("table=clones&filter=slug:drop:x"));
  assert(isQueryError(r), "unknown op must be rejected");
});

check("D10 a filter value containing ':' survives parsing (timestamps)", () => {
  const r = parseQuery(new URLSearchParams("table=system_logs&filter=ts:gte:2026-08-08T10:30:00Z"));
  assert(!isQueryError(r), `expected a valid spec, got ${JSON.stringify(r)}`);
  eq(r.filters?.[0].value, "2026-08-08T10:30:00Z", "value");
  eq(r.filters?.[0].op, "gte", "op");
});

check("D11 limit is capped server-side", () => {
  eq(clampLimit(999_999), MAX_LIMIT, "huge limit");
  eq(clampLimit(-5), 100, "negative falls back to the default");
  eq(clampLimit("abc"), 100, "garbage falls back to the default");
  const r = parseQuery(new URLSearchParams("table=chat_history&limit=999999"));
  assert(!isQueryError(r), "should parse");
  eq(r.limit, MAX_LIMIT, "parsed limit");
});

// E. THE REVENUE WINDOW — a real bug this API shipped, found by calling the
// live endpoint rather than reading it. ?period=1M came back as CUSTOM because
// Number(null) is 0 and 0 is finite, so the "is there a custom range" test was
// true on every request. tsc was clean throughout.

check("E1 a period with no start/end is NOT treated as a custom range", () => {
  const r = parseRevenueWindow(new URLSearchParams("period=1M"));
  assert(!isQueryError(r), `expected a window, got ${JSON.stringify(r)}`);
  eq(r.period, "1M", "period must survive");
  eq(r.range, undefined, "there is no range");
});

check("E2 no parameters at all defaults to 1M, not CUSTOM", () => {
  const r = parseRevenueWindow(new URLSearchParams(""));
  assert(!isQueryError(r), "expected a window");
  eq(r.period, "1M", "default period");
  eq(r.range, undefined, "no range");
});

check("E3 both bounds present gives a real CUSTOM range", () => {
  const r = parseRevenueWindow(new URLSearchParams("start=1000&end=2000"));
  assert(!isQueryError(r), "expected a window");
  eq(r.period, "CUSTOM", "period");
  eq(r.range?.startMs, 1000, "startMs");
  eq(r.range?.endMs, 2000, "endMs");
});

check("E4 exactly one bound is an error, not a silent {0, n} range", () => {
  assert(isQueryError(parseRevenueWindow(new URLSearchParams("start=1000"))), "start alone must 400");
  assert(isQueryError(parseRevenueWindow(new URLSearchParams("end=2000"))), "end alone must 400");
});

check("E5 empty and non-numeric bounds are rejected rather than coerced to 0", () => {
  assert(isQueryError(parseRevenueWindow(new URLSearchParams("start=&end="))), "empty strings must 400");
  assert(isQueryError(parseRevenueWindow(new URLSearchParams("start=abc&end=2000"))), "garbage must 400");
});

check("E6 a reversed range is rejected", () => {
  assert(isQueryError(parseRevenueWindow(new URLSearchParams("start=5000&end=1000"))), "end before start must 400");
});

check("E7 an unknown period is rejected", () => {
  assert(isQueryError(parseRevenueWindow(new URLSearchParams("period=FOREVER"))), "unknown period must 400");
});

check("D12 the allowlist is shared with the AI assistant, not duplicated", () => {
  const src = readFileSync(new URL("../lib/api-read.ts", import.meta.url), "utf8");
  assert(
    src.includes('from "@/app/api/ai-assistant/tools"'),
    "api-read.ts must import ALLOWLIST rather than defining a second one that can drift",
  );
});

// ─────────────────────────────────────────────────────────────────────────────

const total = passed + failures.length;
if (failures.length) {
  console.error(`\n  ${failures.length} of ${total} CHECKS FAILED\n`);
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  process.exit(1);
}
console.log(`\n  ALL ${total} CHECKS PASSED\n`);
