import { NextResponse } from "next/server";
import { AUD_PER_USD } from "@/lib/money";

export const dynamic = "force-dynamic";

// USD→AUD, cached in-process for an hour. Falls back to the static rate if the
// free FX API is unreachable, so the dashboard never breaks over a rate.
let cache: { at: number; rate: number; brlRate: number | null } | null = null;

export async function GET() {
  try {
    if (!cache || Date.now() - cache.at > 3_600_000) {
      const r = await fetch("https://open.er-api.com/v6/latest/USD");
      const j = await r.json();
      const rate = Number(j?.rates?.AUD);
      const brlRate = Number(j?.rates?.BRL);
      cache = {
        at: Date.now(),
        rate: Number.isFinite(rate) && rate > 0 ? rate : AUD_PER_USD,
        brlRate: Number.isFinite(brlRate) && brlRate > 0 ? brlRate : null,
      };
    }
    return NextResponse.json({ usd_to_aud: cache.rate, usd_to_brl: cache.brlRate });
  } catch {
    return NextResponse.json({ usd_to_aud: AUD_PER_USD, usd_to_brl: null });
  }
}
