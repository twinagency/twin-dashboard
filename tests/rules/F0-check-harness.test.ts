/**
 * Rule (F0): scripts/check.sh records exactly check-plan.ts's rows for the mode; RED beats INFRA; a step cap or blown budget is RED
 * and kills the step, as does leaving processes behind or an interrupt; steps run in the loopback-only network sandbox, /usr/bin's
 * (refused without, unless opted in to an inherited one the kernel confirms); steps get a scrubbed env (premerge.sh children:
 * F0-premerge-env.test.ts); a prod Supabase name in our env is refused; no KEY/TOKEN/SECRET/PASSWORD value reaches the evidence.
 * live refuses (zero requests) unless the dashboard process on the port provably targets a loopback Supabase (its env, or next dev's
 * parent's, bad or unreadable: RED); it only sends anonymous page GETs (curl -q) and reads the DB read-only, within the budget.
 * Required (live mode): stack down, auth on or a refused target is INFRA. Optional (fast's stage, alone as mode `stage`, verdict
 * STAGE): the same three are a named skip. Fakes: a child-process dashboard (optionally retitled, or under a fake next dev), a fake psql.
 * Drives the real scripts offline; sentinels are synthetic. Control: `exec true` is EXEC. check.sh is macOS only (sandbox-exec): off
 * macOS it refuses (INFRA), and only that and the env refusal, which runs first, are tested there; the rest skip.
 * Run: nice -n 10 node --import tsx --test --test-concurrency=1 tests/rules/F0-check-harness.test.ts
 */
import assert from "node:assert/strict";
import { execFile, execFileSync, spawn, spawnSync, type ChildProcess, type ExecFileException } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { NEEDS, OWNER, plan, premergeSuites, rows } from "../../scripts/check-plan";

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
[ -e "${bin}/slow" ] && sleep 60
[ -e "${bin}/fail" ] && { echo "connection refused" >&2; exit 2; }
echo 'on|3|1'
`;
writeFileSync(join(bin, "psql"), PSQL);
chmodSync(join(bin, "psql"), 0o755);

// The fake dashboard is a child process so the harness has to find it by port and read ITS env and cwd's .env files.
const FAKE = `
if (process.env.FAKE_TITLE) process.title = process.env.FAKE_TITLE; // hides its env from ps -E, as next-server's does
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
// next dev's shape: a `node .../next dev` parent forks the server, which inherits its env and retitles itself
const NEXT = `const c = require("child_process").fork(__dirname + "/server.js", { stdio: ["inherit", "inherit", "inherit", "ipc"] });
process.on("SIGTERM", () => { c.kill(); process.exit(0); });`;
type DashOpts = { procEnv?: Record<string, string>; title?: string; viaNext?: boolean; noPath?: boolean };
async function dashboard(env: Record<string, string>, mode = "ok", { procEnv = {}, title, viaNext = false, noPath = false }: DashOpts = {}) {
  const cwd = tmp("f0-dash-");
  for (const [f, text] of Object.entries(env)) writeFileSync(join(cwd, f), text);
  writeFileSync(join(cwd, "server.js"), FAKE);
  writeFileSync(join(cwd, "next"), NEXT);
  const t = title ?? (viaNext ? "next-server (v0)" : undefined);
  const args = viaNext ? [join(cwd, "next"), "dev"] : [join(cwd, "server.js")];
  const child = spawn(process.execPath, args, { cwd, env: { NODE_ENV: "test" as const, ...(noPath ? {} : { PATH: process.env.PATH }), FAKE_MODE: mode, ...(t ? { FAKE_TITLE: t } : {}), ...procEnv } });
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

// Can sandbox-exec apply a profile here? It cannot nest, so not inside any sandbox (a fast step's, codex's).
const canBox = spawnSync("/usr/bin/sandbox-exec", ["-p", "(version 1)(allow default)", "/usr/bin/true"]).status === 0;
const LOOP = '(version 1)(allow default)(deny network-outbound (remote ip))(allow network-outbound (remote ip "localhost:*"))';
type Opts = { outer?: string; cwd?: string };
/** Run <cwd>/scripts/check.sh with a minimal env plus `env`, evidence in a fresh temp root; inside sandbox profile `outer` if we can. */
function start(args: string[], env: Record<string, string> = {}, { outer, cwd = "." }: Opts = {}) {
  const root = tmp("f0-check-");
  const t = Date.now();
  let child!: ChildProcess;
  const cmd = ["bash", join(cwd, "scripts/check.sh"), ...args];
  if (outer && canBox) cmd.unshift("/usr/bin/sandbox-exec", "-p", outer);
  // opted in to an inherited sandbox: this file runs inside fast's step sandbox, where check.sh cannot apply its own
  // and never the real dashboard on :3001 (fast's live stage): nothing listens on :9
  const base = { NODE_ENV: "test" as const, PATH: `${bin}:${process.env.PATH}`, HOME: process.env.HOME ?? "", CHECK_EVIDENCE_DIR: root, CHECK_INHERITED_SANDBOX: "1", CHECK_BASE_URL: "http://127.0.0.1:9" };
  const done = new Promise<Done>((ok) => {
    child = execFile(cmd[0], cmd.slice(1), { encoding: "utf8", env: { ...base, ...env } }, (err: ExecFileException | null, stdout: string, stderr: string) => {
      ok({ code: err ? Number(err.code) : 0, out: stdout + stderr, root, secs: (Date.now() - t) / 1000 });
    });
  });
  return { child, done };
}
/** For a test that needs macOS: off it, check.sh refuses (INFRA) before running anything. */
const MAC = { skip: process.platform !== "darwin" && "check.sh is a macOS dev-box harness (sandbox-exec)" };
const run = (args: string[], env: Record<string, string> = {}, o: Opts = {}) => start(args, env, o).done;
/** fast's live stage alone (LIVE=opt): the stage mode. */
const stage = (base: string, env: Record<string, string> = {}) => run(["stage"], { CHECK_BASE_URL: base, ...env });
const verdict = (root: string): Verdict => JSON.parse(readFileSync(join(root, readdirSync(root)[0], "verdict.json"), "utf8"));
const files = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : [join(d, f)]));
const evidence = (root: string) => files(root).map((f) => readFileSync(f, "utf8")).join("\n");
// exit 0 iff the kernel refuses (EPERM) UDP to two TEST-NETs and the IPv6 documentation prefix: no packet is sent
const PROBE = 'use Socket qw(:all); for (["192.0.2.1", PF_INET], ["198.51.100.1", PF_INET], ["2001:db8::1", AF_INET6]) {' +
  ' my ($h, $f) = @$_; socket(my $s, $f, SOCK_DGRAM, 0) or exit 2; my $a = inet_pton($f, $h);' +
  ' exit 1 if connect($s, $f == PF_INET ? pack_sockaddr_in(9, $a) : pack_sockaddr_in6(9, $a)) || !$!{EPERM} } exit 0';
/** A copy of scripts/check.sh in a fresh dir with `extra` files, as its repo root. */
function repoCopy(extra: Record<string, string> = {}) {
  const d = tmp("f0-repo-");
  mkdirSync(join(d, "scripts"));
  copyFileSync("scripts/check.sh", join(d, "scripts/check.sh"));
  for (const [f, text] of Object.entries(extra)) writeFileSync(join(d, f), text);
  return d;
}

/** A committed git repo for a real `fast` run: check.sh, check-plan.ts (or `planner`), our node_modules, a premerge.sh stub (covers
 *  test:p, fails if the repo has PREMERGE_FAILS) and test:* scripts keeping every NEEDS/OWNER entry live, plus `scripts`. */
function fastRepo(scripts: Record<string, string>, { planner = readFileSync("scripts/check-plan.ts", "utf8"), fails = false } = {}) {
  const held = [...Object.keys(NEEDS), ...OWNER].map((f) => `node ${f}`).join(" && ");
  const d = repoCopy({
    "package.json": JSON.stringify({ scripts: { "test:p": "node ok.mjs", "test:held": held, ...scripts } }),
    "ok.mjs": "", "bad.mjs": "process.exit(1)", "next-env.d.ts": "", ".gitignore": "node_modules\n", ...(fails ? { PREMERGE_FAILS: "" } : {}),
  });
  writeFileSync(join(d, "scripts/check-plan.ts"), planner);
  writeFileSync(join(d, "scripts/premerge.sh"), '[ "$1" = --list ] && { echo test:p; exit 0; }\n[ ! -e PREMERGE_FAILS ]\n');
  chmodSync(join(d, "scripts/premerge.sh"), 0o755);
  symlinkSync(resolve("node_modules"), join(d, "node_modules"));
  const commit = ["-c", "user.name=f0", "-c", "user.email=f0@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "f0"];
  for (const a of [["init", "-q"], ["add", "."], commit]) execFileSync("git", a, { cwd: d });
  return d;
}

test("control: exec true is EXEC; plan records exactly check-plan.ts's plan rows (name, status = action, note), never GREEN", MAC, async () => {
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

test("a failing step is RED, exit 1; a step cap is RED naming the step; a blown budget is RED 'budget'", MAC, async () => {
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

test("a step that leaves a process behind fails and the process is killed", MAC, async () => {
  const pidf = join(tmp("f0-pid-"), "pid");
  const r = await run(["exec", "sh", "-c", `sleep 300 & echo $! >${pidf}`]);
  assert.equal(r.code, 1, r.out);
  assert.match(verdict(r.root).steps[0].note, /left processes/);
  assert.ok(await until(() => !alive(Number(readFileSync(pidf, "utf8")))), "survivor still alive");
});

test("TERM to the harness kills the running step's process group", MAC, async () => {
  const pidf = join(tmp("f0-pid-"), "pid");
  const h = start(["exec", "sh", "-c", `echo $$ >${pidf}; exec sleep 300`]);
  assert.ok(await until(() => existsSync(pidf) && readFileSync(pidf, "utf8").trim() !== ""));
  h.child.kill("SIGTERM");
  const r = await h.done;
  assert.equal(r.code, 2, r.out);
  assert.ok(r.secs < 15, `took ${r.secs}s`);
  assert.ok(await until(() => !alive(Number(readFileSync(pidf, "utf8")))), "step outlived the harness");
});

test("fast refuses (INFRA) without the loopback-only network sandbox", MAC, async () => {
  const r = await run(["fast"], { CHECK_INHERITED_SANDBOX: "" }, { outer: LOOP });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /sandbox/);
});

test("fast is GREEN only when premerge and every run row pass: a failing leaf or premerge, an unknown action, premerge not run: RED", MAC, async () => {
  const ok = await run(["fast"], {}, { cwd: fastRepo({ "test:ok": "node ok.mjs --x" }) });
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /^GREEN fast @/m);
  assert.deepEqual(verdict(ok.root).steps.filter((s) => s.status === "pass").map((s) => s.name), ["premerge", "test:ok/ok"]);
  const plannerSrc = readFileSync("scripts/check-plan.ts", "utf8");
  const bad = [
    fastRepo({ "test:bad": "node bad.mjs" }),
    fastRepo({ "test:ok": "node ok.mjs --x" }, { fails: true }),
    fastRepo({ "test:ok": "node ok.mjs --x" }, { planner: plannerSrc.replace('action: "skip", note', 'action: "maybe", note') }),
    fastRepo({ "test:ok": "node ok.mjs --x" }, { planner: plannerSrc.replace('kind: "run", why: "", env: ["PREMERGE_BASE"]', 'kind: "owner", why: "", env: ["PREMERGE_BASE"]') }),
  ];
  for (const [cwd, env] of [...bad.map((d) => [d, {}] as const), [bad[0], { CHECK_LIVE_ONLY: "1" }] as const]) {
    const r = await run(["fast"], env, { cwd });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /^RED fast @/m);
  }
});

test("the planner and the verdict writer get a scrubbed env: a NODE_OPTIONS preload never runs", MAC, async () => {
  const d = tmp("f0-preload-");
  writeFileSync(join(d, "pre.cjs"), `require("fs").appendFileSync(${JSON.stringify(join(d, "ran"))}, "x")`);
  const r = await run(["plan"], { NODE_OPTIONS: `--require=${join(d, "pre.cjs")}` });
  assert.equal(r.code, 0, r.out);
  assert.ok(!existsSync(join(d, "ran")), "preload ran");
});

test("exec runs its step in /usr/bin/sandbox-exec's loopback-only sandbox, never a PATH shadow, and refuses (INFRA) without one", MAC, async () => {
  const shadow = tmp("f0-shadow-"); // drops the profile and runs the step bare
  writeFileSync(join(shadow, "sandbox-exec"), '#!/bin/sh\nshift 2\nexec "$@"\n');
  chmodSync(join(shadow, "sandbox-exec"), 0o755);
  const r = await run(["exec", "perl", "-e", PROBE], { PATH: `${shadow}:${process.env.PATH}` });
  assert.equal(r.code, 0, r.out);
  // Inside a sandbox sandbox-exec cannot nest: a loopback-only one runs the step only if opted in. One that leaves TCP or IPv6
  // open, or the whole network, is refused even opted in. (Already inside one, canBox is false: only the first two can be built.)
  const cases = [
    [LOOP, "1", 0],
    [LOOP, "", 2],
    ["(version 1)(allow default)", "1", 2],
    ['(version 1)(allow default)(deny network-outbound (remote udp "*:*"))', "1", 2],
    ['(version 1)(allow default)(deny network-outbound (remote ip4 "*:*"))', "1", 2],
  ] as const;
  for (const [outer, opt, code] of cases.slice(0, canBox ? cases.length : 2)) {
    const x = await run(["exec", "perl", "-e", PROBE], { CHECK_INHERITED_SANDBOX: opt }, { outer });
    assert.equal(x.code, code, `${outer} opt-in=${opt}: ${x.out}`);
    if (code) assert.match(x.out, /infra preflight .*sandbox/);
  }
});

test("steps get a scrubbed env: no inherited vars, dotenv pointed at /dev/null, a private TMPDIR", MAC, async () => {
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

test("a KEY/TOKEN/SECRET/PASSWORD value from our env or the repo's .env files, or a JWT, is redacted; NEXT_PUBLIC_/PUBLISHABLE are not", MAC, async () => {
  const dotenv = 'OPENROUTER_API_KEY="sentinel-or-key-1a2b"\nexport TELEGRAM_BOT_TOKEN=sentinel-bot-tok-3c4d\nNEXT_PUBLIC_X_KEY=sentinel-pub-5e6f\n';
  const ours = { DASHBOARD_PASSWORD: PW, DASHBOARD_SESSION_SECRET: "sentinel-sess-7a8b", STRIPE_PUBLISHABLE_KEY: "sentinel-pub-9c0d" };
  const said = `${PW} sentinel-sess-7a8b sentinel-pub-9c0d jwt eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZSJ9.c2lnbmF0dXJl`;
  const r = await run(["exec", "sh", "-c", `cat .env.local; echo ${said}`], ours, { cwd: repoCopy({ ".env.local": dotenv }) });
  const log = files(r.root).filter((f) => f.endsWith("exec.log")).map((f) => readFileSync(f, "utf8")).join("");
  assert.equal(r.code, 0, r.out);
  for (const s of [PW, "sentinel-sess-7a8b", "sentinel-or-key-1a2b", "sentinel-bot-tok-3c4d", "eyJyb2xl"]) assert.ok(!log.includes(s), `${s}: ${log}`);
  for (const s of ["sentinel-pub-5e6f", "sentinel-pub-9c0d"]) assert.ok(log.includes(s), `${s}: ${log}`);
});

test("live refuses before any request unless the dashboard's .env files name only loopback Supabase: INFRA in live, a skip in fast", MAC, async () => {
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

test("live is GREEN on a well-formed stack (fast's stage: STAGE, never GREEN), anonymous page GETs only, DB read-only, no leaks", MAC, async () => {
  const d = await dashboard(GOOD);
  try {
    const home = tmp("f0-home-"); // curl -q: a ~/.curlrc cannot turn the GETs into anything else
    writeFileSync(join(home, ".curlrc"), "request = POST\n");
    const r = await run(["live"], { CHECK_BASE_URL: d.url, DASHBOARD_PASSWORD: PW, HOME: home });
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
    assert.match(opt.out, /^STAGE stage @/m);
    assert.deepEqual(verdict(opt.root).steps.map((s) => s.name), v.steps.map((s) => s.name));
    assert.ok(verdict(opt.root).steps.every((s) => s.name.startsWith("live:") && s.status === "pass"));
  } finally {
    d.stop();
  }
});

test("live: login demanded (INFRA; a skip in fast), DB unreadable or prod in a response INFRA, a failing page RED", MAC, async () => {
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

test("nothing listening: live is INFRA, fast's live stage is a 'stack down' skip", MAC, async () => {
  const req = await run(["live"], { CHECK_BASE_URL: "http://127.0.0.1:9" });
  assert.equal(req.code, 2, req.out);
  assert.match(req.out, /stack down/);
  const opt = await stage("http://127.0.0.1:9");
  assert.equal(opt.code, 0, opt.out);
  assert.deepEqual(verdict(opt.root).steps.map((s) => [s.name, s.status, s.note]), [["live", "skip", "stack down: nothing listening on http://127.0.0.1:9"]]);
});

test("live reads the listening process's own env (next dev's server: its parent's): non-loopback, prod or unreadable is RED, nothing sent", MAC, async () => {
  const bad = [
    [{ procEnv: { SUPABASE_URL: "https://example.com" } }, /live:target .*non-loopback/],
    [{ procEnv: { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:1", X: "aouaenqayfltoqrmpitg" } }, /live:target .*prod/],
    [{ title: "next-server (v0)" }, /live:target .*cannot read the environment/],
    [{ noPath: true }, /live:target .*cannot read the environment/], // read but partial: no PATH= entry
    [{ viaNext: true, procEnv: { SUPABASE_URL: "https://example.com" } }, /live:target .*non-loopback/],
  ] as const;
  for (const [o, why] of bad) {
    const d = await dashboard(GOOD, "ok", o);
    try {
      for (const r of [await run(["live"], { CHECK_BASE_URL: d.url }), await stage(d.url)]) {
        assert.equal(r.code, 1, `${JSON.stringify(o)}: ${r.out}`);
        assert.match(r.out, why);
      }
      assert.deepEqual(d.hits, []);
    } finally {
      d.stop();
    }
  }
  const d = await dashboard(GOOD, "ok", { viaNext: true, procEnv: { SUPABASE_URL: "http://127.0.0.1:54329" } });
  try {
    const r = await run(["live"], { CHECK_BASE_URL: d.url });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /127\.0\.0\.1:54329/);
  } finally {
    d.stop();
  }
});

test("live is held to its budget: a hung psql is killed and RED 'budget'; a stage that ends late is RED 'budget'", MAC, async () => {
  const d = await dashboard(GOOD);
  writeFileSync(join(bin, "slow"), "");
  try {
    const r = await run(["live"], { CHECK_BASE_URL: d.url, CHECK_BUDGET_SECS: "4" });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /fail  live:db .*budget/);
    assert.ok(r.secs < 15, `took ${r.secs}s`);
  } finally {
    d.stop();
    rmSync(join(bin, "slow"), { force: true });
  }
  const slow = tmp("f0-slow-"); // lsof outlasting the budget: the stage ends in a 'stack down' skip, past its budget
  writeFileSync(join(slow, "lsof"), '#!/bin/sh\nsleep 3\nexec /usr/sbin/lsof "$@"\n');
  chmodSync(join(slow, "lsof"), 0o755);
  const late = await stage("http://127.0.0.1:9", { CHECK_BUDGET_SECS: "1", PATH: `${slow}:${bin}:${process.env.PATH}` });
  assert.equal(late.code, 1, late.out);
  assert.match(late.out, /budget/);
});

test("off macOS check.sh refuses (INFRA) after its env check and before any step: no sandbox-exec, no false GREEN", async () => {
  const shim = tmp("f0-uname-"); // a Linux uname on macOS; on Linux the real one
  writeFileSync(join(shim, "uname"), "#!/bin/sh\necho Linux\n");
  chmodSync(join(shim, "uname"), 0o755);
  const r = await run(["exec", "true"], { PATH: `${shim}:${process.env.PATH}` });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /infra preflight .*macOS only: steps need/);
  assert.equal(verdict(r.root).verdict, "INFRA");
  assert.ok(!r.out.includes("pass  exec"), r.out);
});
