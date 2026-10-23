/** Account-readiness checklist composed from real reads only. A read that fails is "unknown", never "ok". */
import { ok, upstream, type Ans, type Env } from "./upstream";
import { parseLedger, LEDGER_SCHEMA } from "./ledger";
import { parsePersonality, PERSONALITY_VERSION } from "./personality";
import { parseRecovery } from "./memory";
import { parseSettings } from "./engagement";

export type Status = "ok" | "warn" | "blocked" | "unknown";
export type Blocker = { id: string; area: string; status: Status; title: string; detail: string; evidence: string | null; action: { label: string; href: string } | null };
export type WorkspaceSettings = { providerConnectionVerified: boolean; historyRecoveryRequired: boolean; runtimeEnabled: boolean;
  deliveryPolicy: { enabled: boolean } | null } | null;
const unknown = (id: string, area: string, title: string): Blocker => ({ id, area, status: "unknown", title, detail: "This could not be read right now, so it is not shown as ready.", evidence: null, action: null });

export async function composeReadiness(env: Env, readSettings: () => Promise<WorkspaceSettings>, now: () => Date = () => new Date()): Promise<Ans> {
  const a = env.accountId;
  const [settings, ledger, personality, history, engagement] = await Promise.all([
    readSettings().catch(() => null),
    upstream(env.fetch, "read", a, "/ledger", { expectSchema: LEDGER_SCHEMA }),
    upstream(env.fetch, "configuration", a, "/personality"),
    upstream(env.fetch, "configuration", a, "/history-memory/progress"),
    upstream(env.fetch, "configuration", a, "/engagement")]);
  const out: Blocker[] = [];

  out.push(!settings ? unknown("connection", "Connection", "OnlyFans connection") : settings.providerConnectionVerified
    ? { id: "connection", area: "Connection", status: "ok", title: "OnlyFans connection verified", detail: "The saved connection was verified.", evidence: "Account settings read", action: null }
    : { id: "connection", area: "Connection", status: "blocked", title: "OnlyFans connection is not verified", detail: "Nothing can be read or sent until the connection is verified.", evidence: "Account settings read",
        action: { label: "Open accounts", href: "/onlyfans/accounts" } });

  const rec = history.ok ? parseRecovery(history.body.progress, a, null) : null;
  out.push(!rec ? unknown("history", "History", "Chat history recovery") : rec.status === "complete" && !rec.recentRecoveryNeeded && !(settings?.historyRecoveryRequired)
    ? { id: "history", area: "History", status: "ok", title: "Chat history recovered", detail: `${rec.conversationsComplete} of ${rec.conversationsDiscovered} conversations complete.`, evidence: "History progress read", action: null }
    : { id: "history", area: "History", status: "warn", title: "Chat history recovery is not complete", detail: `${rec.conversationsComplete} of ${rec.conversationsDiscovered} conversations complete${rec.conversationsRetrying ? `, ${rec.conversationsRetrying} retrying` : ""}. Replies and offers wait for it.`,
        evidence: "History progress read", action: { label: "Open memory", href: "/onlyfans/launch/memory" } });

  const led = ledger.ok ? parseLedger(ledger.body, a) : null;
  if (!led) out.push(unknown("ledger", "Purchases", "Purchase reconciliation"));
  else {
    const bad = led.status === "held" || led.requiresInvestigation || led.commerceHeld;
    out.push({ id: "ledger", area: "Purchases", evidence: "Ledger status read", action: { label: "Open purchases", href: "/onlyfans/launch" },
      status: bad ? "blocked" : led.lastCompleteAt && led.status !== "not_started" ? "ok" : "warn",
      title: bad ? "Purchase reconciliation needs attention" : led.lastCompleteAt ? "Purchases reconciled" : "Purchase reconciliation has not completed yet",
      detail: led.commerceHeld ? "Sales are on hold until ownership is reconciled." : led.status === "held" ? "The ledger scan is held." : led.requiresInvestigation ? "There are conflicts or unlinked paid purchases to investigate."
        : led.lastCompleteAt ? "The last ledger pass completed." : "No ledger pass has completed." });
  }

  const p = personality.ok && personality.body.personalityVersion === PERSONALITY_VERSION ? parsePersonality(personality.body.personality) : null;
  if (!p) out.push(unknown("personality", "AI", "Personality and model"));
  else {
    const r = p.readiness;
    out.push(p.state === "approved" && r?.ready === true && p.configurationCurrent === true
      ? { id: "personality", area: "AI", status: "ok", title: "Personality approved and model ready", detail: "Approved personality, a usable credential and a positive budget were confirmed by the backend.", evidence: "Personality readiness read", action: null }
      : { id: "personality", area: "AI", status: "blocked", title: p.state === "empty" ? "No personality has been imported" : p.state === "draft" ? "Personality is a draft, not approved" : "AI is not ready",
          detail: r ? (r.blockers.length ? r.blockers.join("; ") : "The backend does not report this account ready.") : "Import the history draft, review it, then approve it.", evidence: "Personality readiness read",
          action: { label: "Open personality", href: "/onlyfans/launch" } });
  }

  out.push(!settings ? unknown("delivery", "Sending", "Outgoing messages") : settings.runtimeEnabled && settings.deliveryPolicy?.enabled
    ? { id: "delivery", area: "Sending", status: "ok", title: "Outgoing messages are on", detail: "The account runtime and delivery policy are enabled.", evidence: "Account settings read", action: null }
    : { id: "delivery", area: "Sending", status: "warn", title: "Outgoing messages are off", detail: "No reply or message is sent until the account is activated by the operator.", evidence: "Account settings read", action: { label: "Open accounts", href: "/onlyfans/accounts" } });

  const eng = engagement.ok ? parseSettings(engagement.body) : null;
  out.push(!eng ? unknown("engagement", "Automation", "Proactive messages") : { id: "engagement", area: "Automation", status: "ok", title: eng.settings.enabled ? "Proactive messages are on" : "Proactive messages are off",
    detail: eng.settings.enabled ? "Scheduled offers, follow-ups and re-engagement may be sent within the saved limits." : "No scheduled proactive message will be created.", evidence: "Engagement settings read", action: { label: "Open automation", href: "/onlyfans/launch/automation" } });

  return ok(a, { asOf: now().toISOString(), blockers: out });
}
