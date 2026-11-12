/**
 * Known red (W5 app-actions-plus5 F4, REVIEW inv 5 "a clone or creator is a DB row"): lane files carry per-creator
 * and per-agency ids as code. app/agency/creators/page.tsx:16-23 hard-codes two Moxy creator account ids and two clone
 * ids (with names) behind isMoxy(); app/agency-admin/lynq-password/update/route.ts:15 hard-codes an agency id and a
 * user id. RISKS D12 covers only lib moxy.ts. Control: the generic team/link routes carry no id literal (holds).
 * Turns green when visibility/target is data (a column or the membership row), not a literal. Source grep only:
 * moving the literals to another file also turns it green, which does NOT close F4.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const literals = (file: string) =>
  (readFileSync(new URL(`../../${file}`, import.meta.url), "utf8").match(UUID) ?? []).filter((u) => !/^0{8}-/.test(u));

test("control: generic agency routes carry no id literal", () => {
  assert.deepEqual(literals("app/agency/team/manage/route.ts"), []);
  assert.deepEqual(literals("app/agency/creators/link/route.ts"), []);
});

test("agency creators page has no hard-coded creator or clone ids", () => {
  assert.deepEqual(literals("app/agency/creators/page.tsx"), []);
});

test("partner password route has no hard-coded agency or user id", () => {
  assert.deepEqual(literals("app/agency-admin/lynq-password/update/route.ts"), []);
});
