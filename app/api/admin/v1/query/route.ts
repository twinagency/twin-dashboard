import { withAdmin, okOrError, fromQueryError } from "@/lib/api-route";
import { parseQuery, runQuery, isQueryError } from "@/lib/api-read";

export const dynamic = "force-dynamic";

// The generic allowlisted reader — the "EVERYTHING" endpoint, within the bounds
// of the allowlist. The specialised endpoints beside it exist for the shapes
// that need a join or a default ordering, not because this one is restricted.
export const GET = withAdmin(async (req) => {
  const params = new URL(req.url).searchParams;
  const spec = parseQuery(params);
  if (isQueryError(spec)) return fromQueryError(spec);
  return okOrError(await runQuery(spec));
});
