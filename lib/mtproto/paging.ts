// lib/mtproto/paging.ts
//
// Self-contained copy of lib/select-all.ts's selectAllRowsParallel pattern
// (per the 2026-09-22 build instruction: read the existing helper for the
// PATTERN, don't cross-import it). Same contract, same reasoning: PostgREST
// caps a response at 1000 rows with no error and no signal, so a read that
// needs every matching row must page with .range() and report `truncated`
// rather than silently returning a partial set as if it were the whole table.
//
// reengage_events grows fast once the worker is live (N4: "add indexes up
// front... fetch in parallel"), so every caller here bounds by a time window
// or run id FIRST and pages second — this helper does not replace bounding a
// query, it protects against a bounded query still being large.

type Rangeable = {
  range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
};

const PAGE = 1000;
const DEFAULT_MAX_ROWS = 50_000;

export type PagedResult<T> = {
  rows: T[];
  /** True when the read stopped at maxRows with more rows still matching —
   *  any count/aggregate built from a truncated read is a lower bound. */
  truncated: boolean;
};

/**
 * Pages a query concurrently. `makeQuery` must return a FRESH builder each
 * call with the same filters and the same stable ORDER BY every time — see
 * lib/select-all.ts's header comment for why a shared, mutated builder
 * silently double-counts or skips rows under concurrency.
 */
export async function selectAllRowsMtproto<T>(
  makeQuery: () => Rangeable,
  opts: { maxRows?: number; label?: string; concurrency?: number; throwOnError?: boolean } = {},
): Promise<PagedResult<T>> {
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const label = opts.label ?? "mtproto query";
  const rows: T[] = [];

  const fetchPage = async (from: number) => {
    const to = Math.min(from + PAGE, maxRows) - 1;
    const { data, error } = await makeQuery().range(from, to);
    return { from, to, data, error };
  };

  let from = 0;
  let wave = 1; // first pass is one page: most reads here are small and bounded
  while (from < maxRows) {
    const starts: number[] = [];
    for (let i = 0; i < wave && from + i * PAGE < maxRows; i++) starts.push(from + i * PAGE);
    const pages = await Promise.all(starts.map(fetchPage));

    for (const page of pages) {
      if (page.error) {
        console.error(`[mtproto paging] ${label} failed at ${page.from}-${page.to}: ${page.error.message}`);
        // Safety-critical reads (opt-outs, already-contacted) must not quietly
        // continue with a partial list.
        if (opts.throwOnError) throw Object.assign(new Error(`${label}: ${page.error.message}`), { code: (page.error as { code?: string }).code });
        return { rows, truncated: true };
      }
      const batch = (page.data ?? []) as T[];
      rows.push(...batch);
      if (batch.length < page.to - page.from + 1) return { rows, truncated: false };
    }

    from = starts[starts.length - 1] + PAGE;
    wave = concurrency;
  }

  console.warn(`[mtproto paging] ${label} hit the ${maxRows} row ceiling; totals below this are lower bounds.`);
  return { rows, truncated: true };
}
