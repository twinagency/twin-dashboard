// Guards the CALL SITES, not the helper.
//
// check-select-all.ts proves selectAllRows() pages correctly. It passed the
// entire time the revenue number was wrong, because a correct helper that a
// read never calls is worth nothing. On 2026-08-09 lib/dashboard-data.ts,
// lib/analytics-data.ts and lib/star-balance.ts all still read
// star_transactions unpaged: alanna-pow's 3-month window returned 1000 of 3383
// rows and reported 304,220 stars against an actual 1,340,088, and her lifetime
// total was the first thousand of 5,010 transactions. No error, no warning, and
// because none of those reads has an ORDER BY, WHICH thousand rows came back was
// arbitrary - so a wider window could report LESS money than a narrower one.
//
// So this asserts the property that actually matters: every read of an unbounded
// table in lib/ is either paged or explicitly bounded.
//
// It reads source text, which is a blunt instrument, so it is written to avoid
// the trap that has bitten this repo before - a check that matches its own
// assertion strings. It never scans scripts/, only lib/, and it keys off the
// query builder's own `.from("<table>")` call rather than off any prose.
//
// PROVEN TO FAIL: unwrap the selectAllRows() around the ledger read in
// lib/dashboard-data.ts and this goes red naming that file and line.
//
// Run: npm run test:callsites
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
function assert(label: string, cond: boolean) {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures += 1;
}

// Tables with no natural ceiling: they grow with fans, messages and payments, so
// any full read of one outruns the server cap eventually. `clones` is absent on
// purpose - a fleet is tens of rows and will not reach 1000.
// `usage_events` joined the list on 2026-08-12: at ~11k rows/day it passes the
// 1000-row ceiling inside two hours, so even the "today" window of an unpaged
// read was already returning a fraction of the day and calling it a total.
const UNBOUNDED = ["star_transactions", "users", "chat_history", "paywall_hits", "llm_calls", "system_logs", "usage_events"];

// A read is acceptable if it pages, or if it deliberately asks for a bounded
// slice. `.limit()`, `.single()`, `.maybeSingle()` and `.range()` are all
// explicit ceilings - the author said how much they wanted.
const BOUNDED_BY = ["selectAllRows", ".limit(", ".single(", ".maybeSingle(", ".range(", "head: true", "count:"];

const LIB = join(import.meta.dirname, "..", "lib");

type Offence = { file: string; line: number; table: string; text: string };
const offences: Offence[] = [];
let readsChecked = 0;

for (const name of readdirSync(LIB).filter((f) => f.endsWith(".ts"))) {
  const src = readFileSync(join(LIB, name), "utf8");
  const lines = src.split("\n");

  for (const table of UNBOUNDED) {
    const needle = `.from("${table}")`;
    lines.forEach((line, i) => {
      if (!line.includes(needle)) return;
      readsChecked += 1;

      // The statement this read belongs to: walk back to the line that opens it
      // (an assignment or an await) and forward to the one that ends it. Chained
      // builders span many lines, and .limit() often sits several below .from().
      let start = i;
      while (start > 0 && !/(^|[\s(])(const|let|var|await|return)\s|=\s*$/.test(lines[start])) {
        start -= 1;
        if (i - start > 12) break; // a statement longer than this is not a simple read
      }
      let end = i;
      while (end < lines.length - 1 && !/;\s*$/.test(lines[end])) {
        end += 1;
        if (end - i > 20) break;
      }
      const stmt = lines.slice(start, end + 1).join("\n");

      // Only READS can truncate. `.insert()`, `.update()`, `.upsert()` and
      // `.delete()` name the same tables and are none of this check's business.
      if (!stmt.includes(".select(")) {
        readsChecked -= 1;
        return;
      }

      // A builder assigned to a variable and awaited elsewhere (the `let q = ...;
      // if (x) q = q.eq(...); await selectAllRows(q)` shape) is judged on the
      // whole function, not the assignment - so widen once before condemning it.
      const widened = stmt + "\n" + lines.slice(end, Math.min(lines.length, end + 12)).join("\n");

      if (!BOUNDED_BY.some((b) => stmt.includes(b) || widened.includes(b))) {
        offences.push({ file: name, line: i + 1, table, text: line.trim() });
      }
    });
  }
}

console.log("unpaged fleet-wide reads in lib/");
assert(`scanned some reads at all (found ${readsChecked})`, readsChecked > 0);
assert(
  `every read of an unbounded table is paged or explicitly bounded`,
  offences.length === 0,
);
for (const o of offences) {
  console.error(`      ${o.file}:${o.line}  ${o.table}  ${o.text}`);
}

// The scanner has to be able to fail, or it is decoration. Feed it a read it
// must reject and one it must accept, both built here rather than matched from
// any file's text.
{
  const bad = `const { data } = await supabaseAdmin.from("star_transactions").select("amount_stars");`;
  const good = `const { rows } = await selectAllRows(supabaseAdmin.from("star_transactions").select("amount_stars"));`;
  assert("a plain unpaged read is not considered bounded", !BOUNDED_BY.some((b) => bad.includes(b)));
  assert("a selectAllRows read is considered bounded", BOUNDED_BY.some((b) => good.includes(b)));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
