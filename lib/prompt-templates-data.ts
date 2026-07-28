// ── Server-only data access for the prompt template editor (app/prompts) ──────
// Reads/writes prompt_templates + the new prompt_template_versions history
// table (migration ../../bot/db/migrations/048_prompt_template_versions.sql).
// NEVER import this into a client component — it uses the Supabase service
// key via ./supabase.

import "server-only";
import { supabaseAdmin } from "./supabase";
import { validateTemplate, detectedSlots, type ValidationIssue } from "./prompt-validate";
import type { AgentType, TemplateRow, VersionRow } from "./prompt-templates-shared";

export { AGENT_TYPES, isAgentType, LIVE_WIRED_AGENT_TYPES, AGENT_LABELS } from "./prompt-templates-shared";
export type { AgentType, TemplateRow, VersionRow } from "./prompt-templates-shared";

export async function listTemplates(): Promise<TemplateRow[]> {
  const { data, error } = await supabaseAdmin
    .from("prompt_templates")
    .select("agent_type,template,slots,description,updated_at")
    .order("agent_type");
  if (error) throw new Error(error.message);
  return (data ?? []) as TemplateRow[];
}

export async function listVersions(agentType: AgentType): Promise<VersionRow[]> {
  const { data, error } = await supabaseAdmin
    .from("prompt_template_versions")
    .select("id,agent_type,version,template,slots,description,created_by,restored_from_version,created_at")
    .eq("agent_type", agentType)
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as VersionRow[];
}

export class ValidationError extends Error {
  issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super("Template failed validation");
    this.name = "ValidationError";
    this.issues = issues;
  }
}

// Every save (a plain edit OR a one-click restore) goes through here: it
// validates, then INSERTS a new version row (never overwrites/destroys a
// prior one) before updating the live prompt_templates row. A restore is
// just a save whose `template` is copied from an older version, with
// restoredFromVersion set for provenance — so history stays a straight,
// fully-reversible line and undo always has somewhere to land.
export async function saveTemplate(opts: {
  agentType: AgentType;
  template: string;
  description: string;
  restoredFromVersion?: number | null;
  createdBy?: string;
}): Promise<{ row: TemplateRow; version: VersionRow }> {
  const issues = validateTemplate(opts.template);
  if (issues.length) throw new ValidationError(issues);

  const slots = detectedSlots(opts.template);
  const description = opts.description?.trim() || null;

  // Small retry loop, not a transaction: this is a single-operator admin
  // tool (not a high-concurrency write path), so a rare version-number
  // collision just needs one retry, not serializable isolation.
  let versionRow: VersionRow | null = null;
  let lastErr: string | null = null;
  for (let attempt = 0; attempt < 3 && !versionRow; attempt++) {
    const { data: maxRow, error: maxErr } = await supabaseAdmin
      .from("prompt_template_versions")
      .select("version")
      .eq("agent_type", opts.agentType)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxErr) throw new Error(maxErr.message);
    const nextVersion = (maxRow?.version ?? 0) + 1;

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("prompt_template_versions")
      .insert({
        agent_type: opts.agentType,
        version: nextVersion,
        template: opts.template,
        slots,
        description,
        created_by: opts.createdBy ?? "dashboard",
        restored_from_version: opts.restoredFromVersion ?? null,
      })
      .select("id,agent_type,version,template,slots,description,created_by,restored_from_version,created_at")
      .single();
    if (insErr) {
      lastErr = insErr.message;
      continue; // likely a (agent_type, version) collision from a concurrent save — retry with a fresh max
    }
    versionRow = inserted as VersionRow;
  }
  if (!versionRow) throw new Error(lastErr ?? "failed to write a new version after 3 attempts");

  const { data: updated, error: updErr } = await supabaseAdmin
    .from("prompt_templates")
    .update({ template: opts.template, slots, description, updated_at: new Date().toISOString() })
    .eq("agent_type", opts.agentType)
    .select("agent_type,template,slots,description,updated_at")
    .single();
  if (updErr) throw new Error(updErr.message);

  return { row: updated as TemplateRow, version: versionRow };
}
