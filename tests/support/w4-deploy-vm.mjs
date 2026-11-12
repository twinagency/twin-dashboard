// Shared offline harness for the W4 deploy-creator-sign-in-input-f-plus31 tests (known-red + rules).
// Runs a deployment/*.cjs inside node:vm with the boundaries it uses faked: the fakes cover what these
// targets call, and any module, method or global they don't provide throws a `HarnessError: <what> not
// faked` and is recorded, so a harness gap can never read as a pass or a red.
// node:vm is NOT a security boundary: every host object handed in (fakes, Buffer, URL, real node:assert)
// leads back to the host's Function and so to the real process. The targets are trusted, non-adversarial
// repo files; the harness only refuses obvious escape/codegen source (ESCAPE below) before running and turns
// off string/wasm code generation inside the context. It does not make hostile code safe to run.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = new URL("../../", import.meta.url);

export class HarnessError extends Error {
  constructor(what, suffix = "not faked") { super(`HarnessError: ${what} ${suffix}`); this.name = "HarnessError"; }
}

/** Text of a repo file, or null when it no longer exists (lets rules tests skip a retired target). */
export function readTarget(rel) {
  const url = new URL(rel, ROOT);
  return existsSync(url) ? readFileSync(url, "utf8") : null;
}

/** Text of a known-red target; a retired one fails with what to do about the finding instead of a harness error. */
export function requireTarget(rel, findings) {
  const text = readTarget(rel);
  assert.ok(text !== null, `target retired: ${rel}; confirm, delete this known-red, close ${findings} in the findings ledger`);
  return text;
}

/** First capture of `re` in `src`; fails loudly when the target no longer has the literal. */
export function literalFrom(src, re, label) {
  const m = src.match(re);
  assert.ok(m, `${label} not found in target source`);
  return m[1];
}

/** The two Supabase refs, derived at runtime (never written in a test): .claude/settings.json Bash deny
 * entries `Bash(*<ref>*)`, and CLAUDE.md's "NEVER `<ref>`" for old prod. */
export function projectRefs() {
  const deny = JSON.parse(readFileSync(new URL(".claude/settings.json", ROOT), "utf8")).permissions.deny;
  const all = [...new Set(deny.map((d) => d.match(/^Bash\(\*([a-z]{20})\*\)$/)?.[1]).filter(Boolean))];
  const oldProd = readFileSync(new URL("CLAUDE.md", ROOT), "utf8").match(/NEVER `([a-z]{20})`/)?.[1];
  assert.equal(all.length, 2, "settings deny list must name exactly two project refs");
  assert.ok(oldProd && all.includes(oldProd), "CLAUDE.md old-prod ref must be in the deny list");
  return { all, oldProd, live: all.find((r) => r !== oldProd) };
}

/** The expected AWS account literal in a target (`Account !== '<12 digits>'`). */
export const AWS_ACCOUNT_RE = /Account\s*!==?\s*['"](\d{12})['"]/;

/** Last log line that parses as JSON (the target's report), or null. Never throws on a non-JSON line. */
export function lastJson(logs) {
  for (const l of [...logs].reverse()) { try { return JSON.parse(l); } catch { /* not the report */ } }
  return null;
}

const PASS_THROUGH = new Set(["then", "toJSON", "constructor", "asymmetricMatch", "nodeType", "inspect"]);
/** Wrap a fake so reading any property it doesn't define throws (and records) a HarnessError. */
export function strict(obj, label, sink) {
  return new Proxy(obj, {
    get(target, prop, recv) {
      if (typeof prop === "symbol" || prop in target || PASS_THROUGH.has(prop)) return Reflect.get(target, prop, recv);
      const e = new HarnessError(`${label}.${prop}`);
      sink?.push(e.message);
      throw e;
    },
  });
}

const OPS = {
  eq: (a, b) => String(a) === String(b),
  neq: (a, b) => String(a) !== String(b),
  lt: (a, b) => a != null && a < b,
  lte: (a, b) => a != null && a <= b,
  gt: (a, b) => a != null && a > b,
  gte: (a, b) => a != null && a >= b,
  is: (a, b) => (b === null || b === "null" ? a === null || a === undefined : String(a) === String(b)),
};

/** In-memory @supabase/supabase-js. `rows` is one table's rows (every from() reads it). Filters compare raw
 * values with < / > (ISO timestamps and string ids order correctly). `rpc(name,args)` defaults to an error.
 * Pass the run's `sink` so a gap here lands in the same list runCjsInVm reports. */
export function fakeSupabase(rows, { rpc, sink = [] } = {}) {
  const rec = { createClient: [], from: [], rpc: [], storage: [] };
  const builder = () => {
    let out = rows.slice();
    let total = null;
    let count = false;
    const filter = (op, c, v) => { out = out.filter((r) => OPS[op](r[c], v)); return b; };
    const b = strict({
      select: (_cols, opts) => { count = !!opts?.count; return b; },
      eq: (c, v) => filter("eq", c, v), neq: (c, v) => filter("neq", c, v),
      lt: (c, v) => filter("lt", c, v), lte: (c, v) => filter("lte", c, v),
      gt: (c, v) => filter("gt", c, v), gte: (c, v) => filter("gte", c, v),
      is: (c, v) => filter("is", c, v),
      in: (c, vs) => { out = out.filter((r) => vs.map(String).includes(String(r[c]))); return b; },
      or: (expr) => {
        const parts = String(expr).split(",").map((p) => {
          const m = p.match(/^([a-z_]+)\.(eq|neq|lt|lte|gt|gte|is)\.(.*)$/);
          if (!m) { const e = new HarnessError(`or(${p})`); sink.push(e.message); throw e; }
          return [m[2], m[1], m[3]];
        });
        out = out.filter((r) => parts.some(([op, c, v]) => OPS[op](r[c], v)));
        return b;
      },
      order: (c, opts) => {
        const dir = opts?.ascending === false ? -1 : 1;
        out = out.slice().sort((x, y) => (x[c] < y[c] ? -dir : x[c] > y[c] ? dir : 0));
        return b;
      },
      limit: (n) => { total ??= out.length; out = out.slice(0, n); return b; },
      range: (from, to) => { total ??= out.length; out = out.slice(from, to + 1); return b; },
      then: (res, rej) => Promise.resolve({ data: out, error: null, ...(count ? { count: total ?? out.length } : {}) }).then(res, rej),
    }, "supabase.query", sink);
    return b;
  };
  const client = strict({
    from: (table) => { rec.from.push(table); return builder(); },
    rpc: async (name, args) => { rec.rpc.push(name); return rpc ? rpc(name, args) : { data: null, error: { message: "fake rpc refuses" } }; },
    storage: strict({
      from: (bucket) => strict({
        remove: async (p) => { rec.storage.push(["remove", bucket, p]); return { error: { message: "fake storage refuses" } }; },
        info: async (p) => { rec.storage.push(["info", bucket, p]); return { data: null, error: { statusCode: 404 } }; },
      }, "supabase.storage.bucket", sink),
    }, "supabase.storage", sink),
  }, "supabase.client", sink);
  const mod = { createClient: (url) => { rec.createClient.push(url); return client; } };
  return { rec, mod };
}

/** In-memory node:fs. Pass a Map to share one file system across several runs. */
export function fakeFs(files, sink) {
  const mem = files instanceof Map ? files : new Map(Object.entries(files ?? {}));
  const fs = strict({
    existsSync: (p) => mem.has(String(p)),
    readFileSync: (p) => { if (!mem.has(String(p))) throw Object.assign(new Error(`ENOENT (fake fs): ${p}`), { code: "ENOENT" }); return mem.get(String(p)); },
    writeFileSync: (p, data) => { mem.set(String(p), String(data)); },
  }, "fs", sink);
  return { fs, mem };
}

const AWS_RAW = Symbol("aws raw spawn result");
/** A raw spawnSync result for an awsSpawn route (anything else a route returns is sent as JSON, status 0). */
export const awsRaw = (status, stderr = "", stdout = "") => ({ [AWS_RAW]: true, status, stdout, stderr });

/** Fake child_process.spawnSync for the `aws` CLI. `routes` is [[subcommand or predicate(args), reply(args)]],
 * first match wins. Non-aws commands exit 127, unrouted aws calls exit 255. `calls` holds [cmd, ...args]. */
export function awsSpawn(routes) {
  const calls = [];
  const spawnSync = (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd !== "aws") return { status: 127, stdout: "", stderr: `fake: ${cmd} not allowed` };
    for (const [match, reply] of routes) {
      if (typeof match === "function" ? match(args) : args.includes(match)) {
        const out = reply(args);
        return out?.[AWS_RAW] ? { status: out.status, stdout: out.stdout, stderr: out.stderr } : { status: 0, stdout: JSON.stringify(out), stderr: "" };
      }
    }
    return { status: 255, stdout: "", stderr: "fake: unexpected aws call" };
  };
  return { spawnSync, calls };
}

// Obvious ways out of the context or into code generation. No vm target uses any of them (checked over every
// deployment/*.cjs|mjs on 2026-11-12: only the three messages-* loaders use `new Function`, and none runs here).
const ESCAPE = /\bconstructor\b|__proto__|getPrototypeOf|\bFunction\b|\beval\b|\bimport\s*\(|WebAssembly|\.(?:caller|callee)\b/;
const HARNESS_GAP = /HarnessError|not faked|is not defined/;

/**
 * Run CommonJS source in a fresh vm context. `modules` maps ids (with or without `node:`) to fakes (each wrapped
 * strict, so a missing method is a HarnessError); `files` (object or shared Map) backs a fake fs unless modules
 * provides one; `sink` is the shared gap list (pass the one given to fakeSupabase). Returns captured output,
 * the fake process.exitCode, a synchronous throw if any, and every harness gap seen. Refuses (throws a
 * HarnessError, runs nothing) when the source matches ESCAPE.
 */
export async function runCjsInVm(src, { modules = {}, argv = [], env = {}, fetch, files, sink = [], filename = "target.cjs", dirname = "/fake/deployment", tmpdir = "/fake/tmp" } = {}) {
  const hit = String(src).match(ESCAPE);
  if (hit) throw new HarnessError(`target source uses \`${hit[0]}\` (escape/codegen pattern);`, "refused, nothing run");
  const harness = sink;
  const mods = {};
  for (const [id, m] of Object.entries(modules)) { const key = id.replace(/^node:/, ""); mods[key] = strict(m, `module ${key}`, harness); }
  const { fs, mem } = fakeFs(files, harness);
  if (files !== undefined && !mods.fs) mods.fs = fs;
  const logs = [], errors = [];
  const proc = strict({ argv: ["node", path.join(dirname, filename), ...argv], env: { ...env }, exitCode: undefined }, "process", harness);
  const sandbox = {
    require: (id) => {
      const key = String(id).replace(/^node:/, "");
      if (key in mods) return mods[key];
      if (key === "path") return path; // pure
      if (key === "os") return strict({ tmpdir: () => tmpdir }, "os", harness);
      const e = new HarnessError(`require('${id}')`); harness.push(e.message); throw e;
    },
    __dirname: dirname, __filename: path.join(dirname, filename),
    process: proc,
    console: strict({ log: (...a) => logs.push(a.join(" ")), error: (...a) => errors.push(a.join(" ")), warn: (...a) => errors.push(a.join(" ")) }, "console", harness),
    setTimeout: (fn) => { Promise.resolve().then(fn); return 0; },
    clearTimeout: () => {},
    queueMicrotask,
    fetch: fetch ?? (async (url) => { const e = new HarnessError(`fetch(${url})`); harness.push(e.message); throw e; }),
    URL, URLSearchParams, TextEncoder, TextDecoder, Buffer,
    AbortSignal: strict({ timeout: () => undefined }, "AbortSignal", harness),
  };
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  let thrown = null;
  try { vm.runInContext(src, context, { filename }); } catch (e) { thrown = e; }
  for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r));
  return { logs, errors, exitCode: proc.exitCode, thrown, harness, mem };
}

/** Assert a run hit no harness gap, so its verdict is about the target. Scans the shared sink plus every
 * thrown/logged message (a target that catches an error may only log it). */
export function assertNoHarnessGap(run) {
  const text = [run.thrown?.message, ...run.errors, ...run.logs].filter(Boolean);
  const gaps = [...run.harness, ...text.filter((t) => HARNESS_GAP.test(t))];
  assert.deepEqual(gaps, [], `harness gap (missing fake/global) or target ReferenceError: ${gaps.join(" | ")}`);
}

export const UPLOAD_CLEANUP = "deployment/creator-upload-cleanup.cjs";
export const UPLOAD_CREATOR = "11111111-2222-4333-8444-555555555555";
export const FAKE_PROJECT = "abcdefghijklmnopqrst";

/** Run deployment/creator-upload-cleanup.cjs for UPLOAD_CREATOR over in-memory receipt `rows`. `project` sets
 * both --project and SUPABASE_URL (they agree); `argv` is appended. `report` is the final JSON line. */
export async function runUploadCleanup(argv = [], rows = [], { project = FAKE_PROJECT } = {}) {
  const src = readTarget(UPLOAD_CLEANUP);
  assert.ok(src !== null, `target retired: ${UPLOAD_CLEANUP}`);
  const sink = [];
  const { rec, mod } = fakeSupabase(rows, { sink });
  const r = await runCjsInVm(src, {
    modules: { "@supabase/supabase-js": mod },
    argv: [`--creator=${UPLOAD_CREATOR}`, `--project=${project}`, ...argv],
    env: { SUPABASE_URL: `https://${project}.supabase.co`, SUPABASE_SERVICE_KEY: "fake-not-a-key" },
    sink, filename: "creator-upload-cleanup.cjs",
  });
  return { ...r, rec, report: lastJson(r.logs) };
}
