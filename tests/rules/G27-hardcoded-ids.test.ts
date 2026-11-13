/**
 * G27: promoted from tests/known-red/W5-app-clones-* (fix-sweep) as a regression guard.
 * Known red (W5 app-clones F5, REVIEW inv 5 / CLAUDE.md rule 4 "a clone is a database row"): app/clones/page.tsx:18-21,39-41
 * hard-codes two creator UUIDs (MOXY_VISIBLE_CREATOR_IDS) and filters the grid by agency NAME (isMoxy). Visibility is a
 * per-clone code path, not data; the same clones stay reachable at /clones/<id> through the agency's real assignment.
 * Related, not the same lines: RISKS R7/D12 (moxy.ts amelia/cristina), W5 app-actions-plus5 hardcoded-ids.
 * Control: the page file is read (holds). Turns green when the page carries no UUID literal and no Moxy name branch,
 * and the two roster ids appear nowhere in app/, lib/, components/ (relocating the set is not a fix; the sibling copy in
 * app/agency/creators/page.tsx is the same defect, so this stays red until both go).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const src = readFileSync(new URL("../../app/clones/page.tsx", import.meta.url), "utf8");
const UUID = /["'`][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}["'`]/gi;

test("control: the clones list page source is readable", () => {
  assert.match(src, /export default/);
});

test("the clones list page carries no hard-coded clone/creator ids", () => {
  assert.deepEqual(src.match(UUID) ?? [], []);
});

test("the clones list page has no agency-name branch (isMoxy / MOXY_ roster)", () => {
  assert.deepEqual(src.match(/\bisMoxy\b|\bMOXY_[A-Z_]+/g) ?? [], []);
});

const ROSTER = ["20ef9407-83f2-4351-8d3c-48cc0ed54e0b", "d2678dce-6a4e-4f1c-b54a-86057bba427c"];
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(p);
  }
  return out;
}
test("the roster ids are not relocated into another product module", () => {
  const root = new URL("../../", import.meta.url).pathname;
  const hits = ["app", "lib", "components"].flatMap((d) => walk(join(root, d)))
    .filter((f) => ROSTER.some((id) => readFileSync(f, "utf8").includes(id))).map((f) => f.slice(root.length));
  assert.deepEqual(hits, []);
});
