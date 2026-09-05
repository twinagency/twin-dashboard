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

// ── why selectAllRows() above is still a sequential for-loop ──────────────────
//
// Supabase is cloud-hosted, so each page is an internet round trip and the
// obvious fix is to fire them with Promise.all. It cannot be done on the
// builder selectAllRows() is handed, and the reason is not stylistic:
//
//   range(from, to, ...) {
//     this.url.searchParams.set(keyOffset, `${from}`)
//     this.url.searchParams.set(keyLimit, `${to - from + 1}`)
//     return this
//   }
//     -- @supabase/postgrest-js, dist/index.cjs
//
// .range() MUTATES the builder and returns the same object. The sequential loop
// is safe only because it re-ranges and awaits before re-ranging again. Written
// as `Promise.all([q.range(0, 999), q.range(1000, 1999)])`, both .range() calls
// run synchronously first, so both leave offset=1000 in the ONE shared URL, and
// then two fetches go out for the SAME page. Rows 0-999 are never read and rows
// 1000-1999 are counted twice. Nothing errors and no page is short, so
// `truncated` stays false and the caller publishes the wrong total as a fact.
//
// This helper backs money numbers, so the default path does not get that.
// Parallel paging needs a FRESH builder per page, which means the caller has to
// hand over a factory rather than a built query — hence the second function
// rather than a flag on the first. Existing callers are untouched.

/**
 * Same contract as selectAllRows(), but paged concurrently.
 *
 * `makeQuery` must return a NEW builder each call, with the same filters and
 * the same ORDER BY every time — an unstable or absent sort makes concurrent
 * ranges overlap or skip, exactly as it does sequentially.
 *
 * The first page is fetched alone. A short first page is the common case
 * (whales, a week of sales) and ends the read in one round trip, so nothing
 * small pays for speculative fan-out. Only once a full page proves there is
 * more do the remaining pages go out in waves of `concurrency`.
 *
 * What that buys, measured against a fake builder (rows -> serial waves, was
 * sequential pages): 500 -> 1 (was 1); 3,383 -> 2 (was 4); 8,602 -> 3 (was 9);
 * 30,000 -> 9 (was 31). Serial waves are the number that costs wall-clock time
 * on a cloud database, not the number of statements.
 *
 * THE COST, so it is not a surprise: the end of the data is only discovered by
 * a short page, so a wave that begins exactly at the end issues up to
 * `concurrency - 1` requests that come back empty. Worst case is 3 extra
 * index-only reads (9,000 rows: 13 requests where sequential made 10). They are
 * concurrent, so they cost no extra wall-clock time, and they never affect the
 * result: a page after a short one is empty by definition and the read stops at
 * the short page regardless.
 */
export async function selectAllRowsParallel<T>(
  makeQuery: () => Rangeable,
  opts: { maxRows?: number; label?: string; concurrency?: number } = {},
): Promise<PagedResult<T>> {
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const label = opts.label ?? "query";
  const rows: T[] = [];

  const fetchPage = async (from: number) => {
    const to = Math.min(from + PAGE, maxRows) - 1;
    const { data, error } = await makeQuery().range(from, to);
    return { from, to, data, error };
  };

  let from = 0;
  // 1 on the first pass: a small result must cost exactly one round trip, the
  // same as it does today. Widened to `concurrency` only after a full page has
  // proven there is more to read.
  let wave = 1;
  while (from < maxRows) {
    // One wave of ranges, each on its own builder. `starts` never runs past
    // maxRows, so the ceiling is honoured exactly as in the sequential path.
    const starts: number[] = [];
    for (let i = 0; i < wave && from + i * PAGE < maxRows; i++) starts.push(from + i * PAGE);
    const pages = await Promise.all(starts.map(fetchPage));

    for (const page of pages) {
      if (page.error) {
        // Identical to the sequential path: keep what was read BEFORE the
        // failure, and mark it truncated so no caller mistakes a partial read
        // for a total. Pages after this one in the wave are discarded even if
        // they succeeded, because the gap they sit behind was never read.
        console.error(`[selectAllRowsParallel] ${label} failed at ${page.from}-${page.to}: ${page.error.message}`);
        return { rows, truncated: true };
      }
      const batch = (page.data ?? []) as T[];
      rows.push(...batch);
      // A short page is still the only end-of-matches signal. Anything the wave
      // fetched beyond it is empty by definition, so stopping here loses
      // nothing — and stopping is required, not optional, because a later page
      // in the same wave could otherwise re-add rows across a hole.
      if (batch.length < page.to - page.from + 1) return { rows, truncated: false };
    }

    from = starts[starts.length - 1] + PAGE;
    wave = concurrency;
  }

  console.warn(
    `[selectAllRowsParallel] ${label} hit the ${maxRows} row ceiling; totals below this are lower bounds.`,
  );
  return { rows, truncated: true };
}
