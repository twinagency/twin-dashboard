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
      { status: 200 },
    );
  }

  const clones = (data ?? []) as {
    id: string;
    slug: string;
    name: string;
    bot_token: string;
    status: string;
  }[];

  const results = await Promise.all(
    clones.map(async (c) => {
      const tg = await timed(() => pingTelegram(c.bot_token));
      return { id: c.id, slug: c.slug, name: c.name, status: c.status, telegram: tg };
    }),
  );

  return NextResponse.json({
    supabase: { ok: true, ms: supabaseMs },
    clones: results,
  });
}
