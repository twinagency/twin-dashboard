// KNOWN RED (W4 lib-onlyfans-preview-1 F4): groupFanMemory (lib/onlyfans-preview/fan-memory-groups.ts:43-48) dedupes on
// category + value without the label, so "Boundaries: feet" disappears behind "Likes: Feet" in the live Fan memory
// panel (a hidden boundary), and first-seen wins, so a historical job hides the current one's qualifier and date.
// Team's Claude owns the fix. Not wired into npm scripts or init.sh (lane may not edit init.sh; window close wires it).
import assert from "node:assert/strict";
import test from "node:test";
import { groupFanMemory } from "../../lib/onlyfans-preview/fan-memory-groups";
import type { FanContextFact } from "../../lib/onlyfans-preview/types";

const fact = (label: string, value: string): FanContextFact => ({ label, value, source: "imported" });
function items(facts: FanContextFact[], group: string) {
  const found = groupFanMemory(facts).groups.find(g => g.id === group);
  assert.ok(found, `memory group ${group} missing`);
  return found.items;
}

test("control: the same fact twice (same label and value) shows once", () => {
  const shown = items([fact("Likes", "Feet"), fact("Likes", "feet")], "preferences");
  assert.equal(shown.length, 1);
  assert.equal(shown[0].label, "Likes");
});

test("F4: a boundary with the same value as a like stays visible", () => {
  const labels = items([fact("Likes", "Feet"), fact("Boundaries", "feet")], "preferences").map(i => i.label);
  assert.ok(labels.includes("Boundaries"), `boundary hidden; shown: ${JSON.stringify(labels)}`);
  assert.ok(labels.includes("Likes"), `like hidden; shown: ${JSON.stringify(labels)}`);
});

test("F4: a duplicated job keeps the current qualifier and newest date, not the historical one", () => {
  const work = items([fact("Saved profile", "Job: nurse (historical, 2025-03-01). Occupation: nurse (current, 2026-10-20).")], "work");
  assert.ok(work.length >= 1, "the job must be shown");
  const newest = work.map(i => i.learnedAt ?? "").sort().at(-1);
  assert.equal(newest, "2026-10-20", `newest date dropped: ${JSON.stringify(work)}`);
  assert.ok(work.some(i => i.qualifier === "current"), `current qualifier dropped: ${JSON.stringify(work)}`);
});
