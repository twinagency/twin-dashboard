// Paged reads for queries that must see every matching row.
//
// THE BUG THIS EXISTS FOR: PostgREST caps every response at `max-rows` (1000 on
// Supabase's default config). A select with no .range() does not error when it
// hits that ceiling and does not tell you it truncated — you just get 1000 rows
// back and roll them up as if they were the whole table. Every count computed
// that way is silently wrong, and wrong in the direction that looks plausible.
//
// It has been invisible so far only because the fleet is small (39 fans, 1.9k
// chat rows). The n8n import brings ~29,800 fans and ~1.22M messages, which puts
// every fleet-wide roll-up in lib/ past the ceiling on day one. See
// docs/BRIDGE-RESEARCH.md.
//
// selectAllRows() pages with .range() until a short page proves the end, so the
// result is the real full set. It never silently truncates: hitting `maxRows`
// sets `truncated` on the result, and the caller decides what that means.

// Structural, not imported from @supabase/postgrest-js: that package is a
// transitive dep of supabase-js, not a direct one here, and its builder
// generics differ per call site. All this needs is .range().
type Rangeable = {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
};

// Supabase's own server cap. Paging in larger strides than the server will
// return just wastes a round trip, so the stride matches it.
const PAGE = 1000;

// Ceiling per call, not per page. 1.22M chat rows at ~200 bytes is ~250MB of JS
// objects, which is a dead Node process, so a fleet-wide read has to stop
// somewhere and say so rather than fetch until it dies.
const DEFAULT_MAX_ROWS = 200_000;

export type PagedResult<T> = {
  rows: T[];
  /** True when the read stopped at maxRows with more rows still matching. Any
   *  aggregate computed from a truncated read is a lower bound, not a total. */
  truncated: boolean;
};

/**
 * Read every row matching `query`, paging past the PostgREST row cap.
 *
 * Pass a query with its filters already applied but WITHOUT .range()/.limit() —
 * this adds the ranges. Ordering is left to the caller; an unordered paged read
 * can repeat or skip rows across pages, so order by something unique when the
 * exact set matters.
 */
export async function selectAllRows<T>(
  // Stays a builder rather than an awaited thenable, because each page re-ranges
  // the same query.
  query: Rangeable,
  opts: { maxRows?: number; label?: string } = {},
): Promise<PagedResult<T>> {
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  const rows: T[] = [];

  for (let from = 0; from < maxRows; from += PAGE) {
    const to = Math.min(from + PAGE, maxRows) - 1;
    const { data, error } = await query.range(from, to);
    if (error) {
      // Surface rather than swallow: the callers here all use `const { data }`
      // and treat an error as an empty table, which reads as "no fans" on a
      // dashboard. A partial page is still worth returning.
      console.error(`[selectAllRows] ${opts.label ?? "query"} failed at ${from}-${to}: ${error.message}`);
      return { rows, truncated: true };
    }
    const page = (data ?? []) as T[];
    rows.push(...page);
    // A short page means the server ran out of matches, which is the only
    // reliable end signal — a full page could be either.
    if (page.length < to - from + 1) return { rows, truncated: false };
  }

  // Landed exactly on the ceiling with matches possibly remaining.
  console.warn(
    `[selectAllRows] ${opts.label ?? "query"} hit the ${maxRows} row ceiling; totals below this are lower bounds.`,
  );
  return { rows, truncated: true };
}
