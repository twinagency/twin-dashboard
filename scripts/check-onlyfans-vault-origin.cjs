const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { NextRequest, NextResponse } = require("next/server");
const root = path.resolve(__dirname, "..");
const savedEnv = { ...process.env };
function load(file, imports = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require(name) {
    if (Object.hasOwn(imports, name)) return imports[name];
    return require(name);
  }, process, URL, Headers, Buffer }, { filename: file });
  return module.exports;
}
async function main() {
  process.env.NODE_ENV = "production";
  delete process.env.DASHBOARD_PUBLIC_ORIGIN;
  delete process.env.DASHBOARD_EXTRA_ORIGINS;
  const origin = load("lib/form-origin.ts");
  let context = { actor: "op-session:" + "a".repeat(64), fetch };
  const guard = load("lib/onlyfans/vault-route.ts", {
    "./route": { requireOnlyFansRead: async options => { assert.equal(options.agency, true); assert.equal(options.write, true); assert.equal(Object.keys(options).length, 2); return context; }, PRIVATE_HEADERS: { "Cache-Control": "private, no-store" } },
    "./command-json": { readCommandJson: async () => { throw Error("not used"); } },
    "./content": { canonicalContent: JSON.stringify, CONTENT_SCHEMA: "of-content.v1" },
    "@/lib/form-origin": origin
  });
  const make = (patch = {}) => {
    const { host = "dashboard.tgaiclone.xyz", origin = "https://dashboard.tgaiclone.xyz", site = "same-origin", type = "application/json", ...extra } = patch;
    const headers = { host, "content-type": type, ...extra };
    if (origin !== null) headers.origin = origin;
    if (site !== null) headers["sec-fetch-site"] = site;
    return new NextRequest("http://127.0.0.1:3001/api/onlyfans-content/accounts/test/vault/sync", { method: "POST", headers });
  };
  for (const type of ["application/json", "application/octet-stream"]) {
    const result = await guard.vaultSessionContext(make({ type }), type);
    assert(!(result instanceof NextResponse), "The HTTPS public dashboard must work behind its HTTP reverse proxy");
    assert.equal(result.actor, context.actor);
    assert.equal(result.fetch, context.fetch);
  }
  const branded = await guard.vaultSessionContext(make({ host: "dashboard.lynqai.co", origin: "https://dashboard.lynqai.co" }), "application/json");
  assert(!(branded instanceof NextResponse), "The existing allowlisted agency host must work");
  for (const patch of [
    { origin: null }, { origin: "null" }, { origin: "http://dashboard.tgaiclone.xyz" },
    { origin: "https://attacker.invalid" }, { origin: "https://dashboard.tgaiclone.xyz.attacker.invalid" },
    { origin: "https://dashboard.tgaiclone.xyz/path" }, { site: "cross-site" }, { site: "same-site" },
    { type: "text/plain" }, { type: "application/octet-stream" },
    { origin: "https://attacker.invalid", "x-forwarded-host": "attacker.invalid", "x-forwarded-proto": "https" },
    { host: "attacker.invalid", origin: "https://attacker.invalid" }
  ]) {
    const result = await guard.vaultSessionContext(make(patch), "application/json");
    assert(result instanceof NextResponse);
    assert.equal(result.status, 403, JSON.stringify(patch));
  }
  context = NextResponse.json({ error: "Sign in again" }, { status: 401 });
  assert.equal(await guard.vaultSessionContext(make(), "application/json"), context);
  context = NextResponse.json({ error: "Read-only team access" }, { status: 403 });
  assert.equal(await guard.vaultSessionContext(make(), "application/json"), context);
  context = { actor: null, fetch };
  assert.equal((await guard.vaultSessionContext(make(), "application/json")).status, 401);
  console.log("PASS vault public-origin regression: HTTP reverse proxy, HTTPS and branded hosts, JSON/chunks, hostile origins, fetch metadata and unchanged authentication");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const key of Object.keys(process.env)) if (!Object.hasOwn(savedEnv, key)) delete process.env[key];
  Object.assign(process.env, savedEnv);
});
