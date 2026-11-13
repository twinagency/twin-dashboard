import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Ping = { ok: boolean; ms: number };
async function timed(fn: () => Promise<boolean>): Promise<Ping> {
  const t = Date.now();
  try {
    const ok = await fn();
    return { ok, ms: Date.now() - t };
  } catch {
    return { ok: false, ms: Date.now() - t };
  }
}

async function pingTelegram(token: string): Promise<boolean> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: ctrl.signal,
    });
    const j = await r.json();
    return !!j.ok;
  } finally {
    clearTimeout(to);
  }
}

export async function GET() {
  const t = Date.now();
  const { data, error } = await supabaseAdmin
    .from("clones")
    .select("id,slug,name,bot_token,status");
  const supabaseMs = Date.now() - t;

  if (error) {
    return NextResponse.json(
      { supabase: { ok: false, ms: supabaseMs }, clones: [] },
      { status: 503 },
    );
  }

  const clones = (data ?? []) as {
    id: string;
    slug: string;
    name: string;
    bot_token: string;
    status: string;
  }[];

  // Every active clone is expected to answer getMe; an active clone with no token is a broken bot and counts as down.
  // Paused clones (incl. OnlyFans-only creators, created paused with bot_token "") are listed as skipped, so a retired
  // token cannot hold the status code red forever.
  const live = clones.filter((c) => c.status === "active");
  const skipped = clones
    .filter((c) => c.status !== "active")
    .map((c) => ({ id: c.id, slug: c.slug, name: c.name, status: c.status, reason: "not active" }));
  const results = await Promise.all(
    live.map(async (c) => {
      const tg = c.bot_token ? await timed(() => pingTelegram(c.bot_token)) : { ok: false, ms: 0 };
      return { id: c.id, slug: c.slug, name: c.name, status: c.status, telegram: tg };
    }),
  );

  // A status-code monitor must see a dead active bot as unhealthy, not just the body.
  return NextResponse.json({
    supabase: { ok: true, ms: supabaseMs },
    clones: results,
    skipped,
  }, { status: results.every((r) => r.telegram.ok) ? 200 : 503 });
}
