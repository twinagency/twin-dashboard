import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseActivationStatus, type ActivationStatus } from "../lib/onlyfans/activation-status";
import { enableExistingChats } from "../lib/onlyfans/activation-client";

const fp = "a".repeat(64);
const stage = (state: string, code: string | null = null, reason: string | null = null, action: string | null = null, extra = {}) => ({ state, code, reason, action, ...extra });
const counts = { alreadyOn: 2, noContact: 3, humanTakeover: 4, askedForPerson: 1, pausedByStaff: 5, muted: 1, restricted: 1, unresolvedDelivery: 1, outsideScope: 0, wouldEnable: 40, total: 58 };
const base = (): ActivationStatus => ({
  statusVersion: "of-activation-status.v1", accountId: "of-1", observedAt: "2026-10-30T00:00:00Z", activated: true, ready: false, fingerprint: fp,
  stages: { connection: stage("ok", null, null, null, { revision: 4 }), model: stage("blocked", "model_credential_missing", "This account has no model API key saved. Add its own key and model.", "model_credential", { modelId: "m" }),
    runtime: stage("blocked", "sender_held_catalogue", "The sender is held: No enabled fixed-price paid item with vault media is approved yet.", "content"),
    replies: stage("blocked", "allowance_exhausted", "The send allowance is used up (500 of 500). Raise the total allowance to continue.", "limits") },
  allowance: { limitUnits: 500, usedUnits: 500, remainingUnits: 0, throttleSeconds: 20, mediaEnabled: true, state: "exhausted" },
  budget: { dailyCostCapCents: 500, spentTodayUnits: 49993, capUnits: 50000, state: "exhausted", flag: "Today's model budget is spent.", resetsAt: null,
    spendByPurpose: [{ purpose: "gen_info", label: "Fan memory learner", units: 43000, share: 0.88 }, { purpose: "ai_chatter", label: "Chat replies", units: 300, share: 0.01 }] },
  provider: { creditErrors24h: 2850, lastCreditErrorAt: "2026-10-29T16:04:00Z", creditErrorsRecent: true, rejectedKey24h: 0, rateLimited24h: 0 },
  recentFailures: [{ reason: "model-budget-exhausted", count: 3, lastAt: null }],
  scope: { deploymentAllowed: true, allFansAllowed: true, selectionValid: true, selection: null, pilotFanOverride: ["318022380"] },
  conversations: { total: 58, enabledNow: 2, paused: 45, notYetEnabled: 40, pausedByStaff: 5, noContact: 3, humanControlled: 4, takeoverRequested: 1, needsPerson: 1, unresolvedDelivery: 1 },
  escalations: { needsPerson: 1, takeoverRequested: 1, humanControlled: 4, unresolvedDelivery: 1, recent: [{ fanId: "5001", at: null }] },
  futureConversations: { enabled: false, startsAt: null, default: false },
  warnings: [{ code: "pilot_fan_override", text: "A temporary single-fan history override is set for 1 fan(s) on this deployment." }],
  bulkEnable: { counts, blockers: [], scopeMode: "all" },
} as unknown as ActivationStatus);

async function main() {
  // Match Next's automatic JSX boundary in this offline renderer.
  (globalThis as unknown as { React: typeof React }).React = React;
  const { default: ActivationPanel } = await import("../components/onlyfans-preview/ActivationPanel");
  // The strict parser accepts the backend shape and refuses anything that could mislead.
  assert.ok(parseActivationStatus(base(), "of-1"));
  assert.equal(parseActivationStatus(base(), "of-2"), null, "other account");
  assert.equal(parseActivationStatus({ ...base(), fingerprint: "xyz" }, "of-1"), null);
  assert.equal(parseActivationStatus({ ...base(), futureConversations: { enabled: true, startsAt: null, default: true } }, "of-1"), null, "default must be off");
  assert.equal(parseActivationStatus({ ...base(), provider: { creditErrors24h: "x" } }, "of-1"), null, "malformed optional blocks are refused");
  const missing = base() as any; delete missing.stages.runtime;
  assert.equal(parseActivationStatus(missing, "of-1"), null);

  // The panel names each stage and the exact reason, and shows allowance, budget, takeovers and escalations.
  const html = renderToStaticMarkup(<ActivationPanel accountId="of-1" creatorName="Creator" initial={{ status: base(), canManage: true }} />);
  for (const needle of ["Connected to OnlyFans", "AI model usable", "Sender running", "Conversations can receive replies",
    "has no model API key saved", "fixed-price paid item", "allowance is used up", "500 of 500 used", "499.9 of 500 cents",
    "Fan memory learner 88%", "Chat replies 1%", "2850 refused for lack of credit", "model-budget-exhausted x3", "Paused, not yet enabled", "Asked for a person", "Human takeover", "No-contact", "temporary single-fan history override"]) assert.ok(html.includes(needle), "missing: " + needle);
  assert.ok(/data-of-stage="model" data-of-stage-state="blocked"/.test(html) && /data-of-stage="connection" data-of-stage-state="ok"/.test(html));
  assert.ok(/data-of-future-conversations(?![^>]*checked)/.test(html), "future conversations default off");
  assert.ok(html.includes("Would enable 40 of 58 chats") && html.includes("4 human takeover (kept)") && html.includes("3 no-contact (kept)"), "preview shows what is kept");
  assert.ok(html.includes("Save key") && html.includes("Operating limits"));
  assert.ok(!/[—–]/.test(html), "no em or en dashes in UI copy");

  // Blockers disable the bulk button and are named; a read-only member sees no controls.
  const blocked = base(); blocked.bulkEnable = { counts, blockers: ["model_credential_missing"], scopeMode: "all" };
  const blockedHtml = renderToStaticMarkup(<ActivationPanel accountId="of-1" creatorName="Creator" initial={{ status: blocked, canManage: true }} />);
  assert.ok(/<button[^>]*disabled=""[^>]*>Enable AI replies for existing chats/.test(blockedHtml) && blockedHtml.includes("Not ready: This account has no model API key saved."));
  const notActivated = base(); notActivated.activated = false;
  assert.ok(renderToStaticMarkup(<ActivationPanel accountId="of-1" creatorName="Creator" initial={{ status: notActivated, canManage: true }} />).includes("Activate account"));
  const readOnly = renderToStaticMarkup(<ActivationPanel accountId="of-1" creatorName="Creator" initial={{ status: base(), canManage: false }} />);
  assert.ok(readOnly.includes("read-only") && !readOnly.includes("Save key") && !readOnly.includes("Enable AI replies for existing chats"));

  // Batches carry one run id and the cursor, retry an unconfirmed batch identically, and surface refusals with their codes.
  const calls: any[] = [];
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const fetchOk: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)); calls.push(body);
    if (calls.length === 2 && calls.filter(c => c.afterFan === body.afterFan).length === 1) return reply({}, 502); // lost reply: unconfirmed
    return body.afterFan === "0" ? reply({ ok: true, command: { enabled: 3, checked: 3, skipped: { muted: 1 }, done: false, nextAfterFan: "2002", commandKey: "k" } })
      : reply({ ok: true, command: { enabled: 2, checked: 4, skipped: { restricted: 1, muted: 1 }, done: true, nextAfterFan: null, commandKey: "k" } });
  };
  const seen: number[] = [];
  const done = await enableExistingChats({ accountId: "of-1", fingerprint: fp, fetchImpl: fetchOk, runId: "r".repeat(64), progress: p => seen.push(p.enabled) });
  assert.deepEqual([done.enabled, done.checked, done.done, done.skipped], [5, 7, true, { muted: 2, restricted: 1 }]);
  assert.ok(calls.every(c => c.runId === "r".repeat(64) && c.expectedFingerprint === fp));
  assert.deepEqual(calls.map(c => c.afterFan), ["0", "2002", "2002"], "unconfirmed batch is retried with the identical cursor");
  const refusal: typeof fetch = async () => reply({ ok: false, code: "prerequisites_unmet", blockers: ["account_not_activated"], error: "Not ready." }, 409);
  await assert.rejects(enableExistingChats({ accountId: "of-1", fingerprint: fp, fetchImpl: refusal }), (e: any) => e.code === "prerequisites_unmet" && e.blockers[0] === "account_not_activated");
  const stuck: typeof fetch = async () => reply({ ok: true, command: { enabled: 0, checked: 1, skipped: {}, done: false, nextAfterFan: "0", commandKey: "k" } });
  await assert.rejects(enableExistingChats({ accountId: "of-1", fingerprint: fp, fetchImpl: stuck }), /cursor/);
  await assert.rejects(enableExistingChats({ accountId: "of-1", fingerprint: fp, fetchImpl: fetchOk, cancelled: () => true }), /Stopped/);
  console.log("PASS activation panel: strict status parsing, stage reasons, defaults off, kept-state preview, blocker gating, read-only view and resumable idempotent batches.");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
