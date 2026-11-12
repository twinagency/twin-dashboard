import "../support/admin-route-env";
/**
 * KNOWN RED (W4 api-admin-plus1 F8, docs/review/W4/api-admin-plus1.md): GET /api/admin/v1/meta, the discovery
 * endpoint AI callers read, says `readOnly: true` while write routes exist under app/api/admin/v1, and lists 9 of the
 * route files. Drives the real route; the route set comes from walking the filesystem and the verbs from importing
 * each route module and reading its exported handlers (GET/POST/PUT/PATCH/DELETE).
 * Endpoint entries may be strings ("GET /path?query", "/path") or {method, path} objects; a string with no verb
 * counts for every verb of that path.
 * Control: meta answers 200 with an endpoints array that includes itself.
 * Turns green when readOnly is not true while a write verb exists, and every (route, verb) pair is listed.
 * Team's Claude owns the fix. Not wired into npm scripts on purpose.
 */
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { adminRequest, callJson } from "../support/admin-wire";
import { GET } from "../../app/api/admin/v1/meta/route";

const ROOT = fileURLToPath(new URL("../../app/api/admin/v1/", import.meta.url));
const VERBS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
function routeFiles(dir = ROOT): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? routeFiles(p) : n === "route.ts" ? [p] : [];
  });
}
const routePath = (file: string) => "/api/admin/v1/" + relative(ROOT, file).replace(/\/?route\.ts$/, "");
async function routes(): Promise<{ path: string; verbs: string[] }[]> {
  return Promise.all(routeFiles().map(async (f) => {
    const mod = (await import(pathToFileURL(f).href)) as Record<string, unknown>;
    return { path: routePath(f), verbs: VERBS.filter((v) => typeof mod[v] === "function") };
  }));
}
type Entry = { methods: string[] | null; path: string };
function normalise(e: unknown): Entry | null {
  if (typeof e === "string") {
    const m = /^\s*(?:([A-Z|,\s]+?)\s+)?(\/\S*)/.exec(e);
    return m ? { methods: m[1] ? m[1].split(/[|,\s]+/).filter(Boolean) : null, path: m[2].split("?")[0] } : null;
  }
  if (e && typeof e === "object" && typeof (e as { path?: unknown }).path === "string") {
    const { method, methods, path } = e as { method?: unknown; methods?: unknown; path: string };
    const list = Array.isArray(methods) ? methods.map(String) : typeof method === "string" ? method.split(/[|,\s]+/).filter(Boolean) : null;
    return { methods: list?.map((x) => x.toUpperCase()) ?? null, path: path.split("?")[0] };
  }
  return null;
}
const meta = async () => (await callJson(GET, adminRequest("/api/admin/v1/meta"))).body;

test("control: meta answers 200 with an endpoints array that lists itself; every route file exports a handler", async () => {
  const { status, body } = await callJson(GET, adminRequest("/api/admin/v1/meta"));
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.endpoints));
  assert.ok(body.endpoints.map(normalise).some((e: Entry | null) => e?.path === "/api/admin/v1/meta"));
  const rs = await routes();
  assert.ok(rs.length > 1, "filesystem walk finds route files besides meta");
  assert.deepEqual(rs.filter((r) => r.verbs.length === 0).map((r) => r.path), [], "every route module imports and exports a verb");
});

test("F8: meta does not claim readOnly while write verbs exist", async () => {
  const writers = (await routes()).filter((r) => r.verbs.some((v) => v !== "GET")).map((r) => `${r.verbs.join("|")} ${r.path}`);
  assert.ok(writers.length > 0, "fixture: write routes exist");
  const body = await meta();
  assert.notEqual(body.readOnly, true, `readOnly:true but ${writers.length} write routes exist: ${writers.join(", ")}`);
});

test("F8: meta lists every (route, verb) under app/api/admin/v1", async () => {
  const listed = ((await meta()).endpoints ?? []).map(normalise).filter(Boolean) as Entry[];
  const missing = (await routes()).flatMap((r) => r.verbs
    .filter((v) => !listed.some((e) => e.path === r.path && (e.methods === null || e.methods.includes(v))))
    .map((v) => `${v} ${r.path}`));
  assert.deepEqual(missing, [], `${missing.length} route/verb pair(s) missing from meta.endpoints`);
});
