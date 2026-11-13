/**
 * Rule (F0): scripts/check.sh records exactly check-plan.ts's rows for the mode; RED beats INFRA; a step cap or blown budget is RED
 * and kills the step, as does leaving processes behind or an interrupt; steps run in the loopback-only network sandbox (refused
 * without, unless already inside it); steps get a
 * scrubbed env (premerge.sh children: F0-premerge-env.test.ts); a prod Supabase name in our env is refused; no secret reaches the evidence.
 * live refuses (zero requests) unless the dashboard process on the port provably targets a loopback Supabase; it only sends anonymous
 * page GETs and reads the DB read-only. Required (live mode): stack down, auth on or a refused target is INFRA. Optional (fast, run
 * alone via CHECK_LIVE_ONLY=1, verdict STAGE): the same three are a named skip. Fakes: a child-process dashboard, a fake psql.
 * Drives the real scripts offline; sentinels are synthetic. Control: `exec true` is EXEC.
 * Run: nice -n 10 node --import tsx --test --test-concurrency=1 tests/rules/F0-check-harness.test.ts
 */
import assert from "node:assert/strict";
import { execFile, spawn, spawnSync, type ChildProcess, type ExecFileException } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { plan, premergeSuites, rows } from "../../scripts/check-plan";

type Verdict = { mode: string; verdict: string; sha: string; wallSecs: number; steps: { name: string; status: string; note: string }[] };
type Done = { code: number; out: string; root: string; secs: number };

const PW = "sentinel-pw-6f1c2a9e";
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function until(ok: () => boolean, ms = 5000) {
  const t = Date.now();
  while (!ok() && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 50));
  return ok();
}

// psql stand-in: records its options, prints a well-formed row or fails like a refused connection.
const bin = tmp("f0-bin-");
const PSQL = `#!/bin/sh
echo "$PGOPTIONS $*" >>"${bin}/psql.log"
[ -e "${bin}/fail" ] && { echo "connection refused" >&2; exit 2; }
echo 'on|3|1'
`;
writeFileSync(join(bin, "psql"), PSQL);
chmodSync(join(bin, "psql"), 0o755);

// The fake dashboard is a child process so the harness has to find it by port and read ITS cwd's .env files.
const FAKE = `
const s = require("http").createServer((q, r) => {
  console.log(JSON.stringify({ method: q.method, url: q.url }));
  const m = process.env.FAKE_MODE;
  if (m === "auth") { r.writeHead(307, { location: "/admin-auth?next=/overview" }); return r.end(); }
  if (m === "500" && q.url === "/clones") { r.writeHead(500); return r.end("boom"); }
  const title = (q.url === "/api-access" ? "API access · " : "") + "Twin Console";
  r.writeHead(200, { "content-type": "text/html" });
  r.end('<html data-brand-theme="t"><title>' + title + "</title>" + (m === "prod" ? "aouaenqayfltoqrmpitg" : "") + "</html>");
});
s.listen(0, "127.0.0.1", () => console.log("PORT " + s.address().port));`;
async function dashboard(env: Record<string, string>, mode = "ok") {
  const cwd = tmp("f0-dash-");
  for (const [f, text] of Object.entries(env)) writeFileSync(join(cwd, f), text);
  const child = spawn(process.execPath, ["-e", FAKE], { cwd, env: { NODE_ENV: "test" as const, PATH: process.env.PATH, FAKE_MODE: mode } });
  const hits: { method: string; url: string }[] = [];
  let port = 0;
  child.stdout.on("data", (b) => {
    for (const l of String(b).split("\n").filter(Boolean)) {
      if (l.startsWith("PORT ")) port = Number(l.slice(5));
      else hits.push(JSON.parse(l));
    }
  });
  await until(() => port > 0);
  return { url: `http://127.0.0.1:${port}`, hits, stop: () => child.kill() };
}
const SECRET = "sentinel-service-key-77aa";
const GOOD = {
  ".env": `SUPABASE_URL=http://127.0.0.1:54321\nSUPABASE_SERVICE_KEY=${SECRET}\n`,
  ".env.development.local": 'NEXT_PUBLIC_SUPABASE_URL="http://localhost:54321"\n',
};

/** Run scripts/check.sh with a minimal env plus `env`, evidence in a fresh temp root. */
function start(args: string[], env: Record<string, string> = {}) {
  const root = tmp("f0-check-");
  const t = Date.now();
  let child!: ChildProcess;
  const done = new Promise<Done>((ok) => {
    child = execFile("bash", ["scripts/check.sh", ...args], { encoding: "utf8", env: { NODE_ENV: "test" as const, PATH: `${bin}:${process.env.PATH}`, HOME: process.env.HOME ?? "", CHECK_EVIDENCE_DIR: root, ...env } }, (err: ExecFileException | null, stdout: string, stderr: string) => {
      ok({ code: err ? Number(err.code) : 0, out: stdout + stderr, root, secs: (Date.now() - t) / 1000 });
    });
  });
  return { child, done };
}
const run = (args: string[], env: Record<string, string> = {}) => start(args, env).done;
/** fast's live stage alone (LIVE=opt), via the CHECK_LIVE_ONLY hook. */
const stage = (base: string) => run(["fast"], { CHECK_LIVE_ONLY: "1", CHECK_BASE_URL: base });
const verdict = (root: string): Verdict => JSON.parse(readFileSync(join(root, readdirSync(root)[0], "verdict.json"), "utf8"));
const files = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : [join(d, f)]));
const evidence = (root: string) => files(root).map((f) => readFileSync(f, "utf8")).join("\n");
// exit 0 iff outbound network is loopback-only here: a UDP connect to TEST-NET-1 sends no packet, the sandbox refuses it
const PROBE = 'socket(my $s, PF_INET, SOCK_DGRAM, 0) or exit 2; exit(connect($s, pack_sockaddr_in(9, inet_aton("192.0.2.1"))) ? 1 : 0)';
const confinedHere = spawnSync("perl", ["-MSocket", "-e", PROBE]).status === 0; // true when a sandboxed step (fast) runs this file
/** A PATH with everything but sandbox-exec. */
function noSandboxPath() {
  const usr = tmp("f0-usrbin-");
  for (const f of readdirSync("/usr/bin")) {
    if (f !== "sandbox-exec") symlinkSync(join("/usr/bin", f), join(usr, f));
  }
  return `${usr}:/bin:/usr/sbin:/sbin:${dirname(process.execPath)}`;
}

test("control: exec true is EXEC; plan records exactly check-plan.ts's plan rows (name, status = action, note), never GREEN", async () => {
  const r = await run(["exec", "true"]);
  const v = verdict(r.root);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual([v.mode, v.verdict, typeof v.sha, typeof v.wallSecs], ["exec", "EXEC", "string", "number"]);
  assert.deepEqual(Object.keys(v.steps[0]).slice(0, 3), ["name", "status", "secs"]);
  assert.match(r.out, /^EXEC exec @ \S+ pass=1 fail=0 skip=0 infra=0/m);
  const p = verdict((await run(["plan"])).root);
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  const expected = rows("plan", plan(scripts, premergeSuites())).map((x) => [x.name, x.action, x.note]);
  expected.push(["live", "plan", "runs if listening"]);
  assert.equal(p.verdict, "PLAN");
  assert.deepEqual(p.steps.map((s) => [s.name, s.status, s.note]), expected);
});

test("a failing step is RED, exit 1; a step cap is RED naming the step; a blown budget is RED 'budget'", async () => {
  const r = await run(["exec", "false"]);
  assert.equal(r.code, 1, r.out);
  assert.equal(verdict(r.root).verdict, "RED");
  for (const [knob, why] of [["CHECK_STEP_SECS", /step cap/], ["CHECK_BUDGET_SECS", /budget/]] as const) {
    const c = await run(["exec", "sleep", "60"], { [knob]: "1" });
    assert.equal(c.code, 1, c.out);
    assert.ok(c.secs < 15, `took ${c.secs}s`);
    const s = verdict(c.root).steps.find((x) => x.name === "exec")!;
    assert.equal(s.status, "fail");
    assert.match(s.note, why);
  }
});

test("a step that leaves a process behind fails and the process is killed", async () => {
  const pidf = join(tmp("f0-pid-"), "pid");
  const r = await run(["exec", "sh", "-c", `sleep 300 & echo $! >${pidf}`]);
  assert.equal(r.code, 1, r.out);
  assert.match(verdict(r.root).steps[0].note, /left processes/);
  assert.ok(await until(() => !alive(Number(readFileSync(pidf, "utf8")))), "survivor still alive");
});

test("TERM to the harness kills the running step's process group", async () => {
  const pidf = join(tmp("f0-pid-"), "pid");
  const h = start(["exec", "sh", "-c", `echo $$ >${pidf}; exec sleep 300`]);
  assert.ok(await until(() => existsSync(pidf) && readFileSync(pidf, "utf8").trim() !== ""));
  h.child.kill("SIGTERM");
  const r = await h.done;
  assert.equal(r.code, 2, r.out);
  assert.ok(r.secs < 15, `took ${r.secs}s`);
  assert.ok(await until(() => !alive(Number(readFileSync(pidf, "utf8")))), "step outlived the harness");
});

test("fast refuses (INFRA) without the loopback-only network sandbox", async () => {
  const r = await run(["fast"], { PATH: noSandboxPath() });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /sandbox/);
});

test("exec runs its step in the loopback-only network sandbox, and refuses (INFRA) without one unless already inside it", async () => {
  const r = await run(["exec", "perl", "-MSocket", "-e", PROBE]);
  assert.equal(r.code, 0, r.out);
  const bare = await run(["exec", "true"], { PATH: noSandboxPath() });
  assert.equal(bare.code, confinedHere ? 0 : 2, bare.out);
  if (!confinedHere) assert.match(bare.out, /infra preflight .*sandbox/);
});

test("steps get a scrubbed env: no inherited vars, dotenv pointed at /dev/null, a private TMPDIR", async () => {
  const log = evidence((await run(["exec", "env"], { F0_LEAK: "sentinel-leak" })).root);
  assert.match(log, /^DOTENV_CONFIG_PATH=\/dev\/null$/m);
  assert.match(log, /^TMPDIR=.*twin-check/m);
  assert.ok(!log.includes("sentinel-leak"));
});

test("a prod Supabase project or a non-loopback Supabase URL in our env is refused (INFRA) before any step runs", async () => {
  const bad = [
    ["SUPABASE_URL", "https://aouaenqayfltoqrmpitg.supabase.co"],
    ["NEXT_PUBLIC_SUPABASE_URL", "http://example.com"],
    ["F0_ANY", "cnnsllgzskqkvdovyiiv"],
  ];
  for (const [name, url] of bad) {
    const r = await run(["exec", "true"], { [name]: url });
    assert.equal(r.code, 2, `${name}: ${r.out}`);
    assert.match(r.out, /refuse/);
    assert.ok(!r.out.includes("pass  exec"), r.out);
  }
});

test("a secret printed by a step is redacted from its log", async () => {
  const r = await run(["exec", "echo", `pw ${PW} jwt eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZSJ9.c2lnbmF0dXJl`], { DASHBOARD_PASSWORD: PW });
  const log = files(r.root).filter((f) => f.endsWith("exec.log")).map((f) => readFileSync(f, "utf8")).join("");
  assert.match(log, /\[REDACTED\]/);
  assert.ok(!log.includes(PW) && !log.includes("eyJyb2xl"), log);
});

test("live refuses before any request unless the dashboard's .env files name only loopback Supabase: INFRA in live, a skip in fast", async () => {
  const bad: Record<string, string>[] = [
    { ".env": `SUPABASE_URL=https://aouaenqayfltoqrmpitg.supabase.co\nSUPABASE_SERVICE_KEY=${SECRET}\n` },
    { ".env": "SUPABASE_URL=http://127.0.0.1:54321\n", ".env.local": "NEXT_PUBLIC_SUPABASE_URL=https://cnnsllgzskqkvdovyiiv.supabase.co\n" },
    { ".env.development": "export SUPABASE_URL='http://example.com'\n" },
    { ".env": `SUPABASE_SERVICE_KEY=${SECRET}\n` }, // names no target at all: the process env could hold anything
  ];
  for (const env of bad) {
    const d = await dashboard(env);
    try {
      const req = await run(["live"], { CHECK_BASE_URL: d.url });
      assert.equal(req.code, 2, `${JSON.stringify(env)}: ${req.out}`);
      assert.match(req.out, /refuse/);
      const opt = await stage(d.url);
      assert.equal(opt.code, 0, `${JSON.stringify(env)}: ${opt.out}`);
      assert.deepEqual(verdict(opt.root).steps.map((s) => [s.name, s.status]), [["live", "skip"]]);
      assert.match(opt.out, /skip  live .*refuse/);
      assert.deepEqual(d.hits, []);
      for (const r of [req, opt]) assert.ok(!(r.out + evidence(r.root)).includes(SECRET));
    } finally {
      d.stop();
    }
  }
  const d = await dashboard(GOOD);
  try {
    for (const base of ["http://example.com", "http://localhost.evil.com:3001", "https://localhost:3001", "http://user@example.com/@localhost", `${d.url}/x`]) {
      for (const r of [await run(["live"], { CHECK_BASE_URL: base }), await stage(base)]) {
        assert.equal(r.code, 2, `${base}: ${r.out}`);
        assert.match(r.out, /refuse/);
      }
    }
    assert.deepEqual(d.hits, []);
  } finally {
    d.stop();
  }
});

test("live is GREEN on a well-formed stack (fast's stage: STAGE, never GREEN), anonymous page GETs only, DB read-only, no leaks", async () => {
  const d = await dashboard(GOOD);
  try {
    const r = await run(["live"], { CHECK_BASE_URL: d.url, DASHBOARD_PASSWORD: PW });
    assert.equal(r.code, 0, r.out);
    const v = verdict(r.root);
    assert.deepEqual(v.steps.filter((s) => s.status !== "pass"), []);
    assert.ok(v.steps.some((s) => s.name === "live:db"));
    assert.deepEqual(d.hits.filter((h) => h.method !== "GET" || h.url.startsWith("/api/") || h.url.startsWith("/admin-auth")), []);
    const psql = readFileSync(join(bin, "psql.log"), "utf8");
    assert.match(psql, /^-c default_transaction_read_only=on -h 127\.0\.0\.1 -p 54322 /m);
    const all = r.out + evidence(r.root);
    assert.ok(!all.includes(SECRET) && !all.includes(PW));
    assert.match(r.out, /127\.0\.0\.1:54321/);
    const opt = await stage(d.url);
    assert.equal(opt.code, 0, opt.out);
    assert.match(opt.out, /^STAGE fast @/m);
    assert.deepEqual(verdict(opt.root).steps.map((s) => s.name), v.steps.map((s) => s.name));
    assert.ok(verdict(opt.root).steps.every((s) => s.name.startsWith("live:") && s.status === "pass"));
  } finally {
    d.stop();
  }
});

test("live: login demanded (INFRA; a skip in fast), DB unreadable or prod in a response INFRA, a failing page RED", async () => {
  const cases = [
    ["live", "auth", false, 2, /auth on/],
    ["fast", "auth", false, 0, /skip  live .*auth on/],
    ["live", "ok", true, 2, /psql/],
    ["live", "prod", false, 2, /refuse/],
    ["live", "500", true, 1, /RED/],
  ] as const;
  for (const [mode, fake, psqlFails, code, why] of cases) {
    const d = await dashboard(GOOD, fake);
    if (psqlFails) writeFileSync(join(bin, "fail"), "");
    try {
      const r = mode === "live" ? await run(["live"], { CHECK_BASE_URL: d.url }) : await stage(d.url);
      assert.equal(r.code, code, `${mode}/${fake}: ${r.out}`);
      assert.match(r.out, why);
      if (fake === "auth") assert.deepEqual(d.hits, [{ method: "GET", url: "/overview" }]);
    } finally {
      d.stop();
      rmSync(join(bin, "fail"), { force: true });
    }
  }
});

test("nothing listening: live is INFRA, fast's live stage is a 'stack down' skip", async () => {
  const req = await run(["live"], { CHECK_BASE_URL: "http://127.0.0.1:9" });
  assert.equal(req.code, 2, req.out);
  assert.match(req.out, /stack down/);
  const opt = await stage("http://127.0.0.1:9");
  assert.equal(opt.code, 0, opt.out);
  assert.deepEqual(verdict(opt.root).steps.map((s) => [s.name, s.status, s.note]), [["live", "skip", "stack down: nothing listening on http://127.0.0.1:9"]]);
});
