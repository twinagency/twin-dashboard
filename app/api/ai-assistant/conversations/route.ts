import { NextResponse } from "next/server";
import { listConversations } from "../db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await listConversations();
    return NextResponse.json({ conversations: rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
