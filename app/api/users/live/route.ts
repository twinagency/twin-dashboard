// THE ONE live connection behind the Fans inbox.
//
// Session 2 of Jesse's list asked for four live things on /users: purchase
// pop-ups, drip phase per fan, typing dots, and the status strip. All four are
// fed by THIS single SSE stream and nothing else. The rule is deliberate: the
// page is server rendered and had no client polling at all, and four features
// each opening their own interval would have been four connections per open
// tab, times however many tabs the operator leaves open all day, against a
// service-key Supabase client with no rate limit in front of it.
//
// Auth: this lives under /api/ but NOT under /api/v1/ or /api/admin/, so
// middleware.ts's session-cookie gate covers it (those two prefixes are the
// only self-authenticating carve-outs). An unauthed EventSource would get a
// 307 to /login and reconnect-loop, which is why the client only mounts on the
// already-authed /users page.
//
// Clone scope comes from the same cookie the page itself reads, so the feed can
// never show the operator a fan from a clone he has scoped out of view.
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCloneScope } from "@/lib/clone-scope";
import { campaignStepsOf, nextDripDueAt } from "@/lib/drip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// How often the server re-reads Supabase. Every connected tab costs this, so it
// is a poll interval and not a "realtime" subscription on purpose: three small
// time-bounded queries every 3s is a load we can predict, a realtime channel
// per tab on the service key is not.
const TICK_MS = 3_000;
// Apache's default ProxyTimeout is 60s and it sits in front of :3001 in prod
// (ops/SECURITY-NOTES.md). A purchase feed is idle for minutes at a time, so
// without this comment line the proxy kills every stream after a quiet minute
// and the browser reconnect-loops. This is the one thing that MUST NOT be
// tuned above 60s.
const HEARTBEAT_MS = 20_000;
// A fan counts as "she is typing to him" for this long after his message, until
// her reply lands. Sized off real reply latency: the bot composes, and for a
// voice note also synthesises, so 30s is generous rather than tight. Too short
// and the dots vanish while she is still working; too long and they lie.
const TYPING_WINDOW_MS = 30_000;
// Drip steps are 1..23 hours after the fan's last inbound message, so a fan
// whose last message is older than 24h cannot have a step pending and does not
// need to be in the drip scan at all.
const DRIP_WINDOW_MS = 24 * 3600_000;
const DRIP_SCAN_LIMIT = 500;

const sse = (event: Record<string, unknown>) => `data: ${JSON.stringify(event)}\n\n`;

export async function GET(req: NextRequest) {
  const cloneId = await getCloneScope();
  const scoped = <T extends { eq: (c: string, v: unknown) => T }>(query: T): T =>
    cloneId ? query.eq("clone_id", cloneId) : query;

  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(sse(event)));
        } catch {
          closed = true;
        }
      };
      const comment = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`: ${text}\n\n`));
        } catch {
          closed = true;
        }
      };

      // Purchases are pushed only when they are NEW, so the first tick has to
      // establish a floor. Without this the operator gets a pop-up storm for
      // every sale of the last hour the moment he opens the page.
      let purchaseCursor = new Date().toISOString();
      // Per-fan drip state we have already told this client about, so a tick
      // that changed nothing sends nothing.
      const dripSeen = new Map<string, string>();
      const typingSeen = new Set<string>();

      const onAbort = () => {
        closed = true;
      };
      req.signal.addEventListener("abort", onAbort);

      send({ t: "hello", cloneId, at: new Date().toISOString() });

      let lastBeat = Date.now();

      try {
        while (!closed && !req.signal.aborted) {
          const now = Date.now();

          // ── 1. Purchases since the cursor ───────────────────────────────
          // star_transactions carries its own clone_id, so the scope is a plain
          // filter here. The fan is resolved by (clone_id, telegram_id) and NOT
          // by user_id: that column is nullable and is not reliably populated on
          // this dataset (star-reconcile.ts leaves it null whenever the fan
          // lookup misses, which is most backfilled charges). lib/performance-
          // data.ts joins the same way and says so.
          const purchasesRes = await scoped(
            supabaseAdmin
              .from("star_transactions")
              .select("id,clone_id,telegram_id,amount_stars,kind,feature,paid_at")
              .gt("paid_at", purchaseCursor)
              .order("paid_at", { ascending: true })
              .limit(50) as any,
          );

          const fresh = (((purchasesRes as any).data ?? []) as any[]).filter((p) => p.telegram_id != null);
          if (fresh.length) {
            purchaseCursor = fresh[fresh.length - 1].paid_at ?? purchaseCursor;
            const tgIds = Array.from(new Set(fresh.map((p) => p.telegram_id)));
            const fansRes = await scoped(
              supabaseAdmin
                .from("users")
                .select("id,clone_id,telegram_id,name,stated_name,username,total_spent_stars")
                .in("telegram_id", tgIds) as any,
            );
            // telegram_id is unique only WITHIN a clone, so the key is the pair.
            const fanByKey = new Map<string, any>(
              (((fansRes as any).data ?? []) as any[]).map((f: any) => [`${f.clone_id}:${f.telegram_id}`, f]),
            );

            for (const p of fresh) {
              const fan = fanByKey.get(`${p.clone_id}:${p.telegram_id}`);
              if (!fan) continue; // out of the operator's clone scope, or an orphan charge
              send({
                t: "purchase",
                id: p.id,
                fanId: fan.id,
                fanName: fan.stated_name || fan.name || (fan.username ? `@${fan.username}` : "A fan"),
                cloneId: fan.clone_id,
                stars: Number(p.amount_stars) || 0,
                // There is no item-name column. `feature` is the closest thing
                // (photo/video/bundle/tip/credits/subscription) and `kind` is
                // the coarser fallback for rows written before migration 025.
                item: p.feature || p.kind || null,
                lifetimeStars: Number(fan.total_spent_stars) || 0,
                at: p.paid_at,
              });
            }
          }

          // ── 2. Drip phase per fan, and the status strip ─────────────────
          const cutoff = new Date(now - DRIP_WINDOW_MS).toISOString();
          const [clonesRes, dripFansRes] = await Promise.all([
            scoped(supabaseAdmin.from("clones").select("id,drip_steps,drip_enabled") as any),
            scoped(
              supabaseAdmin
                .from("users")
                .select("id,clone_id,campaign_step,last_message_received")
                .gte("last_message_received", cutoff)
                .order("last_message_received", { ascending: false })
                .limit(DRIP_SCAN_LIMIT) as any,
            ),
          ]);

          const stepsByClone = new Map<string, ReturnType<typeof campaignStepsOf>>();
          const enabledByClone = new Map<string, boolean>();
          for (const c of ((clonesRes as any).data ?? []) as any[]) {
            stepsByClone.set(c.id, campaignStepsOf(c.drip_steps));
            enabledByClone.set(c.id, c.drip_enabled !== false);
          }

          for (const f of (((dripFansRes as any).data ?? []) as any[])) {
            const steps = stepsByClone.get(f.clone_id) ?? [];
            const step = Number(f.campaign_step) || 0;
            const due = nextDripDueAt(steps, step, f.last_message_received);
            // The signature is what the client actually renders. Comparing it
            // rather than the raw row is what keeps a tick that changed nothing
            // from re-rendering all 100 rows in the list every 3 seconds.
            const sig = `${step}/${steps.length}/${due?.at ?? ""}/${enabledByClone.get(f.clone_id) ? 1 : 0}`;
            if (dripSeen.get(f.id) === sig) continue;
            dripSeen.set(f.id, sig);
            send({
              t: "drip",
              fanId: f.id,
              step,
              total: steps.length,
              enabled: enabledByClone.get(f.clone_id) !== false,
              nextType: due?.step.type ?? null,
              nextDueAt: due?.at ?? null,
            });
          }

          // ── 3. Typing dots ─────────────────────────────────────────────
          // Telegram never tells a bot when a USER is typing (that half was
          // dropped, see the memory note), but SHE is knowable: a fan whose
          // inbound message has no reply after it yet is a fan she is composing
          // for right now. Derived from chat_history rather than a new column
          // so the bot needs no change for this to work today.
          const typingCutoff = new Date(now - TYPING_WINDOW_MS).toISOString();
          const recentRes = await scoped(
            supabaseAdmin
              .from("chat_history")
              .select("clone_id,telegram_id,role,created_at")
              .gte("created_at", typingCutoff)
              .order("created_at", { ascending: false })
              .limit(300) as any,
          );

          const latestByFan = new Map<string, { role: string; at: string }>();
          for (const row of (((recentRes as any).data ?? []) as any[])) {
            const key = `${row.clone_id}:${row.telegram_id}`;
            if (!latestByFan.has(key)) latestByFan.set(key, { role: row.role, at: row.created_at });
          }
          // role "human" is the fan (see the /users page). His message being the
          // newest row in the window means nothing has been sent back yet.
          const waitingKeys = Array.from(latestByFan.entries())
            .filter(([, v]) => v.role === "human")
            .map(([k]) => k);

          let typingNow = new Set<string>();
          if (waitingKeys.length) {
            const tgIds = Array.from(new Set(waitingKeys.map((k) => k.split(":")[1])));
            const waitingFansRes = await scoped(
              supabaseAdmin.from("users").select("id,clone_id,telegram_id").in("telegram_id", tgIds) as any,
            );
            for (const f of (((waitingFansRes as any).data ?? []) as any[])) {
              if (waitingKeys.includes(`${f.clone_id}:${f.telegram_id}`)) typingNow.add(f.id);
            }
          }
          for (const id of typingNow) {
            if (!typingSeen.has(id)) send({ t: "typing", fanId: id, typing: true });
          }
          for (const id of typingSeen) {
            if (!typingNow.has(id)) send({ t: "typing", fanId: id, typing: false });
          }
          typingSeen.clear();
          for (const id of typingNow) typingSeen.add(id);

          if (Date.now() - lastBeat >= HEARTBEAT_MS) {
            comment("ping");
            lastBeat = Date.now();
          }

          await new Promise((r) => setTimeout(r, TICK_MS));
        }
      } catch (e) {
        send({ t: "error", message: e instanceof Error ? e.message : "live feed failed" });
      } finally {
        req.signal.removeEventListener("abort", onAbort);
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by the client going away
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Apache does not need this, but a proxy landing in front later would,
      // and a silently buffered SSE stream is a miserable thing to debug.
      "X-Accel-Buffering": "no",
    },
  });
}
