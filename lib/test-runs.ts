import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { supabaseAdmin } from "./supabase";

// Server-side helpers for the Test page's sim runs. A run is a directory under
// <bot repo root>/.test-runs/<runId>/ written by ../bot/src/dev/test-run.ts,
// spawned as a child process by startTestRun() below (called from
// app/api/test-run/route.ts, and importable directly by any future server
// component, e.g. the AI assistant). It writes an append-only events.ndjson
// the UI polls/streams live, plus any voice-note .ogg files the run produced.
//
// Isolation: test-run.ts uses SimStore, which reads live clone config from
// the real Supabase but keeps every fan-side write in memory — the sim fan
// never becomes a real users/chat_history row. Nothing is ever sent to
// Telegram. See bot/db/migrations/057_test_runs.sql for the full rationale.
//
// Persistence: the `test_runs` table is the source of truth for history. A
// running row is inserted at spawn time; reconcileRun() finalizes it (status,
// summary, full events) once the process is no longer alive, whether that's
// noticed by the live SSE stream or lazily by the history list. The on-disk
// .test-runs/ directory is only needed while a run is actively streaming —
// history reads come straight from the DB row afterward.

// ── fan persona roster shown on the Test page ───────────────────────────────
// Mirrors bot/src/dev/fan-brain.ts PERSONAS (the "dashboard Test page core
// roster" section) — same mirroring convention as lib/persona-facts.ts vs.
// ../bot/src/prompt.ts. Keep both in sync by hand.
export const TEST_PERSONAS: { key: string; label: string; hint: string }[] = [
  { key: "new_fan", label: "New fan", hint: "Brand new, shy, feeling things out. Doesn't offer money yet." },
  { key: "spender", label: "Whale / spender", hint: "Lonely and horny, spends freely once she turns him on." },
  { key: "cheapskate", label: "Cheapskate", hint: "Flirts and begs for free pics, dodges paying, complains about price." },
  { key: "lapsed", label: "Lapsed fan", hint: "Checking back in after weeks away, testing if she still wants him around." },
  { key: "rude", label: "Rude fan", hint: "Blunt, entitled, impatient. Demands free stuff, pushes back on price." },
  { key: "time_waster", label: "Time waster", hint: "Chats forever, never buys, never leaves, dodges every offer." },
];

// The dashboard runs from dashboard/, the bot runtime lives in a sibling "bot"
// directory (both CLAUDE.md files refer to it as "../bot"). Resolve
// defensively: prefer a combined deployment where Next was started from the
// bot repo itself, then the sibling "../bot" layout used in local dev, then
// fall back to the raw parent as a last resort so callers still get a path
// (and a clear ENOENT) instead of a silent wrong directory.
export function repoRoot(): string {
  if (fs.existsSync(path.join(process.cwd(), "src", "dev", "test-run.ts"))) return process.cwd();
  const sibling = path.resolve(process.cwd(), "..", "bot");
  if (fs.existsSync(path.join(sibling, "src", "dev", "test-run.ts"))) return sibling;
  return path.resolve(process.cwd(), "..");
}

export function runsDir(): string {
  return path.join(repoRoot(), ".test-runs");
}

// The Test page spawns `npx tsx src/dev/test-run.ts` in repoRoot() — that only
// works when the bot repo's SOURCE is actually present on this filesystem
// (the sibling "../bot" layout in local dev). The standalone Docker image
// (see ../Dockerfile) is a self-contained `next build --standalone` build
// with no bot source at all, so this is false there. Callers MUST check this
// before spawning and fail with a clear, honest message instead of a
// confusing ENOENT/spawn error — see app/api/test-run/route.ts and
// app/test/page.tsx.
export function testRunsAvailable(): boolean {
  return fs.existsSync(path.join(repoRoot(), "src", "dev", "test-run.ts"));
}

// Run ids are minted by us (see mintRunId below) — anything else is rejected
// before it can touch the filesystem.
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

// ── launching runs ──────────────────────────────────────────────────────────

export type StartTestRunInput = {
  cloneId: string;
  cloneSlug: string;
  personas: string[];
  turns?: number;
  fanModel?: string;
};

export type StartedRun = { id: string; persona: string };

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "x";
}

function mintRunId(slug: string, persona: string): string {
  const rand = crypto.randomBytes(3).toString("hex");
  return `run-${slugify(slug)}-${slugify(persona)}-${Date.now()}-${rand}`.slice(0, 64);
}

// Launches one throwaway fan-persona conversation as a detached child process
// (tsx running bot/src/dev/test-run.ts) and inserts a "running" test_runs row
// for it. The child is detached + unref'd, so it keeps running server-side
// independent of this request and of any dashboard tab watching it live.
//
// Real Supabase + real AI provider calls happen here — small but real cost
// per run. Nothing is ever sent to Telegram (see SimStore in the bot repo).
async function launchOne(input: { cloneId: string; cloneSlug: string; persona: string; turns: number; fanModel?: string }): Promise<StartedRun> {
  const id = mintRunId(input.cloneSlug, input.persona);
  if (!safeRunId(id)) throw new Error("failed to mint a safe run id");
  const dir = runDir(id);
  fs.mkdirSync(dir, { recursive: true });

  const root = repoRoot();
  const outLog = fs.openSync(path.join(dir, "stdout.log"), "a");
  const errLog = fs.openSync(path.join(dir, "stderr.log"), "a");
  const child = spawn(
    "npx",
    ["tsx", "src/dev/test-run.ts"],
    {
      cwd: root,
      env: {
        ...process.env,
        MOCK: "false", // this must always hit the real AI + real Supabase, never canned mock text
        SLUG: input.cloneSlug,
        FAN: input.persona,
        TURNS: String(input.turns),
        OUT: dir,
        ...(input.fanModel ? { FAN_MODEL: input.fanModel } : {}),
      },
      detached: true,
      stdio: ["ignore", outLog, errLog],
    },
  );
  child.unref();
  if (child.pid) fs.writeFileSync(path.join(dir, "pid"), String(child.pid));

  const { error } = await supabaseAdmin.from("test_runs").insert({
    id,
    clone_id: input.cloneId,
    clone_slug: input.cloneSlug,
    persona: input.persona,
    turns_requested: input.turns,
    fan_model: input.fanModel ?? null,
    status: "running",
    pid: child.pid ?? null,
  });
  if (error) throw new Error(`could not record test run: ${error.message}`);

  return { id, persona: input.persona };
}

// Starts one run per requested persona, all against the same clone, all
// launched concurrently. Shares a batch_id client-side (the caller groups the
// returned run ids) — there is no batch row, each run is independent.
export async function startTestRun(input: StartTestRunInput): Promise<{ batchId: string; runs: StartedRun[] }> {
  const turns = Math.min(Math.max(Math.round(input.turns ?? 10), 3), 20);
  const personas = [...new Set(input.personas)].filter(Boolean);
  if (personas.length === 0) throw new Error("pick at least one fan persona");
  const batchId = crypto.randomUUID();
  const runs = await Promise.all(
    personas.map((persona) =>
      launchOne({ cloneId: input.cloneId, cloneSlug: input.cloneSlug, persona, turns, fanModel: input.fanModel }),
    ),
  );
  return { batchId, runs };
}

// ── reading / finalizing runs ───────────────────────────────────────────────

export type TestRunRow = {
  id: string;
  batch_id: string;
  clone_id: string;
  clone_slug: string;
  persona: string;
  turns_requested: number;
  fan_telegram_id: number | null;
  fan_model: string | null;
  status: "running" | "done" | "error" | "stopped";
  pid: number | null;
  started_at: string;
  finished_at: string | null;
  summary: Record<string, unknown> | null;
  events: SimEvent[] | null;
  error_message: string | null;
};

function summarizeFromEvents(events: SimEvent[]): { summary: Record<string, unknown> | null; status: "done" | "error" } {
  const doneEv = events.find((e) => e.t === "done");
  if (doneEv) return { summary: (doneEv.summary as Record<string, unknown>) ?? null, status: "done" };
  const errs = events.filter((e) => e.t === "error").length;
  return { summary: { errors: errs }, status: "error" };
}

// If a run's process has exited but its DB row is still "running", fold in
// the final on-disk events and close it out. Called lazily wherever a run is
// read (the stream route, the list route) — there is no background worker,
// so a run only gets finalized once someone asks about it, which is fine for
// an admin tool nobody is paying to keep tidy in real time.
export async function reconcileRun(row: TestRunRow): Promise<TestRunRow> {
  if (row.status !== "running") return row;
  const events = readEvents(row.id);
  const hasDoneEvent = events.some((e) => e.t === "done");
  // A "done" event is the authoritative finish signal (test-run.ts always
  // emits one, success or not) — don't wait on process exit to notice it, the
  // script lingers ~1.5s after done to flush a fire-and-forget syslog write.
  if (!hasDoneEvent && pidAlive(row.id)) return row;

  const { summary, status } = summarizeFromEvents(events);
  const patch = {
    status,
    finished_at: new Date().toISOString(),
    summary,
    events,
    error_message: status === "error" ? "run ended without a done event (crashed or was killed)" : null,
  };
  const { data, error } = await supabaseAdmin
    .from("test_runs")
    .update(patch)
    .eq("id", row.id)
    .eq("status", "running") // only the first caller to notice the exit wins
    .select()
    .maybeSingle();
  if (error || !data) return { ...row, ...patch } as TestRunRow; // someone else finalized it concurrently, or read-only fallback
  return data as TestRunRow;
}

export async function getTestRun(id: string): Promise<TestRunRow | null> {
  const safeId = safeRunId(id);
  if (!safeId) return null;
  const { data } = await supabaseAdmin.from("test_runs").select("*").eq("id", safeId).maybeSingle();
  if (!data) return null;
  return reconcileRun(data as TestRunRow);
}

export async function listTestRuns(opts: { cloneId?: string; limit?: number } = {}): Promise<TestRunRow[]> {
  let q = supabaseAdmin.from("test_runs").select("*").order("started_at", { ascending: false }).limit(opts.limit ?? 50);
  if (opts.cloneId) q = q.eq("clone_id", opts.cloneId);
  const { data } = await q;
  const rows = (data ?? []) as TestRunRow[];
  // Reconcile any still-"running" rows whose process has since exited so the
  // history list is never stuck showing a stale spinner.
  return Promise.all(rows.map((r) => (r.status === "running" ? reconcileRun(r) : r)));
}

export async function stopTestRun(id: string): Promise<void> {
  const safeId = safeRunId(id);
  if (!safeId) return;
  const dir = runDir(safeId);
  const pidPath = path.join(dir, "pid");
  if (fs.existsSync(pidPath)) {
    const pid = Number(fs.readFileSync(pidPath, "utf8").trim());
    if (pid) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // already dead
      }
    }
  }
  const events = readEvents(safeId);
  await supabaseAdmin
    .from("test_runs")
    .update({ status: "stopped", finished_at: new Date().toISOString(), events, error_message: "stopped by operator" })
    .eq("id", safeId)
    .eq("status", "running");
}
