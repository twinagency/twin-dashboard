export type CrmReadError = { code?: string | null; message: string };

type RangeableQuery = {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: CrmReadError | null }>;
};

type ReferenceQuery = PromiseLike<{ data: unknown[] | null; error: CrmReadError | null }>;

export type CrmReadResult<T> = { rows: T[]; error: CrmReadError | null };

const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_MAX_ROWS = 50_000;
const DEFAULT_REFERENCE_CHUNK = 100;

const ceilingError = (label: string, limit: number): CrmReadError => ({
  code: "CRM_ROW_LIMIT",
  message: `${label} exceeded the safe ${limit}-row read ceiling`,
});

/**
 * Read a complete ordered result without inheriting PostgREST's 1,000-row cap.
 * Each page gets a fresh query builder because `.range()` mutates its builder.
 * Hitting the finite ceiling fails closed instead of returning a partial set.
 */
export async function readEveryCrmRow<T>(
  label: string,
  makeQuery: () => RangeableQuery,
  options: { pageSize?: number; maxRows?: number } = {},
): Promise<CrmReadResult<T>> {
  const pageSize = Math.max(1, Math.min(DEFAULT_PAGE_SIZE, options.pageSize ?? DEFAULT_PAGE_SIZE));
  const maxRows = Math.max(pageSize, options.maxRows ?? DEFAULT_MAX_ROWS);
  const rows: T[] = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize, maxRows) - 1;
    const result = await makeQuery().range(from, to);
    if (result.error) return { rows: [], error: result.error };
    const page = (result.data ?? []) as T[];
    rows.push(...page);
    if (page.length < to - from + 1) return { rows, error: null };
  }

  return { rows: [], error: ceilingError(label, maxRows) };
}

/** Fetch unique reference rows by primary key in URL-safe chunks. */
export async function readCrmReferenceRowsByIds<T>(
  label: string,
  ids: readonly string[],
  makeQuery: (ids: string[]) => ReferenceQuery,
  options: { chunkSize?: number; maxIds?: number } = {},
): Promise<CrmReadResult<T>> {
  const uniqueIds = [...new Set(ids)];
  const maxIds = options.maxIds ?? DEFAULT_MAX_ROWS;
  if (uniqueIds.length > maxIds) return { rows: [], error: ceilingError(label, maxIds) };
  const chunkSize = Math.max(1, Math.min(DEFAULT_REFERENCE_CHUNK, options.chunkSize ?? DEFAULT_REFERENCE_CHUNK));
  const rows: T[] = [];

  for (let from = 0; from < uniqueIds.length; from += chunkSize) {
    const result = await makeQuery(uniqueIds.slice(from, from + chunkSize));
    if (result.error) return { rows: [], error: result.error };
    rows.push(...((result.data ?? []) as T[]));
  }

  return { rows, error: null };
}
