/**
 * Rule (F0): scripts/check.sh exec runs one step; RED beats INFRA; a step cap or blown budget is RED
 * and kills the step, as does leaving processes behind or an interrupt; steps run in the loopback-only network sandbox (refused
 * without, unless already inside it); steps get a
 * scrubbed env (premerge.sh children: F0-premerge-env.test.ts); a prod Supabase name in our env is refused; no secret reaches the evidence.
 * Drives the real scripts offline; sentinels are synthetic. Control: `exec true` is EXEC.
 * Run: nice -n 10 node --import tsx --test --test-concurrency=1 tests/rules/F0-check-harness.test.ts
 */
import assert from "node:assert/strict";
import { execFile, spawnSync, type ChildProcess, type ExecFileException } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

/** Run scripts/check.sh with a minimal env plus `env`, evidence in a fresh temp root. */
function start(args: string[], env: Record<string, string> = {}) {
  const root = tmp("f0-check-");
  const t = Date.now();
  let child!: ChildProcess;
  const done = new Promise<Done>((ok) => {
    child = execFile("bash", ["scripts/check.sh", ...args], { encoding: "utf8", env: { NODE_ENV: "test" as const, PATH: process.env.PATH, HOME: process.env.HOME ?? "", CHECK_EVIDENCE_DIR: root, ...env } }, (err: ExecFileException | null, stdout: string, stderr: string) => {
      ok({ code: err ? Number(err.code) : 0, out: stdout + stderr, root, secs: (Date.now() - t) / 1000 });
    });
  });
  return { child, done };
}
const run = (args: string[], env: Record<string, string> = {}) => start(args, env).done;
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
