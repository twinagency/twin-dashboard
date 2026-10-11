// Temporary overnight watcher (not committed). Exits (to wake the operator
// session) when a run changes status, a connection pauses, progress stalls,
// or maxMinutes passes.
import { createClient } from "@supabase/supabase-js";

const RUNS: Record<string, string> = {
  "d922e44e-4ac3-475a-b6b2-661e59ccefe1": "alanna",
  "d0b8344e-6f0a-4630-8c82-e52e3236a9f9": "bri",
  "732f94fc-0db5-4800-88f7-23eae446d33c": "dan",
  "cb329cdc-4f7f-41b6-984b-c051e9173e0a": "fitsid",
  "4129a1a1-2b57-4f4d-b7e3-7a7e96534acc": "callace",
};
const extra = (process.env.WATCH_EXTRA_RUNS ?? "").split(",").filter(Boolean);
for (const kv of extra) { const [id, name] = kv.split("="); RUNS[id] = name; }
const maxMinutes = Number(process.env.WATCH_MAX_MIN ?? 30);
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } });

async function snap() {
  const { data: runs } = await db.from("reengage_runs").select("id,status,dry_run,stop_requested,clone_ids").in("id", Object.keys(RUNS));
  const out: Record<string, { status: string; dry: boolean; done: number; left: number; sent: number; cancelled: number }> = {};
  for (const r of runs ?? []) {
    const count = async (state: string) => (await db.from("reengage_episodes").select("id", { count: "exact", head: true }).eq("run_id", r.id).eq("state", state)).count ?? 0;
    const [acked, eligible, cancelled] = await Promise.all([count("acked"), count("eligible"), count("cancelled")]);
    out[RUNS[r.id]] = { status: r.status, dry: r.dry_run, done: acked, left: eligible, sent: r.dry_run ? 0 : acked, cancelled };
  }
  const { data: conns } = await db.from("userbot_connections").select("clone_id,status,paused,paused_reason,hourly_cap");
  return { runs: out, paused: (conns ?? []).filter((c) => c.paused).map((c) => `${c.clone_id}:${c.paused_reason}`) };
}

const start = Date.now();
(async () => {
const first = await snap();
console.log("START", new Date().toISOString(), JSON.stringify(first));
let lastProgress = Date.now();
let prev: Awaited<ReturnType<typeof snap>> = first;
for (;;) {
  await new Promise((r) => setTimeout(r, 60_000));
  let s;
  try { s = await snap(); } catch (e) { console.log("snap error", String(e)); continue; }
  const moved = Object.keys(s.runs).some((k) => s.runs[k].done !== prev.runs[k]?.done || s.runs[k].left !== prev.runs[k]?.left);
  if (moved) lastProgress = Date.now();
  const statusChanged = Object.keys(s.runs).filter((k) => s.runs[k].status !== first.runs[k]?.status || s.runs[k].dry !== first.runs[k]?.dry);
  const newPause = s.paused.filter((p) => !first.paused.includes(p));
  const cancelJump = Object.keys(s.runs).filter((k) => s.runs[k].cancelled - (first.runs[k]?.cancelled ?? 0) > 200);
  const reason = statusChanged.length ? `status:${statusChanged.join(",")}`
    : newPause.length ? `paused:${newPause.join(",")}`
    : cancelJump.length ? `cancel_spike:${cancelJump.join(",")}`
    : Date.now() - lastProgress > 15 * 60_000 ? "stalled_15min"
    : Date.now() - start > maxMinutes * 60_000 ? "timer" : null;
  prev = s;
  if (reason) { console.log("WAKE", reason, new Date().toISOString(), JSON.stringify(s)); process.exit(0); }
}
})();
