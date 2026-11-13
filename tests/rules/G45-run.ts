// G45: regression guard promoted from known-red (fix-sweep tests/known-red/w1-10-*); the "KNOWN RED" lines below are history.
// Shared helper for the W1 lane 10 known-reds. Not a test file (never list it in init.sh).
// runScrubbed (behavioural K2/K3/K4): runs a child with a scrubbed env (PATH, HOME, NODE_ENV=test plus explicit extras
// only) as the leader of its own process group, captures stdout+stderr, and SIGKILLs the WHOLE group on timeout, again
// when the child exits (reaping grandchildren such as tsx workers or a stray `next dev`), and if this process exits first.
// runLines/npmRuns/packageScripts (static K1a/K1b): read package.json and .github/workflows; no YAML dependency.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));

export type RunResult = { status: number | null; signal: NodeJS.Signals | null; out: string };
export type RunOptions = { timeoutMs: number; cwd?: string; env?: Record<string, string> };

export function runScrubbed(cmd: string, args: string[], { timeoutMs, cwd = ROOT, env = {} }: RunOptions): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, detached: true, stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", NODE_ENV: "test", ...env } });
    /** SIGKILL the child's process group; ESRCH (group already gone) is ignored. */
    const killGroup = () => {
      if (!child.pid) return;
      try { process.kill(-child.pid, "SIGKILL"); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e; }
    };
    process.once("exit", killGroup);
    let out = "", exit: { status: number | null; signal: NodeJS.Signals | null } | null = null, done = false;
    let grace: NodeJS.Timeout | undefined;
    const finish = () => {
      if (done || !exit) return;
      done = true; clearTimeout(timer); clearTimeout(grace); killGroup(); process.removeListener("exit", killGroup);
      resolve({ ...exit, out });
    };
    child.stdout.on("data", d => { out += d; });
    child.stderr.on("data", d => { out += d; });
    child.on("error", e => { clearTimeout(timer); process.removeListener("exit", killGroup); reject(e); });
    const timer = setTimeout(killGroup, timeoutMs);
    // `close` waits for stdio; a surviving grandchild could hold the pipes, so resolve at most 2 s after `exit`.
    child.on("exit", (status, signal) => { exit = { status, signal }; grace = setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); finish(); }, 2_000); });
    child.on("close", () => finish());
  });
}

export const WORKFLOWS = path.join(ROOT, ".github/workflows");
export const packageScripts = (): Record<string, string> => JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts;

/**
 * Shell lines of every `run:` step in a workflow, comment lines dropped. Inline values are unquoted; a `|`/`>` block
 * runs to the first non-blank line indented less than its first content line. Lines ending in `\` are joined with the
 * next before anything matches on them.
 */
export function runLines(file: string): string[] {
  const lines = readFileSync(path.join(WORKFLOWS, file), "utf8").split("\n");
  const raw: string[] = [];
  const indentOf = (l: string) => l.search(/\S/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const rest = m[2].trim();
    if (!/^[|>][-+]?\d*$/.test(rest)) { raw.push(rest.replace(/^(["'])(.*)\1$/, "$2")); continue; }
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;
    const block = j < lines.length ? indentOf(lines[j]) : -1;
    if (block <= m[1].length) continue;
    while (i + 1 < lines.length && (lines[i + 1].trim() === "" || indentOf(lines[i + 1]) >= block)) raw.push(lines[++i].trim());
  }
  const joined: string[] = [];
  for (const l of raw) {
    const prev = joined.length ? joined[joined.length - 1] : undefined;
    if (prev !== undefined && prev.endsWith("\\")) joined[joined.length - 1] = `${prev.slice(0, -1).trimEnd()} ${l}`;
    else joined.push(l);
  }
  return joined.filter(l => l && !l.startsWith("#"));
}

/** Script names a shell line runs via `npm run X`. */
export const npmRuns = (cmd: string) => [...cmd.matchAll(/\bnpm run ([\w:.-]+)/g)].map(m => m[1]);
