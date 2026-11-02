import { withAdmin, ok, jsonError, fromQueryError } from "@/lib/api-route";
import { adminColumns, resolveClone, runQuery, isQueryError, LEGACY_PROMPT_COLUMNS } from "@/lib/api-read";

export const dynamic = "force-dynamic";

// One clone's ENTIRE readable config, including the persona blob and the intake
// answers — the thing sim testing and prompt tooling actually need, and the
// reason this API exists at all.
//
// WHAT THIS IS NOT: it is not the prompt the bot sends. The live prompt is
// assembled inside the bot (assemblePrompt, over `persona` + prompt_templates),
// and this dashboard only mirrors part of that logic (lib/persona-facts.ts, and
// dashboard/CLAUDE.md warns the two must be changed together). A simulator that
// treats this payload as the prompt is testing a copy, not the runtime. Said in
// the response as well as here, because that distinction is exactly the sort
// this project has got wrong before.
export const GET = withAdmin(async (req) => {
  const params = new URL(req.url).searchParams;
  const key = params.get("clone");
  if (!key) return jsonError("clone is required (uuid, slug, or name)", 400);

  const clone = await resolveClone(key);
  if (!clone) return jsonError(`no clone matching "${key}"`, 404);

  const columns = adminColumns("clones") ?? [];
  const result = await runQuery({
    table: "clones",
    select: columns,
    filters: [{ column: "id", op: "eq", value: clone.id }],
    limit: 1,
  });
  if (isQueryError(result)) return fromQueryError(result);

  const row = (result.rows[0] ?? null) as Record<string, unknown> | null;
  if (!row) return jsonError(`no clone matching "${key}"`, 404);

  return ok({
    clone: { id: clone.id, slug: clone.slug, name: clone.name },
    config: row,
    live: {
      persona: "`persona` is the compiled slot data the runtime reads.",
      legacy: `${LEGACY_PROMPT_COLUMNS.join(", ")} are frozen legacy output and are NOT read by the bot.`,
      assembly:
        "The prompt a fan actually receives is assembled by the bot at send time from `persona` + prompt_templates. This endpoint returns stored config, not that assembled prompt.",
    },
  });
});
