import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { assemblePromptPreview } from "@/lib/compiler";
import { isAgentType, LIVE_WIRED_AGENT_TYPES } from "@/lib/prompt-templates-data";
import type { Clone } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST { agentType, template, cloneId }
//
// LIVE PREVIEW: the fully assembled prompt the bot would actually send for a
// real clone, reusing assemblePromptPreview() (lib/compiler.ts) — the same
// assembler the Configure page's read-only preview already uses — with the
// draft `template` substituted in for `agentType` ONLY, so an unsaved edit
// can be previewed without writing it to prompt_templates first. Every other
// agent type in the preview still comes from the live saved row.
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { agentType, template, cloneId } = body ?? {};
  if (!isAgentType(agentType)) {
    return NextResponse.json({ error: `unknown agentType "${agentType}"` }, { status: 400 });
  }
  if (typeof template !== "string") {
    return NextResponse.json({ error: "template must be a string" }, { status: 400 });
  }
  if (typeof cloneId !== "string" || !cloneId) {
    return NextResponse.json({ error: "cloneId is required" }, { status: 400 });
  }

  if (!LIVE_WIRED_AGENT_TYPES.has(agentType)) {
    // media_match / voice_enhance: the bot runtime does not read this DB row
    // at all right now (see LIVE_WIRED_AGENT_TYPES for the exact code
    // pointers) — there is nothing to "assemble", the draft text IS the
    // whole preview, verbatim, with no slots or conditionals ever applied.
    return NextResponse.json({ notWired: true, raw: template });
  }

  const { data: clone, error } = await supabaseAdmin.from("clones").select("*").eq("id", cloneId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!clone) return NextResponse.json({ error: "clone not found" }, { status: 404 });

  try {
    const preview = await assemblePromptPreview(clone as Clone, { [agentType]: template });
    return NextResponse.json({ preview });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed to assemble preview" }, { status: 500 });
  }
}
