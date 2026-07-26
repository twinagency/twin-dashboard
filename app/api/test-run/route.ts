import { NextRequest, NextResponse } from "next/server";
import { startTestRun, listTestRuns, testRunsAvailable, TEST_PERSONAS } from "@/lib/test-runs";
import { supabaseAdmin } from "@/lib/supabase";

const UNAVAILABLE_MESSAGE =
  "Test runs are not available in this deployment: the bot repo's source isn't present on this " +
  "container's filesystem (see dashboard/DOCKER.md, \"Test page limitation\"). This works in local " +
  "dev where the bot and dashboard repos are sibling directories, but not in the standalone Docker " +
  "image. Run test conversations from a checkout with both repos side by side instead.";

export const dynamic = "force-dynamic";

// GET /api/test-run?cloneId=...&limit=... — run history, newest first. Used
// by the Test page and available to any future server component (e.g. the
// dashboard AI assistant) that wants to read past test results.
export async function GET(req: NextRequest) {
  const cloneId = req.nextUrl.searchParams.get("cloneId") || undefined;
  const limit = Number(req.nextUrl.searchParams.get("limit") || 50);
  const runs = await listTestRuns({ cloneId, limit });
  return NextResponse.json({ runs });
}

// POST /api/test-run — launches one throwaway fan-persona conversation per
// requested persona, all concurrently, against the same clone. Body:
// { cloneSlug: string, personas: string[], turns?: number, fanModel?: string }
//
// This is the run trigger a future dashboard AI assistant feature can call
// directly too — the real logic lives in lib/test-runs.ts's startTestRun(),
// this route is a thin HTTP wrapper around it for the browser-side Test page.
//
// IMPORTANT: this hits the real Supabase and the real AI provider (small but
// real cost per run). It never sends anything to Telegram — see SimStore in
// the bot repo.
export async function POST(req: NextRequest) {
  if (!testRunsAvailable()) return NextResponse.json({ error: UNAVAILABLE_MESSAGE }, { status: 501 });

  let body: { cloneSlug?: string; personas?: string[]; turns?: number; fanModel?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const cloneSlug = body.cloneSlug?.trim();
  if (!cloneSlug) return NextResponse.json({ error: "cloneSlug is required" }, { status: 400 });

  const personas = (body.personas ?? []).filter((p) => TEST_PERSONAS.some((tp) => tp.key === p));
  if (personas.length === 0) return NextResponse.json({ error: "pick at least one known fan persona" }, { status: 400 });

  const { data: clone } = await supabaseAdmin.from("clones").select("id,slug").eq("slug", cloneSlug).maybeSingle();
  if (!clone) return NextResponse.json({ error: `clone "${cloneSlug}" not found` }, { status: 404 });

  try {
    const result = await startTestRun({
      cloneId: clone.id,
      cloneSlug: clone.slug,
      personas,
      turns: body.turns,
      fanModel: body.fanModel,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed to start run" }, { status: 500 });
  }
}
