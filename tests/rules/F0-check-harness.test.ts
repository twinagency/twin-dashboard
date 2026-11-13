/**
 * Rule (F0): scripts/check.sh exec runs one step; RED beats INFRA; a step cap or blown budget is RED
 * and kills the step, as does leaving processes behind or an interrupt; steps run in the loopback-only network sandbox, /usr/bin's
 * (refused without, unless opted in to an inherited one the kernel confirms); steps get a scrubbed env (premerge.sh children:
 * F0-premerge-env.test.ts); a prod Supabase name in our env is refused; no KEY/TOKEN/SECRET/PASSWORD value reaches the evidence.
 * Drives the real scripts offline; sentinels are synthetic. Control: `exec true` is EXEC.
 * Run: nice -n 10 node --import tsx --test --test-concurrency=1 tests/rules/F0-check-harness.test.ts
 */
import assert from "node:assert/strict";
import { execFile, spawnSync, type ChildProcess, type ExecFileException } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

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
  const base = { NODE_ENV: "test" as const, PATH: process.env.PATH, HOME: process.env.HOME ?? "", CHECK_EVIDENCE_DIR: root, CHECK_INHERITED_SANDBOX: "1" };
  const done = new Promise<Done>((ok) => {
    child = execFile(cmd[0], cmd.slice(1), { encoding: "utf8", env: { ...base, ...env } }, (err: ExecFileException | null, stdout: string, stderr: string) => {
      ok({ code: err ? Number(err.code) : 0, out: stdout + stderr, root, secs: (Date.now() - t) / 1000 });
    });
  });
  return { child, done };
}
const run = (args: string[], env: Record<string, string> = {}, o: Opts = {}) => start(args, env, o).done;
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

test("control: exec true is EXEC", async () => {
  const r = await run(["exec", "true"]);
  const v = verdict(r.root);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual([v.mode, v.verdict, typeof v.sha, typeof v.wallSecs], ["exec", "EXEC", "string", "number"]);
  assert.deepEqual(Object.keys(v.steps[0]).slice(0, 3), ["name", "status", "secs"]);
  assert.match(r.out, /^EXEC exec @ \S+ pass=1 fail=0 skip=0 infra=0/m);
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

test("exec runs its step in /usr/bin/sandbox-exec's loopback-only sandbox, never a PATH shadow, and refuses (INFRA) without one", async () => {
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

test("a KEY/TOKEN/SECRET/PASSWORD value from our env or the repo's .env files, or a JWT, is redacted; NEXT_PUBLIC_/PUBLISHABLE are not", async () => {
  const dotenv = 'OPENROUTER_API_KEY="sentinel-or-key-1a2b"\nexport TELEGRAM_BOT_TOKEN=sentinel-bot-tok-3c4d\nNEXT_PUBLIC_X_KEY=sentinel-pub-5e6f\n';
  const ours = { DASHBOARD_PASSWORD: PW, DASHBOARD_SESSION_SECRET: "sentinel-sess-7a8b", STRIPE_PUBLISHABLE_KEY: "sentinel-pub-9c0d" };
  const said = `${PW} sentinel-sess-7a8b sentinel-pub-9c0d jwt eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZSJ9.c2lnbmF0dXJl`;
  const r = await run(["exec", "sh", "-c", `cat .env.local; echo ${said}`], ours, { cwd: repoCopy({ ".env.local": dotenv }) });
  const log = files(r.root).filter((f) => f.endsWith("exec.log")).map((f) => readFileSync(f, "utf8")).join("");
  assert.equal(r.code, 0, r.out);
  for (const s of [PW, "sentinel-sess-7a8b", "sentinel-or-key-1a2b", "sentinel-bot-tok-3c4d", "eyJyb2xl"]) assert.ok(!log.includes(s), `${s}: ${log}`);
  for (const s of ["sentinel-pub-5e6f", "sentinel-pub-9c0d"]) assert.ok(log.includes(s), `${s}: ${log}`);
});
