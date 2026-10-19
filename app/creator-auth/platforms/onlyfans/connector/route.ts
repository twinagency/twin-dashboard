import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { platformIdentity, platformFailure } from "@/lib/creator-platforms/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const creator = await platformIdentity(); if (creator instanceof NextResponse) return creator;
  try {
    const zip = await readFile(join(process.cwd(),"public","downloads","twin-onlyfans-connect.zip"));
    return new NextResponse(zip, {headers:{"Content-Type":"application/zip","Content-Disposition":"attachment; filename=twin-onlyfans-connect.zip","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  } catch { return platformFailure(503,"The connector download is temporarily unavailable. Please try again shortly."); }
}
