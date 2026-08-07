import { withAdmin, ok, jsonError, logAdminWrite } from "@/lib/api-route";
import { createCloneRow } from "@/app/clones/actions";
import { resolveClone } from "@/lib/api-read";

export const dynamic = "force-dynamic";

// Create a new clone.
//
// Goes through createCloneRow(), the SAME server action the "New clone" form
// calls, so a clone made over the API is identical to one made in the UI: same
// slug generation, same duplicate-name check, same bot-token uniqueness check,
// same default drip steps, same missing-column retry path for migrations that
// have not landed yet. Inserting into `clones` directly would skip all of that
// and produce a row the dashboard cannot safely edit afterwards.
//
// createCloneRow takes FormData because it is a form action; rowFromForm()
// reads a large set of fields off it and applies the documented defaults for
// anything absent. That default-filling is CORRECT here (a brand new clone
// SHOULD get the defaults) and is only dangerous on UPDATE, which is why the
// update path in ../write/route.ts uses named setters instead.
export const POST = withAdmin(async (req) => {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("body must be JSON", 400);
  }

  const name = String(body.name ?? "").trim();
  const botToken = String(body.bot_token ?? "").trim();
  if (!name) return jsonError("name is required", 400);
  if (!botToken) {
    return jsonError(
      "bot_token is required: a clone with no Telegram token cannot be launched, and the slug/token uniqueness checks run against it",
      400,
    );
  }

  // Anything else the caller passes is forwarded verbatim to the same
  // rowFromForm() the UI uses, so the API cannot drift from the form's own
  // field handling. Unknown keys are simply ignored by it.
  const fd = new FormData();
  for (const [k, v] of Object.entries(body)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "object") {
      fd.set(k, JSON.stringify(v));
    } else {
      fd.set(k, String(v));
    }
  }

  try {
    const id = await createCloneRow(fd);
    const created = await resolveClone(id);

    logAdminWrite(`clone created "${name}"`, id, {
      name,
      slug: created?.slug ?? null,
      // The bot token is NEVER logged, here or anywhere.
    });

    return ok({
      created: created ?? { id },
      note:
        "Created with status from your payload (default active). A clone is a database row: index.ts picks up an active clone within ~30s, no deploy. It will have NO photos, NO onboarding steps and an uncompiled persona until you configure it.",
      next: [
        "POST /api/admin/v1/clones/write {action:\"compile\"} once intake prose is set, or the persona stays empty and the prompt is thin",
        "GET  /api/admin/v1/config?clone=<slug> to read back everything that was stored",
      ],
    });
  } catch (e) {
    // createCloneRow throws readable sentences for the cases an operator can
    // actually fix (duplicate name, token already in use, unusable name), so
    // pass them straight through as 400 rather than flattening to a 500.
    const msg = e instanceof Error ? e.message : "create failed";
    const isUserError =
      /already exists|at least one letter|required|already in use|token/i.test(msg);
    return jsonError(msg, isUserError ? 400 : 500);
  }
});
