import { supabaseAdmin } from "@/lib/supabase";
import { listTemplates } from "@/lib/prompt-templates-data";
import PromptEditor from "./PromptEditor";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Prompt Templates · Allie Admin",
};

// Prompt templates are rows in the fleet-wide prompt_templates table, not
// files — see ../../bot/CLAUDE.md "Prompt system" and
// ../../bot/docs/HANDOVER.md "Prompt templates are the highest-risk
// surface". This is the editor: version history, one-click undo, a diff
// view, live preview against a real clone, and pre-save validation for the
// known footguns (unknown/malformed slots, unbalanced or orphaned
// conditionals, em dashes).
export default async function PromptTemplatesPage() {
  const [templates, clonesRes] = await Promise.all([
    listTemplates(),
    supabaseAdmin.from("clones").select("id,name,status").order("name"),
  ]);

  return (
    <PromptEditor
      initialTemplates={templates}
      clones={(clonesRes.data ?? []) as { id: string; name: string; status: "active" | "paused" }[]}
    />
  );
}
