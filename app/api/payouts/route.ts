import { NextRequest, NextResponse } from "next/server";
import { trustedFormOrigin } from "@/lib/form-origin";
import { PayoutError } from "@/lib/payouts/model";
import { payoutSnapshot, recordPayout, requirePayoutViewer, voidPayout } from "@/lib/payouts/server";
export const dynamic = "force-dynamic";
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
function failure(error: unknown) { return response({ error: error instanceof PayoutError ? error.message : "Payouts are temporarily unavailable." }, error instanceof PayoutError ? error.status : 503); }
export async function GET(request: NextRequest) {
  try {
    const viewer = await requirePayoutViewer();
    const rawPage = request.nextUrl.searchParams.get("page") || "0";
    if (!/^\d{1,6}$/.test(rawPage)) throw new PayoutError("Invalid history page.");
    return response(await payoutSnapshot(viewer, request.nextUrl.searchParams.get("cloneId"), Number(rawPage)));
  } catch (error) { return failure(error); }
}
async function mutate(request: NextRequest, correcting: boolean) {
  try {
    if (!trustedFormOrigin(request)) throw new PayoutError("Untrusted request origin.", 403);
    const viewer = await requirePayoutViewer();
    if (!viewer.canManage) throw new PayoutError("Administrator access required.", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new PayoutError("Invalid payout request.");
    const body = await request.text();
    if (body.length > 4096) throw new PayoutError("Payout request is too large.", 413);
    let input: unknown;
    try { input = JSON.parse(body); } catch { throw new PayoutError("Invalid payout request."); }
    return response(correcting ? await voidPayout(viewer, input) : await recordPayout(viewer, input), correcting ? 200 : 201);
  } catch (error) { return failure(error); }
}
export const POST = (request: NextRequest) => mutate(request, false);
export const PATCH = (request: NextRequest) => mutate(request, true);
