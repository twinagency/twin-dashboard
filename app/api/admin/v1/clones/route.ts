import { withAdmin, okOrError } from "@/lib/api-route";
import { runQuery } from "@/lib/api-read";

export const dynamic = "force-dynamic";

// Fleet listing: the identity every other endpoint's `clone=` parameter accepts.
// Deliberately thin — the full config is /config, and shipping 200 columns here
// would make the cheapest call on the API the most expensive one.
//
// Goes through runQuery like everything else rather than hitting supabaseAdmin
// directly, so there is exactly ONE place where a column can be admitted to
// this API. A hand-written select here would be the second place, and the
// second place is the one that eventually names a column it shouldn't.
export const GET = withAdmin(async () => {
  return okOrError(
    await runQuery({
      table: "clones",
      select: [
        "id", "slug", "name", "status", "ai_mode", "timezone",
        "business_username", "deployed_at", "created_at", "updated_at",
      ],
      orderBy: "created_at",
      ascending: true,
      limit: 1000,
    }),
  );
});
