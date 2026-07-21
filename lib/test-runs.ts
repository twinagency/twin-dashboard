import fs from "node:fs";
import path from "node:path";

// Server-side helpers for the Test page's sim runs. A run is a directory under
// <repo root>/.test-runs/<runId>/ written by src/dev/test-run.ts (spawned as a
// child process by /api/test/run): an append-only events.ndjson the UI polls,
// plus any voice-note .ogg files the run produced. Fully throwaway — the sim
// fan lives in the runner's memory (SimStore), never in real tables.

// The dashboard runs from dashboard/, the bot runtime from the repo root one
// level up. Resolve defensively in case Next is ever started from the root.
export function repoRoot(): string {
  const up = path.resolve(process.cwd(), "..");
  if (fs.existsSync(path.join(process.cwd(), "src", "dev", "test-run.ts"))) return process.cwd();
  return up;
}

export function runsDir(): string {
  return path.join(repoRoot(), ".test-runs");
}

// Run ids are minted by us (see route.ts) — anything else is rejected before it
// can touch the filesystem.
export function safeRunId(id: string | null): string | null {
  return id && /^[a-z0-9-]{4,64}$/.test(id) ? id : null;
}

export function runDir(runId: string): string {
  return path.join(runsDir(), runId);
}

export type SimEvent = Record<string, unknown> & { t: string };

export function readEvents(runId: string): SimEvent[] {
  const p = path.join(runDir(runId), "events.ndjson");
  if (!fs.existsSync(p)) return [];
  const out: SimEvent[] = [];
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // a partially-flushed last line — the next poll will get it whole
    }
  }
  return out;
}

export function pidAlive(runId: string): boolean {
  const p = path.join(runDir(runId), "pid");
  if (!fs.existsSync(p)) return false;
  const pid = Number(fs.readFileSync(p, "utf8").trim());
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
