import { Card } from "@/components/ui/card";

// Sim page: embeds the twinsim matrix runner (../bot/src/dev/twinsim), not a
// reimplementation of it. twinsim needs the REAL bot handler (handleMessage,
// SimStore, the whole flow engine) to hold a faithful conversation, and that
// code only exists in the bot repo — duplicating it here would be a second
// copy of the exact engine the fleet runs on, drifting the moment either one
// changes. twinsim is also deliberately isolated (SimStore keeps every
// fan-side write in memory, negative sentinel fan ids, no Telegram sends) —
// that safety property lives with the engine, not with whoever embeds it.
//
// So this page is a thin window onto a server that already has its own UI
// (src/dev/twinsim/index.html) and its own HTTP+SSE API (server.ts, port
// 4200 by default). It is NOT started by the dashboard and does not share
// its process — someone runs `cd twin-bot && npm run twinsim` first, wherever
// that's reachable from (own laptop, the home server, a box), and points
// TWINSIM_URL at it. Health-checked server-side so a cold/unset target shows
// clear instructions instead of a blank iframe.
export const dynamic = "force-dynamic";

const TWINSIM_URL = process.env.TWINSIM_URL || "http://127.0.0.1:4200";

async function isReachable(url: string): Promise<boolean> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 2500);
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/api/options`, { signal: ctrl.signal, cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(to);
  }
}

export default async function SimPage() {
  const up = await isReachable(TWINSIM_URL);

  return (
    <div className="dashboard-page flex h-full flex-col text-ink">
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Sim</h1>
          <p className="text-sm text-muted">
            Run an AI fan against any girl(s), up to 10 fan personas × 10 girls at once. Isolated — no real fan
            rows, no real Telegram sends, spends real LLM money on the run.
          </p>
        </div>
        <a
          href={TWINSIM_URL}
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-elev px-3.5 py-1.5 text-xs font-medium text-ink hover:bg-elev/70"
        >
          Open in new tab ↗
        </a>
      </div>

      {up ? (
        <iframe
          src={TWINSIM_URL}
          title="Twin Sim"
          className="min-h-[70vh] w-full flex-1 rounded-2xl border border-white/10 bg-white"
        />
      ) : (
        <Card className="p-6">
          <p className="text-sm font-semibold text-ink">Sim server not reachable at {TWINSIM_URL}</p>
          <p className="mt-2 text-sm text-muted">
            twinsim runs as its own process, separate from this dashboard, so it can hold real conversations
            through the bot&apos;s actual handler without either of them touching each other&apos;s port. Start it
            wherever you want it reachable from:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-elev p-3 text-xs text-ink">
            cd twin-bot{"\n"}npm run twinsim{"\n"}{"\n"}# then open http://127.0.0.1:4200 directly, or set
            TWINSIM_URL{"\n"}# in this dashboard&apos;s env to wherever it&apos;s running and reload this page
          </pre>
          <p className="mt-3 text-xs text-muted">
            Needs <code>OPENROUTER_API_KEY</code> and <code>SUPABASE_URL</code>/<code>SUPABASE_SERVICE_KEY</code>{" "}
            set in <code>twin-bot/.env</code> to actually run a conversation.
          </p>
        </Card>
      )}
    </div>
  );
}
