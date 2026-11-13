import { withAdmin, ok, jsonError, okOrError, fromQueryError } from "@/lib/api-route";
import { resolveClone, runQuery, isQueryError, clampLimit } from "@/lib/api-read";

export const dynamic = "force-dynamic";

// Fans, from the `users` table, plus the AI-extracted `fan_profiles` row when a
// single fan is requested.
//
// NOTE ON SPEND: users.total_spent_stars is a running ledger the bot maintains
// through add_spend() on every purchase; it is what the Fans page and the AI
// assistant both call "spent", and re-summing star_transactions here would give
// a second, differently-wrong number for the same question.
export const GET = withAdmin(async (req) => {
  const params = new URL(req.url).searchParams;

  const cloneKey = params.get("clone");
  const filters: { column: string; op: "eq"; value: string }[] = [];
  let clone: { id: string; slug: string; name: string } | null = null;
  if (cloneKey) {
    clone = await resolveClone(cloneKey);
    if (!clone) return jsonError(`no clone matching "${cloneKey}"`, 404);
    filters.push({ column: "clone_id", op: "eq", value: clone.id });
  }

  const fan = params.get("fan");
  if (!fan) {
    // Fleet or per-clone listing, ranked by lifetime spend.
    return okOrError(
      await runQuery({
        table: "users",
        filters,
        orderBy: "total_spent_stars",
        ascending: false,
        limit: clampLimit(params.get("limit")),
      }),
    );
  }

  if (!/^\d+$/.test(fan)) return jsonError("fan must be a numeric telegram_id", 400);
  filters.push({ column: "telegram_id", op: "eq", value: fan });

  const users = await runQuery({ table: "users", filters, limit: 50 });
  if (isQueryError(users)) return fromQueryError(users);
  if (!users.rowCount) return jsonError(`no fan with telegram_id ${fan}${clone ? ` on ${clone.slug}` : ""}`, 404);

  // A fan is (clone_id, telegram_id), so the same Telegram id can be a separate
  // row on every clone. Without ?clone= this legitimately returns several, and
  // the profile read is skipped: with no user_id filter it would return
  // unrelated fans' profiles.
  const one = users.rows.length === 1 ? (users.rows as { id: string }[])[0] : null;
  const profiles = one
    ? await runQuery({ table: "fan_profiles", filters: [{ column: "user_id", op: "eq", value: one.id }], limit: 50 })
    : null;
  if (profiles && isQueryError(profiles)) return fromQueryError(profiles);

  return ok({
    telegramId: Number(fan),
    clone: clone ? { id: clone.id, slug: clone.slug, name: clone.name } : null,
    users: users.rows,
    profiles: profiles ? profiles.rows : [],
    note:
      (users.rows as unknown[]).length > 1
        ? "This Telegram id exists on more than one clone. Pass ?clone= to narrow it; the profile lookup is skipped while ambiguous."
        : undefined,
  });
});
