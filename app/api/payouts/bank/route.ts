import { NextRequest, NextResponse } from "next/server";
import { trustedFormOrigin } from "@/lib/form-origin";
import { PayoutError } from "@/lib/payouts/model";
import { requirePayoutViewer } from "@/lib/payouts/server";
import { readBank, saveBank } from "@/lib/payouts/bank";
export const dynamic = "force-dynamic";
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
function failure(error: unknown) { return response({ error: error instanceof PayoutError ? error.message : "Bank details are temporarily unavailable." }, error instanceof PayoutError ? error.status : 503); }
export async function GET(request: NextRequest) {
  try {
    const viewer = await requirePayoutViewer();
    return response({ bank: await readBank(viewer, request.nextUrl.searchParams.get("cloneId")) });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    if (!trustedFormOrigin(request)) throw new PayoutError("Untrusted request origin.", 403);
    const viewer = await requirePayoutViewer();
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new PayoutError("Invalid bank request.");
    const body = await request.text();
    if (body.length > 2048) throw new PayoutError("Bank request is too large.", 413);
    let input: unknown;
    try { input = JSON.parse(body); } catch { throw new PayoutError("Invalid bank request."); }
    return response(await saveBank(viewer, input));
  } catch (error) { return failure(error); }
}
