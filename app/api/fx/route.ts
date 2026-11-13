import { NextResponse } from "next/server";
import { AUD_PER_USD } from "@/lib/money";

export const dynamic = "force-dynamic";

// USD→AUD, cached in-process for an hour. Falls back to the static rate if the
// free FX API is unreachable, so the dashboard never breaks over a rate.
let cache: { at: number; rate: number } | null = null;

export async function GET() {
  try {
    if (!cache || Date.now() - cache.at > 3_600_000) {
      const r = await fetch("https://open.er-api.com/v6/latest/USD");
      const j = await r.json();
      const rate = Number(j?.rates?.AUD);
      // Fall back uncached, so the first request after the API recovers gets the live rate.
      if (!r.ok || !Number.isFinite(rate) || rate <= 0) return NextResponse.json({ usd_to_aud: AUD_PER_USD, stale: true });
      cache = { at: Date.now(), rate };
    }
    return NextResponse.json({ usd_to_aud: cache.rate });
  } catch {
    return NextResponse.json({ usd_to_aud: AUD_PER_USD, stale: true });
  }
}
