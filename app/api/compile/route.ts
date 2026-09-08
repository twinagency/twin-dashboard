import { NextRequest, NextResponse } from "next/server";
import { compileClone } from "@/lib/compiler";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { requireManagedClone } from "@/lib/agency-management";
import { trustedFormOrigin } from "@/lib/form-origin";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  if (await getDashboardAccess()) return NextResponse.json({error:"Use POST"},{status:405});
  const id=req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({error:"missing id"},{status:400});
  try { return NextResponse.json(await compileClone(id)); }
  catch { return NextResponse.json({error:"Compilation failed"},{status:500}); }
}
export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req)) return NextResponse.json({error:"Untrusted request origin"},{status:403});
  try {
    const body=await req.json();
    await requireManagedClone(body.id);
    if (typeof body.id!=="string" || !body.id) return NextResponse.json({error:"missing id"},{status:400});
    return NextResponse.json(await compileClone(body.id));
  } catch { return NextResponse.json({error:"Creator access or compilation unavailable"},{status:403}); }
}
