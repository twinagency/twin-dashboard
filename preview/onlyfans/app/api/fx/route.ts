import { NextResponse } from "next/server";
import { AUD_PER_USD } from "@/lib/money";

// The dashboard's CurrencyProvider asks /api/fx for a live USD→AUD rate. The
// preview must reach nothing, so it answers from the same static constant the
// provider already defaults to. This is the preview's own route: it is not part
// of the dashboard and it is not deployed anywhere.
export function GET() {
  return NextResponse.json({ usd_to_aud: AUD_PER_USD, source: "preview static" });
}
