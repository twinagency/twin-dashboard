/**
 * Characterization (W4 lib-onlyfans-preview-2-plus2 C4 review; REVIEW inv 6 "ONLYFANS_*_TOKEN values never reach ..."
 * and inv 7 "Isolation"): lib/onlyfans-sign-in/backend.ts:54-58 configuredSignInBackend() refuses to build a sign-in
 * backend whose token is the same value as another OnlyFans purpose token, so the sign-in service credential can never
 * double as the control (write), connection or any other purpose credential. Holds today: equal to any of
 * ONLYFANS_{API,CONTROL,CONFIGURATION,CAMPAIGN,CONTENT,CONNECTION}_TOKEN -> null; a distinct 32+ char synthetic token
 * on an https .invalid base URL, with all six purpose tokens set to other values -> a backend.
 * (The one-way gap, MANAGED_PROXY not in the list, is W3 lib-onlyfans-4-plus2 F11; cited, not pinned here.)
 * `server-only` is not installed; it is stubbed by a resolution hook only for the dynamic import of backend.ts.
 * No network: configuredSignInBackend only builds the client. Mutation-proven (D15):
 * tests/rules/mutations/W4-lib-onlyfans-preview-2-plus2/m3-*, m6-*.
 */
import assert from "node:assert/strict";
import { Module } from "node:module";
import test from "node:test";

type Resolver = { _resolveFilename: (request: string, ...rest: unknown[]) => string; _cache: Record<string, unknown> };
async function loadBackend() {
  const resolver = Module as unknown as Resolver;
  const original = resolver._resolveFilename;
  resolver._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
    return request === "server-only" ? "server-only-stub" : original.call(this, request, ...rest);
  };
  resolver._cache["server-only-stub"] = { id: "server-only-stub", filename: "server-only-stub", loaded: true, exports: {} };
  try {
    return await import("../../lib/onlyfans-sign-in/backend");
  } finally {
    resolver._resolveFilename = original;
  }
}

const env = process.env as Record<string, string | undefined>;
const PURPOSES = ["API", "CONTROL", "CONFIGURATION", "CAMPAIGN", "CONTENT", "CONNECTION"];
const SIGNIN = "synthetic".repeat(4);
function configure(extra: Record<string, string>) {
  for (const p of PURPOSES) delete env[`ONLYFANS_${p}_TOKEN`];
  env.ONLYFANS_SIGNIN_BASE_URL = "https://signin.invalid";
  env.ONLYFANS_SIGNIN_TOKEN = SIGNIN;
  Object.assign(env, extra);
}

test("a distinct 32+ char sign-in token on an https base URL builds a backend", async () => {
  const { configuredSignInBackend } = await loadBackend();
  configure(Object.fromEntries(PURPOSES.map(p => [`ONLYFANS_${p}_TOKEN`, `synthetic-${p.toLowerCase()}`.repeat(3)])));
  assert.notEqual(configuredSignInBackend(), null);
});

for (const purpose of PURPOSES) {
  test(`a sign-in token equal to ONLYFANS_${purpose}_TOKEN is refused`, async () => {
    const { configuredSignInBackend } = await loadBackend();
    configure({ [`ONLYFANS_${purpose}_TOKEN`]: SIGNIN });
    assert.equal(configuredSignInBackend(), null, `the sign-in credential must not double as the ${purpose} credential`);
  });
}
