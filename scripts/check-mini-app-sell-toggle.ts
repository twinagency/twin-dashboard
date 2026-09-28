// Sell-via-Mini-App per-creator switch (clones.sell_via_mini_app, migration
// 20260928140000). The column and the bot's read side (mapClone, browse.ts,
// flows/bundle.ts, flows/media.ts) shipped in twin-bot's
// feat/alanna-sell-through-app, merged to main, default off (Alanna pilot
// only). NOTHING in this repo read or wrote the column, so an operator had no
// way to turn it on for any other creator. Walk the whole chain from
// dashboard/CLAUDE.md's "half-wired toggle" section: migration -> mapClone ->
// both repos' types -> app/clones/actions.ts (rowFromForm + OPTIONAL_COLUMNS)
// -> useCloneConfig -> the control itself.
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`PASS  ${name}`);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

check("the mini app sell toggle is wired from the form to the column", () => {
  const actions = readFileSync(resolve(root, "app/clones/actions.ts"), "utf8");
  assert.ok(/sell_via_mini_app: fd\.get\("sell_via_mini_app"\) === "true"/.test(actions),
    "rowFromForm does not map the mini app sell toggle, so the control saves nothing");
  assert.ok(/MINI_APP_SELL_COLUMNS = \["sell_via_mini_app"\]/.test(actions),
    "the column is not declared as an optional column: a save before the migration lands would fail outright");
  assert.ok(/\.\.\.MINI_APP_SELL_COLUMNS,/.test(actions), "MINI_APP_SELL_COLUMNS is declared but not in OPTIONAL_COLUMNS");

  const hook = readFileSync(resolve(root, "components/clone/useCloneConfig.ts"), "utf8");
  assert.ok(/sellViaMiniApp: clone\?\.sell_via_mini_app \?\? false/.test(hook),
    "useCloneConfig does not read the column, so the control always renders off");

  const ui = readFileSync(resolve(root, "components/clone/ConfigSections.tsx"), "utf8");
  assert.ok(/name="sell_via_mini_app"/.test(ui), "there is no control for the mini app sell toggle");
  assert.ok(/checked={cfg\.sellViaMiniApp}/.test(ui), "the control does not show the saved value");
  assert.ok(/label="Sell content through the app"/.test(ui), "the control label does not match the requested copy");
  assert.ok(/opens this item in the app, instead of a Stars lock in chat/.test(ui),
    "the ⓘ hint copy does not match the requested wording");
  assert.ok(!/—/.test(ui.slice(ui.indexOf('name="sell_via_mini_app"') - 800, ui.indexOf('name="sell_via_mini_app"') + 400)),
    "no em dashes in the toggle's own copy block");

  const types = readFileSync(resolve(root, "lib/types.ts"), "utf8");
  assert.ok(/sell_via_mini_app\?: boolean/.test(types), "the column is missing from this repo's Clone type");
});

check("the bot reads the same column the dashboard writes, and defaults it off", () => {
  // twin-bot/src/data/supabase-store.ts on disk here reflects whatever branch
  // that sibling checkout happens to have checked out locally, which is not
  // necessarily main. The actual mapClone wiring (sellViaMiniApp:
  // r.sell_via_mini_app ?? false) shipped and merged to twin-bot's main in
  // feat/alanna-sell-through-app, so check origin/main directly rather than
  // trust the local working copy's current branch.
  let store: string;
  try {
    store = execFileSync("git", ["-C", resolve(root, "../twin-bot"), "show", "origin/main:src/data/supabase-store.ts"], { encoding: "utf8" });
  } catch {
    store = readFileSync(resolve(root, "../twin-bot/src/data/supabase-store.ts"), "utf8");
  }
  assert.ok(/sellViaMiniApp: r\.sell_via_mini_app \?\? false/.test(store),
    "mapClone drops the column or does not fail closed, which is this project's number one silent failure");
});

console.log(`\nmini app sell toggle wiring: ${passed} checks passed`);
