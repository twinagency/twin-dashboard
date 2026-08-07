// ── Auth for the Twin Admin API (app/api/admin/v1/*) ─────────────────────────
//
// WHY THIS EXISTS AND WHY IT DOES NOT USE THE DASHBOARD SESSION:
// lib/session.ts is one shared password for one operator. It has no per-caller
// identity, no revocation, and no rate limit. The admin API returns verbatim
// fan chat history, prompts and system logs, so it gets its own key.
//
// *** THE TRAP THIS MODULE EXISTS TO AVOID ***
// middleware.ts:17 returns early — i.e. NO AUTH AT ALL — whenever
// NODE_ENV !== "production" or DASHBOARD_NO_AUTH === "true", and its matcher
// covers /api/*. So a route handler that trusts the middleware is wide open on
// every dev server and on any box where that env var leaks in. Every admin
// route therefore calls authenticateAdmin() ITSELF, and nothing in this file
// reads NODE_ENV or DASHBOARD_NO_AUTH. check-admin-api.ts asserts that.
//
// TWO INDEPENDENT GATES, both must pass:
//   1. a bearer key (TWIN_ADMIN_API_KEY)
//   2. the caller's network (loopback or Tailscale) unless explicitly opened
// Gate 2 is defence in depth, NOT the real control. The real control is that
// INFRA never proxies /api/admin/* from the public vhost. Header-based network
// checks are only as good as the proxy in front of them, see clientIp() below.

import { constantTimeEqual } from "./session";

export const ADMIN_KEY_ENV = "TWIN_ADMIN_API_KEY";
export const ALLOW_PUBLIC_ENV = "TWIN_ADMIN_ALLOW_PUBLIC";

// A short key is a typo or a placeholder, not a credential. Refusing to start
// on one is better than serving chat history behind "changeme".
export const MIN_KEY_LENGTH = 32;

export type AuthFailure = {
  ok: false;
  status: 401 | 403 | 503;
  code: "no_key_configured" | "weak_key_configured" | "missing_key" | "bad_key" | "network_denied";
  error: string;
};
export type AuthResult = { ok: true } | AuthFailure;

// ── the presented key ────────────────────────────────────────────────────────
// Accepts `Authorization: Bearer <key>` or `x-twin-key: <key>`. Never a query
// string parameter: those land in Apache's access log and in browser history,
// which is how a credential outlives the request that carried it.
export function presentedKey(headers: Headers): string | null {
  const auth = headers.get("authorization");
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m) return m[1].trim();
  }
  const direct = headers.get("x-twin-key");
  return direct ? direct.trim() : null;
}

// ── the network gate ─────────────────────────────────────────────────────────
// Tailscale hands out addresses in the CGNAT range 100.64.0.0/10 (both boxes
// are in it: bot 100.90.241.56, dashboard 100.122.206.88) and IPv6 out of
// fd7a:115c:a1e0::/48.
export function isLoopback(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1" || ip.startsWith("127.");
}

export function isTailscale(ip: string): boolean {
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(ip);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    // 100.64.0.0/10 → second octet 64..127. NOT all of 100.x: 100.0.0.0/10 and
    // 100.128.0.0/9 are ordinary public space and must not be admitted.
    return a === 100 && b >= 64 && b <= 127;
  }
  return ip.toLowerCase().startsWith("fd7a:115c:a1e0:");
}

// Addresses that are INFRASTRUCTURE, never a caller: the Docker bridge and the
// ordinary private ranges. Deliberately does NOT include Tailscale's
// 100.64.0.0/10, which is a real caller we want to admit.
function isInfraHop(ip: string): boolean {
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(ip);
  if (!v4) return false;
  const a = Number(v4[1]);
  const b = Number(v4[2]);
  if (a === 10) return true;                          // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12, incl. docker0
  if (a === 192 && b === 168) return true;            // 192.168.0.0/16
  return false;
}

// THE RIGHTMOST MEANINGFUL X-Forwarded-For ENTRY, not the leftmost. Apache
// APPENDS the address it actually observed, so the last entry is the only one a
// remote caller cannot forge; the leftmost is whatever the client typed.
// Getting this backwards turns the network gate into a header the attacker sets.
//
// WHY IT SKIPS TRAILING INFRA HOPS. This runs inside Docker, and Next.js
// SYNTHESISES x-forwarded-for from the socket when the header is absent. For a
// request made on the box itself that socket peer is the docker0 gateway,
// 172.17.0.1 — so a local curl looked like a caller from a strange network and
// got 403, while the "no XFF, check the Host instead" fallback below could
// never fire because, as far as this code could tell, an XFF was present.
// Verified on the live box: an explicit XFF is NOT overwritten by Next, so real
// proxied traffic still resolves to the real client either way.
//
// This cannot admit a public caller: their address is a public one and stays in
// the list, so it becomes the answer. Only private/bridge hops are skipped.
// STILL ASSUMES ONE TRUSTED PUBLIC-FACING PROXY (Apache).
export function clientIp(xff: string | null): string | null {
  if (!xff) return null;
  const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (!isInfraHop(parts[i])) return parts[i];
  }
  return null; // every hop was infrastructure: treat as "nothing proxied this"
}

// Host header only decides the "no proxy in front of us" case below. It is
// client-controlled, so it can only ever ADMIT a loopback caller who already
// holds the key; it never widens what a remote caller can reach.
function hostIsLocal(host: string | null): boolean {
  if (!host) return false;
  const name = host.replace(/^\[/, "").split("]")[0].split(":")[0].toLowerCase();
  return name === "localhost" || name === "127.0.0.1" || name === "::1";
}

export function checkNetwork(opts: {
  xff: string | null;
  host: string | null;
  allowPublic: boolean;
}): AuthResult {
  if (opts.allowPublic) return { ok: true };

  const ip = clientIp(opts.xff);
  if (ip) {
    if (isLoopback(ip) || isTailscale(ip)) return { ok: true };
    return {
      ok: false,
      status: 403,
      code: "network_denied",
      error: `admin API is Tailscale/loopback only; caller ${ip} is neither`,
    };
  }

  // No XFF at all means nothing proxied this request. That is either a local
  // curl / dev server (fine, and the only way to work on this locally) or a
  // direct hit on an exposed port (deny). The Host header separates them.
  if (hostIsLocal(opts.host)) return { ok: true };
  return {
    ok: false,
    status: 403,
    code: "network_denied",
    error: "admin API is Tailscale/loopback only; no X-Forwarded-For and non-local Host",
  };
}

// ── the whole gate ───────────────────────────────────────────────────────────
// FAILS CLOSED IN EVERY DIRECTION. An unset key is 503, never "skip the check",
// which is the failure mode that would make this whole module decorative.
export function authenticate(opts: {
  headers: Headers;
  configuredKey: string | undefined;
  allowPublic: boolean;
}): AuthResult {
  const configured = (opts.configuredKey ?? "").trim();
  if (!configured) {
    return {
      ok: false,
      status: 503,
      code: "no_key_configured",
      error: `admin API disabled: ${ADMIN_KEY_ENV} is not set`,
    };
  }
  if (configured.length < MIN_KEY_LENGTH) {
    return {
      ok: false,
      status: 503,
      code: "weak_key_configured",
      error: `admin API disabled: ${ADMIN_KEY_ENV} must be at least ${MIN_KEY_LENGTH} characters`,
    };
  }

  // Network first: a caller who should not reach this at all learns nothing
  // about whether their key was right.
  const net = checkNetwork({
    xff: opts.headers.get("x-forwarded-for"),
    host: opts.headers.get("host"),
    allowPublic: opts.allowPublic,
  });
  if (!net.ok) return net;

  const presented = presentedKey(opts.headers);
  if (!presented) {
    return {
      ok: false,
      status: 401,
      code: "missing_key",
      error: "missing credential: send Authorization: Bearer <key> or x-twin-key",
    };
  }
  if (!constantTimeEqual(presented, configured)) {
    return { ok: false, status: 401, code: "bad_key", error: "invalid credential" };
  }
  return { ok: true };
}

// Request-level wrapper. Reads the environment; `authenticate` above stays pure
// so the checks can drive it without mutating process.env.
export function authenticateRequest(req: Request): AuthResult {
  return authenticate({
    headers: req.headers,
    configuredKey: process.env[ADMIN_KEY_ENV],
    allowPublic: process.env[ALLOW_PUBLIC_ENV] === "true",
  });
}
