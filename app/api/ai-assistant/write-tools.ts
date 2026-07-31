import { supabaseAdmin } from "@/lib/supabase";
import type { OrToolDef } from "@/lib/openrouter";
import {
  setStatus as setCloneStatusAction,
  setCloneToggle,
  setCloneDial,
  compileCloneAction,
} from "@/app/clones/actions";
import { CLONE_TOGGLE_FIELDS, type CloneToggleField, CLONE_DIAL_FIELDS, CLONE_DIAL_FIELD_NAMES, type CloneDialField } from "@/app/clones/toggle-fields";
import {
  setCredits as setFanCreditsAction,
  toggleActive as toggleFanActiveAction,
  setBlocked as setFanBlockedAction,
  resetCounters as resetFanCountersAction,
} from "@/app/users/actions";

// ── Write tool surface for the internal AI assistant ─────────────────────────
// HARD RULE (see CLAUDE.md / project memory): the assistant may NEVER write to
// Supabase directly and may NEVER execute SQL. Every function below is a thin
// wrapper around an EXISTING, already-validated server action — the exact same
// function a dashboard form or button already calls. Nothing here does its own
// `.update()`/`.insert()`/`.delete()` against the DB; that logic lives (and is
// reviewed) in app/clones/actions.ts, app/feedback/actions.ts, app/users/actions.ts.
// There is deliberately no "updateColumn(table, column, value)" style tool —
// each write tool below has a fixed shape and a fixed, small set of legal
// values, matching what a human could already do through that page's UI.
//
// Money is never touched here: no tool below can set a price, a Star amount,
// or a discount percentage. Fan message-credit adjustments (setFanCredits) are
// an admin override already exposed on the Fans page, not a price the
// assistant invents — the credit PACK price and Star amounts stay in
// clones.credit_pack_price_stars / discount_max_*, which this file never
// writes.
//
// Deliberately NOT exposed: deleteClone / deleteUser. Those are destructive
// and irreversible; there is no explicit ask for the assistant to be able to
// delete a clone or a fan, and the blast radius of a model getting that wrong
// is unacceptable, so it stays out of the tool surface entirely even though a
// human could do it from the UI.
//
// Every successful write returns a plain-English `summary` string. The route
// handler surfaces that summary to the user in the chat AND logs it to
// system_logs (source: "ai-assistant-write") — see logWrite() below.

async function cloneName(id: string): Promise<string> {
  const { data } = await supabaseAdmin.from("clones").select("name").eq("id", id).maybeSingle();
  return data?.name ?? id;
}

// Resolve a clone by UUID or by name (case-insensitive exact match) so the
// model can refer to "Aria" the way a person would, without a prior lookup.
async function resolveCloneId(idOrName: string): Promise<{ id: string; name: string; slug: string }> {
  const byId = await supabaseAdmin.from("clones").select("id,name,slug").eq("id", idOrName).maybeSingle();
  if (byId.data) return byId.data;
  const bySlug = await supabaseAdmin.from("clones").select("id,name,slug").eq("slug", idOrName).maybeSingle();
  if (bySlug.data) return bySlug.data;
  const byName = await supabaseAdmin.from("clones").select("id,name,slug").ilike("name", idOrName).limit(1).maybeSingle();
  if (byName.data) return byName.data;
  throw new Error(`no clone found matching "${idOrName}"`);
}

async function fanLabel(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("users")
    .select("stated_name,name,telegram_id")
    .eq("id", userId)
    .maybeSingle();
  return data?.stated_name || data?.name || (data?.telegram_id ? `Fan ${data.telegram_id}` : userId);
}

async function logWrite(opts: { tool: string; summary: string; cloneId?: string | null; args: Record<string, unknown> }) {
  await supabaseAdmin.from("system_logs").insert({
    level: "info",
    source: "ai-assistant-write",
    clone_id: opts.cloneId ?? null,
    message: opts.summary,
    detail: { tool: opts.tool, args: opts.args },
  });
}

const FEATURE_LABELS: Record<CloneToggleField, string> = {
  photos_enabled: "Photos",
  videos_enabled: "Videos",
  bundles_enabled: "Photo bundles",
  voice_enabled: "Voice notes",
  video_vision_enabled: "Video vision (frame-grab)",
  tips_enabled: "Tip menu",
  charge_messages: "Message charging",
  live_captions_enabled: "Live captions",
  reactions_enabled: "Message reactions",
  read_receipts_enabled: "Read receipts",
  message_effects_enabled: "Message effects",
  ai_disclosure: "AI disclosure",
  emojis_enabled: "Emojis",
  discounts_enabled: "Discounts",
  smart_paywall_enabled: "Smart paywall",
};

async function execSetCloneFeature(args: Record<string, unknown>): Promise<unknown> {
  const idOrName = String(args.clone ?? "");
  const field = String(args.field ?? "") as CloneToggleField;
  const enabled = args.enabled === true;
  if (!idOrName) return { error: "missing clone" };
  if (!CLONE_TOGGLE_FIELDS.includes(field)) {
    return { error: `field not allowed: "${field}". Allowed: ${CLONE_TOGGLE_FIELDS.join(", ")}` };
  }
  const { id, name } = await resolveCloneId(idOrName);
  await setCloneToggle(id, field, enabled);
  const summary = `Turned ${enabled ? "ON" : "OFF"} ${FEATURE_LABELS[field]} for ${name}.`;
  await logWrite({ tool: "setCloneFeature", summary, cloneId: id, args });
  return { ok: true, summary };
}

const DIAL_LABELS: Record<CloneDialField, string> = {
  sexual_level: "Flirtiness",
  nsfw_level: "Explicitness",
  push_level: "Content pushing",
  warmth_level: "Warmth",
  curiosity_level: "Curiosity",
  playfulness_level: "Playfulness",
  attentiveness_level: "Attentiveness",
  emoji_amount: "Emoji amount",
};

// Tone/behavior dial, NOT a boolean and NOT money — see CLONE_DIAL_FIELDS
// (app/clones/toggle-fields.ts) for the exact allowed value per field. Every
// dial here is an enum-valued text column with a small fixed set of legal
// steps, so out-of-range values are rejected by setCloneDial itself, not
// clamped to the nearest one.
async function execSetCloneDial(args: Record<string, unknown>): Promise<unknown> {
  const idOrName = String(args.clone ?? "");
  const field = String(args.field ?? "") as CloneDialField;
  const value = String(args.value ?? "");
  if (!idOrName) return { error: "missing clone" };
  if (!(field in CLONE_DIAL_FIELDS)) {
    return { error: `field not allowed: "${field}". Allowed: ${CLONE_DIAL_FIELD_NAMES.join(", ")}` };
  }
  const allowed = CLONE_DIAL_FIELDS[field];
  if (!(allowed as readonly string[]).includes(value)) {
    return { error: `value not allowed for "${field}": "${value}". Allowed: ${allowed.join(", ")}` };
  }
  const { id, name } = await resolveCloneId(idOrName);
  await setCloneDial(id, field, value);
  const summary = `Set ${name}'s ${DIAL_LABELS[field]} dial to "${value}".`;
  await logWrite({ tool: "setCloneDial", summary, cloneId: id, args });
  return { ok: true, summary };
}

async function execSetCloneStatus(args: Record<string, unknown>): Promise<unknown> {
  const idOrName = String(args.clone ?? "");
  const status = String(args.status ?? "");
  if (status !== "active" && status !== "paused") return { error: `status must be "active" or "paused"` };
  const { id, name } = await resolveCloneId(idOrName);
  await setCloneStatusAction(id, status);
  const summary = `Set ${name}'s status to ${status}.`;
  await logWrite({ tool: "setCloneStatus", summary, cloneId: id, args });
  return { ok: true, summary };
}

async function execRecompileClonePersona(args: Record<string, unknown>): Promise<unknown> {
  const idOrName = String(args.clone ?? "");
  const { id, name } = await resolveCloneId(idOrName);
  await compileCloneAction(id);
  const summary = `Recompiled ${name}'s persona from her current intake answers.`;
  await logWrite({ tool: "recompileClonePersona", summary, cloneId: id, args });
  return { ok: true, summary };
}

// NOTE: updateFeedbackStatus lived here until 2026-07-31. The Feedback page and
// its server action were removed on 2026-07-28, and this was a thin wrapper over
// that action, so it went with it. The feedback_items TABLE still exists and is
// still readable through the read-only allowlist in tools.ts.

async function execSetFanCredits(args: Record<string, unknown>): Promise<unknown> {
  const userId = String(args.userId ?? "");
  const credits = Math.max(0, Math.floor(Number(args.credits)));
  if (!userId) return { error: "missing userId" };
  if (!Number.isFinite(credits)) return { error: "credits must be a number" };
  const { data: before } = await supabaseAdmin
    .from("users")
    .select("message_credits,clone_id")
    .eq("id", userId)
    .maybeSingle();
  const label = await fanLabel(userId);
  const fd = new FormData();
  fd.set("userId", userId);
  fd.set("credits", String(credits));
  await setFanCreditsAction(fd);
  const summary = `Set ${label}'s message credits to ${credits} (was ${before?.message_credits ?? "unknown"}).`;
  await logWrite({ tool: "setFanCredits", summary, cloneId: before?.clone_id ?? null, args });
  return { ok: true, summary };
}

async function execSetFanActive(args: Record<string, unknown>): Promise<unknown> {
  const userId = String(args.userId ?? "");
  const active = args.active === true;
  if (!userId) return { error: "missing userId" };
  const { data } = await supabaseAdmin.from("users").select("clone_id").eq("id", userId).maybeSingle();
  const label = await fanLabel(userId);
  const fd = new FormData();
  fd.set("userId", userId);
  fd.set("active", String(active));
  await toggleFanActiveAction(fd);
  const summary = `${active ? "Reactivated" : "Deactivated"} fan ${label}.`;
  await logWrite({ tool: "setFanActive", summary, cloneId: data?.clone_id ?? null, args });
  return { ok: true, summary };
}

async function execSetFanBlocked(args: Record<string, unknown>): Promise<unknown> {
  const userId = String(args.userId ?? "");
  const blocked = args.blocked === true;
  if (!userId) return { error: "missing userId" };
  const { data } = await supabaseAdmin.from("users").select("clone_id").eq("id", userId).maybeSingle();
  const label = await fanLabel(userId);
  const fd = new FormData();
  fd.set("userId", userId);
  fd.set("blocked", String(blocked));
  await setFanBlockedAction(fd);
  const summary = blocked
    ? `Blocked fan ${label}, she will no longer reply to them.`
    : `Unblocked fan ${label}, she will reply to them again.`;
  await logWrite({ tool: "setFanBlocked", summary, cloneId: data?.clone_id ?? null, args });
  return { ok: true, summary };
}

async function execResetFanCounters(args: Record<string, unknown>): Promise<unknown> {
  const userId = String(args.userId ?? "");
  if (!userId) return { error: "missing userId" };
  const { data } = await supabaseAdmin.from("users").select("clone_id").eq("id", userId).maybeSingle();
  const label = await fanLabel(userId);
  const fd = new FormData();
  fd.set("userId", userId);
  await resetFanCountersAction(fd);
  const summary = `Reset ${label}'s lifetime usage counters (messages sent + purchased). Credit balance untouched.`;
  await logWrite({ tool: "resetFanCounters", summary, cloneId: data?.clone_id ?? null, args });
  return { ok: true, summary };
}

// NOTE: startTestRun lived here until 2026-07-31, wrapping lib/test-runs.ts.
// The Test console was removed on 2026-07-28 and that module went with it. It
// was also the only write tool in this file that cost real money per call, so
// every remaining tool below is now a pure config change with no spend.

export async function executeWriteTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "setCloneFeature":
      return execSetCloneFeature(args);
    case "setCloneDial":
      return execSetCloneDial(args);
    case "setCloneStatus":
      return execSetCloneStatus(args);
    case "recompileClonePersona":
      return execRecompileClonePersona(args);
    case "setFanCredits":
      return execSetFanCredits(args);
    case "setFanActive":
      return execSetFanActive(args);
    case "setFanBlocked":
      return execSetFanBlocked(args);
    case "resetFanCounters":
      return execResetFanCounters(args);
    default:
      return { error: `unknown write tool: ${name}` };
  }
}

export const WRITE_TOOL_NAMES = new Set([
  "setCloneFeature",
  "setCloneDial",
  "setCloneStatus",
  "recompileClonePersona",
  "setFanCredits",
  "setFanActive",
  "setFanBlocked",
  "resetFanCounters",
]);

export const WRITE_TOOL_DEFS: OrToolDef[] = [
  {
    type: "function",
    function: {
      name: "setCloneFeature",
      description:
        "Turn an independent feature ON or OFF for one clone. This is a real write - it changes the live bot. " +
        `Allowed fields: ${CLONE_TOGGLE_FIELDS.join(", ")}. Never call this for anything money-related (prices, ` +
        "discount percentages, credit pack cost) - those aren't in the allowed field list.",
      parameters: {
        type: "object",
        properties: {
          clone: { type: "string", description: "Clone UUID or exact name (e.g. \"Aria\")." },
          field: { type: "string", enum: CLONE_TOGGLE_FIELDS as unknown as string[] },
          enabled: { type: "boolean" },
        },
        required: ["clone", "field", "enabled"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "setCloneDial",
      description:
        "Move one tone/behavior dial for a clone to a specific step. This is a real write - it changes the live " +
        "bot's prompt. Each field has its own small fixed set of legal values (an enum, not a free number); an " +
        "out-of-range value is rejected, not clamped. Allowed fields and their exact allowed values: " +
        Object.entries(CLONE_DIAL_FIELDS).map(([f, vals]) => `${f} (${vals.join("/")})`).join(", ") +
        ". Never call this for anything money-related - prices, discount percentages and credit pack cost are " +
        "never dials and are never in this list.",
      parameters: {
        type: "object",
        properties: {
          clone: { type: "string", description: "Clone UUID or exact name (e.g. \"Aria\")." },
          field: { type: "string", enum: CLONE_DIAL_FIELD_NAMES as unknown as string[] },
          value: { type: "string", description: "Must be one of that field's allowed values." },
        },
        required: ["clone", "field", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "setCloneStatus",
      description: "Pause or resume a clone (clones.status). Paused clones stop responding to fans within ~30s.",
      parameters: {
        type: "object",
        properties: {
          clone: { type: "string", description: "Clone UUID or exact name." },
          status: { type: "string", enum: ["active", "paused"] },
        },
        required: ["clone", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recompileClonePersona",
      description: "Re-run the AI persona compiler for a clone from its current intake answers.",
      parameters: {
        type: "object",
        properties: { clone: { type: "string", description: "Clone UUID or exact name." } },
        required: ["clone"],
      },
    },
  },
  // The updateFeedbackStatus DEFINITION was removed on 2026-07-31 along with
  // its executor (see the note above execSetFanCredits). It had outlived the
  // handler here: executeWriteTool and WRITE_TOOL_NAMES both dropped it, so it
  // was advertised to the model but answered "unknown write tool" if called.
  {
    type: "function",
    function: {
      name: "setFanCredits",
      description: "Admin-override a fan's remaining message credit balance (not a price - this is a support action).",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "The fan's users.id UUID (look it up with queryTable first)." },
          credits: { type: "integer", minimum: 0 },
        },
        required: ["userId", "credits"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "setFanActive",
      description: "Mark a fan active or inactive (users.is_active).",
      parameters: {
        type: "object",
        properties: { userId: { type: "string" }, active: { type: "boolean" } },
        required: ["userId", "active"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "setFanBlocked",
      description: "Block or unblock a fan (users.blocked) - the clone will stop/resume replying to them entirely.",
      parameters: {
        type: "object",
        properties: { userId: { type: "string" }, blocked: { type: "boolean" } },
        required: ["userId", "blocked"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resetFanCounters",
      description: "Zero a fan's lifetime message-sent/purchased counters. Does not touch their credit balance.",
      parameters: {
        type: "object",
        properties: { userId: { type: "string" } },
        required: ["userId"],
      },
    },
  },
  // startTestRun was removed on 2026-07-31, for the same reason its read-side
  // counterparts went from tools.ts: the Test console and lib/test-runs.ts were
  // removed on 2026-07-28. It had no executor here either, so a model that
  // reached for it got "unknown write tool" after being told the run costs
  // real money.
];
