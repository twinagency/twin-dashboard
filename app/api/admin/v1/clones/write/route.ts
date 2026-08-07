import { withAdmin, ok, jsonError, logAdminWrite } from "@/lib/api-route";
import { resolveClone } from "@/lib/api-read";
import { setStatus, setCloneToggle, setCloneDial, compileCloneAction } from "@/app/clones/actions";
import {
  CLONE_TOGGLE_FIELDS,
  CLONE_DIAL_FIELDS,
  CLONE_DIAL_FIELD_NAMES,
  type CloneToggleField,
  type CloneDialField,
} from "@/app/clones/toggle-fields";

export const dynamic = "force-dynamic";

// ── The write half of the admin API ──────────────────────────────────────────
//
// EVERY WRITE GOES THROUGH THE SAME SERVER ACTION THE DASHBOARD USES.
// setStatus / setCloneToggle / setCloneDial / compileCloneAction already exist,
// are already validated, and are already what the operator UI and the /ai
// assistant call. dashboard/CLAUDE.md rule 3 is explicit that writes are thin
// wrappers over existing validated actions, never a generic "update any
// column" tool and never raw SQL. This file is that wrapper and nothing more.
//
// WHY NOT A GENERIC PATCH OVER EVERY COLUMN, which is what "edit config" might
// sound like it wants: updateClone() takes the WHOLE Configure form, and
// rowFromForm() applies hardcoded fallbacks for anything absent. Handing it a
// partial payload is exactly the bug this dashboard already shipped once
// (65c287e): toggling one control off and saving repriced the credit pack from
// 1 star to 199 and zeroed all four discount caps, because controls that did
// not render posted nothing and the fallbacks overwrote the stored row. A
// generic API PATCH walks straight back into that with no UI to notice.
//
// SO: named operations over named allowlists. Money is not writable here, on
// purpose - see the note at the bottom of this file.

type Action = "status" | "toggle" | "dial" | "compile";

export const POST = withAdmin(async (req) => {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("body must be JSON", 400);
  }

  const action = String(body.action ?? "") as Action;
  const cloneKey = String(body.clone ?? "");
  if (!cloneKey) return jsonError("clone is required (uuid, slug, or name)", 400);

  const clone = await resolveClone(cloneKey);
  if (!clone) return jsonError(`no clone matching "${cloneKey}"`, 404);

  try {
    switch (action) {
      // ── pause / resume ───────────────────────────────────────────────────
      // A clone is a database row and index.ts reconciles active clones every
      // 30s, so this takes effect within ~30s with NO deploy.
      case "status": {
        const status = String(body.status ?? "");
        if (status !== "active" && status !== "paused") {
          return jsonError('status must be "active" or "paused"', 400);
        }
        await setStatus(clone.id, status);
        logAdminWrite("status", clone.id, { status });
        return ok({
          clone,
          action,
          status,
          note: "Takes effect within ~30s: index.ts reconciles active clones on a timer. No deploy needed.",
        });
      }

      // ── feature toggles ──────────────────────────────────────────────────
      case "toggle": {
        const field = String(body.field ?? "") as CloneToggleField;
        const value = body.value;
        if (!(CLONE_TOGGLE_FIELDS as readonly string[]).includes(field)) {
          return jsonError(
            `field not allowed: "${field}". Allowed: ${CLONE_TOGGLE_FIELDS.join(", ")}`,
            400,
          );
        }
        if (typeof value !== "boolean") return jsonError("value must be true or false", 400);
        await setCloneToggle(clone.id, field, value);
        logAdminWrite("toggle", clone.id, { field, value });
        return ok({
          clone,
          action,
          field,
          value,
          note: "The bot re-reads the clone row every message, so this lands on her next reply.",
        });
      }

      // ── tone / behaviour dials ───────────────────────────────────────────
      case "dial": {
        const field = String(body.field ?? "") as CloneDialField;
        const value = String(body.value ?? "");
        const allowed = CLONE_DIAL_FIELDS[field] as readonly string[] | undefined;
        if (!allowed) {
          return jsonError(
            `field not allowed: "${field}". Allowed: ${CLONE_DIAL_FIELD_NAMES.join(", ")}`,
            400,
          );
        }
        if (!allowed.includes(value)) {
          return jsonError(
            `value not allowed for "${field}": "${value}". Allowed: ${allowed.join(", ")}`,
            400,
          );
        }
        await setCloneDial(clone.id, field, value);
        logAdminWrite("dial", clone.id, { field, value });
        return ok({ clone, action, field, value });
      }

      // ── recompile the persona ────────────────────────────────────────────
      // The step that makes intake prose actually reach the prompt. Without it
      // a config change can sit in the database looking right and be inert to
      // the runtime, which is this project's single most common defect.
      case "compile": {
        await compileCloneAction(clone.id);
        logAdminWrite("compile", clone.id, {});
        return ok({
          clone,
          action,
          note: "Persona recompiled from intake through the same compiler the dashboard Save uses.",
        });
      }

      default:
        return jsonError(
          `unknown action: "${action}". Allowed: status, toggle, dial, compile. Creating a clone is POST /api/admin/v1/clones/create.`,
          400,
        );
    }
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "write failed", 500);
  }
});

// ── WHAT IS DELIBERATELY NOT WRITABLE HERE, AND WHY ──────────────────────────
// MONEY: prices, credit pack size/price, the four discount caps, spend tiers,
//   subscription tiers. Every one is a number where a wrong write costs real
//   money immediately, and the dashboard has already shipped one bug of exactly
//   that shape. They need per-field validation against the same DB CHECK
//   constraints the UI clamps to, which is a deliberate piece of work, not a
//   line in an allowlist.
// FREE TEXT that reaches fans: welcome_instruction, paywall_instruction,
//   hard_limits_extra, example texts. These change what she SAYS to real
//   people, so they belong behind the propose-then-approve gate the /ai
//   assistant already has, not behind a bare API key.
// subscriptions_enabled: excluded from CLONE_TOGGLE_FIELDS on purpose (the
//   operator removed subscriptions in 2026-07); this route inherits that.
