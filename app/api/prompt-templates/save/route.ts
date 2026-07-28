import { NextRequest, NextResponse } from "next/server";
import { isAgentType, saveTemplate, ValidationError } from "@/lib/prompt-templates-data";

export const dynamic = "force-dynamic";

// POST { agentType, template, description, restoredFromVersion? }
//
// The one and only write path onto the fleet-wide prompt_templates table
// from this dashboard. Validates first (unknown/malformed {{SLOT}} markers,
// unbalanced {{#IF_X}}/{{/IF_X}} pairs, orphan conditionals, em dashes — see
// lib/prompt-validate.ts) and refuses to write anything that fails. Every
// successful save inserts a NEW row in prompt_template_versions rather than
// destroying history — a restore (restoredFromVersion set) is just a save
// whose template/description came from an earlier version.
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { agentType, template, description, restoredFromVersion } = body ?? {};
  if (!isAgentType(agentType)) {
    return NextResponse.json({ error: `unknown agentType "${agentType}"` }, { status: 400 });
  }
  if (typeof template !== "string" || !template.trim()) {
    return NextResponse.json({ error: "template must be a non-empty string" }, { status: 400 });
  }

  try {
    const result = await saveTemplate({
      agentType,
      template,
      description: typeof description === "string" ? description : "",
      restoredFromVersion: typeof restoredFromVersion === "number" ? restoredFromVersion : null,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: "validation failed", issues: e.issues }, { status: 422 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
