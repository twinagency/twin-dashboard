import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { withDashboardAccess } from "../lib/dashboard-access";
import { guardDashboardAction } from "../lib/agency-management";
import { scopeAgencyWrite, AGENCY_PROTECTED_CLONE_FIELDS } from "../lib/agency-write";
import * as agencyWrite from "../lib/agency-write";
import { TOP_ONLYFANS_AGENCY } from "../lib/partner-portals";
import * as cloneDefaultPolicy from "../lib/clone-default-policy";

const assigned = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const manager = { ...TOP_ONLYFANS_AGENCY, cloneIds: [assigned], canManage: true };
const writes: Record<string, unknown>[] = [];
let compiles = 0;
const db = { from(table: string) {
  assert.equal(table, "clones");
  return { update(row: Record<string, unknown>) { return { async eq(key: string, id: string) {
    assert.equal(key, "id");
    const access = await import("../lib/dashboard-access").then(m => m.getDashboardAccess());
    if (access) await scopeAgencyWrite(new URL("https://offline.supabase.co/rest/v1/clones?id=eq." + id), "PATCH", row, access);
    writes.push(row);
    return { error: null };
  } }; } };
} };
const source = readFileSync("app/clones/actions.ts", "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports: Record<string, any> = {};
new Function("require", "exports", output)((name: string) => {
  if (name === "@/lib/agency-management") return { guardDashboardAction };
  if (name === "@/lib/dashboard-access") return { getDashboardAccess: async () => import("../lib/dashboard-access").then(m => m.getDashboardAccess()) };
  if (name === "@/lib/agency-write") return agencyWrite;
  if (name === "@/lib/supabase") return { supabaseAdmin: db };
  if (name === "@/lib/compiler") return { compileClone: async () => { compiles++; } };
  if (name === "next/cache") return { revalidatePath() {} };
  if (name === "@/lib/query-cache") return { invalidateCloneCaches: async () => {} };
  if (name === "@/lib/intake") return { INTAKE_FIELD_KEYS: [], assembleAnswers: () => "saved identity" };
  if (name === "@/lib/vibes") return { vibePresetFor: () => null };
  if (name === "@/app/settings/actions") return { getCloneDefaults: async () => ({}) };
  if (name === "./toggle-fields") return {};
  if (name === "@/lib/clone-default-policy") return cloneDefaultPolicy; // pure bounds, real module
  throw new Error("Unexpected action import: " + name);
}, exports);

function form() {
  const fd = new FormData();
  for (const [key, value] of Object.entries({
    name: "Assigned creator", status: "active", persona_facts: "1", known_for: "Fitness",
    dashboard_chart_color: "#4a8ec4", ai_mode: "smart", photos_enabled: "true",
    video_sequences_enabled: "true", sell_via_mini_app: "true",
    bot_token: "protected-placeholder", elevenlabs_api_key: "protected-placeholder",
    account_phone: "protected-placeholder", strict_minor_gate: "false", photo_vision_model: "protected-model"
  })) fd.set(key, value);
  return fd;
}
async function main() {
  await withDashboardAccess(manager, () => exports.updateClone(assigned, form()));
  assert.equal(writes.length, 1);
  assert.equal(compiles, 1);
  const row = writes[0];
  assert.equal(row.known_for, "Fitness");
  assert.equal(row.video_sequences_enabled, true);
  assert.equal(row.sell_via_mini_app, true);
  for (const field of [...AGENCY_PROTECTED_CLONE_FIELDS, "elevenlabs_api_key", "account_phone"]) assert.ok(!(field in row), "Protected field submitted: " + field);
  const before = writes.length;
  await withDashboardAccess(manager, () => assert.rejects(exports.updateClone(other, form()), /Creator access denied/));
  await withDashboardAccess({ ...manager, canManage: false }, () => assert.rejects(exports.updateClone(assigned, form()), /Read-only/));
  assert.equal(writes.length, before);
  const badImage = form(); badImage.set("dashboard_profile_image_path", other + "/profile/a.jpg");
  await withDashboardAccess(manager, () => assert.rejects(exports.updateClone(assigned, badImage), /Creator access denied/));
  for (const field of ["bot_token", "elevenlabs_api_key", "account_phone", "strict_minor_gate", "unexpected_field"]) {
    await assert.rejects(scopeAgencyWrite(new URL("https://offline.supabase.co/rest/v1/clones?id=eq." + assigned), "PATCH", { [field]: "injected" }, manager), /Unsupported agency field/);
  }
  const adminForm = form(); adminForm.delete("bot_token");
  await withDashboardAccess(null, () => exports.updateClone(assigned, adminForm));
  assert.equal(writes.at(-1)?.elevenlabs_api_key, "protected-placeholder", "Internal operator save must retain its existing fields");
  assert.equal(writes.at(-1)?.account_phone, "protected-placeholder");
  console.log("Agency full-form save, identity persistence payload, feature flags, protected fields, assigned scope, read-only refusal, media ownership and internal operator save passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
