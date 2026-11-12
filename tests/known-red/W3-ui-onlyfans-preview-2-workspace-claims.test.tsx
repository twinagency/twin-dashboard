// KNOWN RED (W3 ui-onlyfans-preview-2 P10/P23, NativeWorkspaceView.tsx):
//   P10 :40-41 false success: "Your account history is synced." whenever historyRecoveryRequired is false, even with
//       lastCompleteSyncAt null (the next line then says "Last synced: Not recorded").
//   P23 :48 the Account tab renders WorkspaceBody without settingsSection, so it repeats the persona / reply-settings cards.
// P22 (NativeWorkspace.tsx:24-26 bypassing readAccounts) is not tested here, see the findings file.
// Team's Claude owns the fixes. Offline: jsdom, fetch stubbed, synthetic ids.
import { click, inNextApp, json, mount, stubFetch } from "../helpers/w3-preview2-dom";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import NativeWorkspaceView from "../../components/onlyfans-preview/NativeWorkspaceView";
import type { SettingsRead } from "../../lib/onlyfans/workspace";
import { liveAccount } from "../helpers/w3-preview2-fixtures";

const A = liveAccount("acct-ws-1");
const settings = (patch: Partial<SettingsRead> = {}): SettingsRead => ({ schemaVersion: "of-workspace.v2", section: "settings", accountId: A.accountId,
  asOf: "2026-10-17T09:00:00.000Z", lastCompleteSyncAt: null, historyRecoveryRequired: false, providerConnectionVerified: true, runtimeEnabled: true, deliveryPolicy: null,
  configuration: { personaExcerpt: "Synthetic persona excerpt.", personaTruncated: false, creatorFacts: [], language: null, savedDefaultModel: null, savedReplyModelOverride: null,
    dailyModelCapCents: 500, salesPermissions: { pack_send_enabled: null, pack_on_ask_enabled: null, qualification_gate_enabled: null }, issues: [] }, ...patch });
const show = (data: SettingsRead) => mount(inNextApp(<NativeWorkspaceView section="settings" account={A} accounts={[A]} data={data} creatorId={null} cursor={null}
  contentConfigured={false} configurationConfigured={false} canManage={false} agency={false} />, undefined, "/onlyfans/settings"));
const summary = () => document.querySelector("[data-of-native-freshness] summary")?.textContent ?? "";
const panel = (value: string) => document.querySelector(`[id$="-panel-${value}"]`);

beforeEach(() => { stubFetch(() => json({ ok: false }, 404)); });

// ---- P10 ----
/** Any wording that says the history is synced / up to date / in sync, unless the same line negates it. */
const claimsSynced = (line: string) => /\b(synced|synchroni[sz]ed|up[ -]to[ -]date|in sync|current)\b/i.test(line) && !/\b(not|never|unknown|no)\b/i.test(line);
test("control: with a recorded lastCompleteSyncAt the history line may say synced", async () => {
  await show(settings({ lastCompleteSyncAt: "2026-10-17T08:00:00.000Z" }));
  assert.equal(claimsSynced(summary()), true, `summary today: ${JSON.stringify(summary())}`);
});

test("P10: lastCompleteSyncAt null never claims the history is synced", async () => {
  await show(settings({ lastCompleteSyncAt: null }));
  assert.match(document.querySelector("[data-of-native-freshness]")?.textContent ?? "", /Last synced: Not recorded/);
  assert.equal(claimsSynced(summary()), false, `summary ${JSON.stringify(summary())} claims a sync that is not recorded`);
});

// ---- P23 ----
test("control: Personality tab shows the persona card", async () => {
  await show(settings());
  assert.match(panel("personality")?.textContent ?? "", /Creator persona/);
});

test("P23: Account tab shows account details only, no persona or reply-settings cards", async () => {
  await show(settings());
  await click([...document.querySelectorAll('[role="tab"]')].find(tab => tab.textContent === "Account"));
  const account = panel("account");
  assert.ok(account && !account.hasAttribute("hidden"), "Account panel is the visible one");
  const text = account?.textContent ?? "";
  assert.match(text, /Account details/);
  const repeated = ["Creator persona", "Saved model and language", "Saved on-request sales permissions"].filter(title => text.includes(title));
  assert.deepEqual(repeated, [], "Account tab repeats Personality / Reply settings cards");
});
