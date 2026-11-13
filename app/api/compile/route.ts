import { NextRequest, NextResponse } from "next/server";
import { compileClone } from "@/lib/compiler";
import { requireManagedClone } from "@/lib/agency-management";
import { trustedFormOrigin } from "@/lib/form-origin";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
// No GET: a cross-site top-level GET carries the Lax admin cookie and compiling writes live prompts.
export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req)) return NextResponse.json({error:"Untrusted request origin"},{status:403});
  try {
    const body=await req.json();
    await requireManagedClone(body.id);
    if (typeof body.id!=="string" || !body.id) return NextResponse.json({error:"missing id"},{status:400});
    return NextResponse.json(await compileClone(body.id));
  } catch { return NextResponse.json({error:"Creator access or compilation unavailable"},{status:403}); }
}
