/**
 * W5 lib-openrouter-plus6 additions to tests/support/postgrest-wire.ts (which stays verbatim from W4).
 * lib/agency-query.ts scopeReadUrl appends `and=(<owner>.in.(<ids>))` to every agency read; postgrest-wire's
 * rowsReply does not model `and` (it throws → 599 → crash). `scopedRows` turns exactly that one shape into an `in`
 * filter and hands the rest to rowsReply unchanged, so a fix that routes a read through the agency wrapper is not
 * mistaken for a broken harness. Any other `and` shape still throws (fail loud).
 */
import { rowsReply, type WireFilter, type WireHandler } from "./postgrest-wire";

const AND_IN = /^\(([a-z_]+)\.in\.(\([^()]*\))\)$/;

export function scopedRows(rows: readonly Record<string, unknown>[]): WireHandler {
  const inner = rowsReply(rows);
  return (req) => {
    const filters: WireFilter[] = [];
    for (const f of req.filters) {
      if (f.column !== "and") { filters.push(f); continue; }
      const raw = req.url.searchParams.get("and") ?? "";
      const m = AND_IN.exec(raw);
      if (!m) throw new Error(`W5 wire: unmodelled and=${raw}`);
      filters.push({ column: m[1], op: "in", value: m[2], negate: false });
    }
    return inner({ ...req, filters });
  };
}

/**
 * A harness precondition (the fixture did not do what the test needs). Throws a plain Error, never an AssertionError,
 * so init.sh's known-red loop reads a broken fixture as "crashed", never as "still red".
 */
export function harness(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`harness: ${msg}`);
}
