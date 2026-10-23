"use client";
import { useCallback, useState } from "react";
import { FIXTURES } from "@/lib/onlyfans/launch/a-fixtures";
import { parseReadiness, WIRING, type Blocker } from "@/lib/onlyfans/launch/a-types";
import { parseConfiguration } from "@/lib/onlyfans/configuration";
import { FixtureBanner, Pending, Section, StateLine, StatusPill, buttonClass, useJsonResource, useLaunchResource, when } from "../a-shared";

type LiveAccount = { health: string; healthReason: string | null; sendOk: boolean | null; automationMode: string };
const parseAccount = (accountId: string) => (v: unknown): LiveAccount | null => {
  const a = (v as { accounts?: unknown[] } | null)?.accounts;
  const x = Array.isArray(a) ? a.find(i => (i as { accountId?: string })?.accountId === accountId) as Record<string, unknown> | undefined : undefined;
  if (!x || typeof x.health !== "string") return null;
  const caps = x.capabilities as Record<string, unknown> | undefined;
  return { health: x.health, healthReason: typeof x.healthReason === "string" ? x.healthReason : null,
    sendOk: caps && typeof caps.sendManualMessage === "string" ? caps.sendManualMessage === "available" : null, automationMode: String(x.automationMode) };
};

function Row({ b, onGo }: { b: Blocker; onGo: (screen: string) => void }) {
  return <li data-blocker={b.id} className="rounded-lg border border-line p-3">
    <div className="flex flex-wrap items-center gap-2"><StatusPill status={b.status} /><span className="text-xs uppercase tracking-wide text-muted">{b.area}</span></div>
    <div className="mt-1 text-sm font-semibold text-ink">{b.title}</div>
    <p className="mt-1 text-xs leading-5 text-muted">{b.detail}</p>
    {b.evidence ? <p className="mt-1 text-xs text-muted">Evidence: {b.evidence}</p> : null}
    {b.action ? b.action.kind === "link" && b.action.href
      ? <a className={`${buttonClass} mt-2 inline-flex items-center`} href={b.action.href}>{b.action.label}</a>
      : <button type="button" className={`${buttonClass} mt-2`} onClick={() => onGo(b.action!.command ?? "")}>{b.action.label}</button> : null}
  </li>;
}

export default function ReadinessScreen({ accountId, onGo }: { accountId: string; onGo: (screen: string) => void }) {
  const [fixture, setFixture] = useState(false);
  const full = useLaunchResource(accountId, "readiness", parseReadiness);
  const acct = useJsonResource(`/api/onlyfans/accounts?account=${encodeURIComponent(accountId)}`, useCallback(parseAccount(accountId), [accountId]), false);
  const cfg = useJsonResource(`/api/onlyfans-configuration/accounts/${encodeURIComponent(accountId)}`, useCallback((v: unknown) => parseConfiguration(v, accountId), [accountId]), false);

  const live: Blocker[] = [];
  if (acct.state.kind === "ok") {
    const a = acct.state.data, ok = a.health === "connected";
    live.push({ id: "live-connection", area: "Connection", status: ok ? "ok" : "blocked", title: ok ? "Connection reports connected" : `Connection is ${a.health.replace("_", " ")}`,
      detail: a.healthReason ?? (ok ? "The backend reports a healthy session. This is not proof that sends are authorised." : "Reconnect this account before anything else."), evidence: "accounts read", action: ok ? null : { label: "Open connections", kind: "link", href: "/onlyfans/settings" } });
    live.push({ id: "live-outgoing", area: "Outgoing permissions", status: a.sendOk === true ? "warn" : "blocked", title: a.sendOk === true ? "Manual send capability is advertised" : "Manual send is not available",
      detail: a.sendOk === true ? "Capability is available for staff. Automated outgoing authority is not confirmed by this read." : "The account does not advertise sending. No outgoing messages will be authorised.", evidence: `automation mode: ${a.automationMode}`, action: null });
  }
  if (cfg.state.kind === "ok") {
    const c = cfg.state.data, missing = [!c.persona && !c.personaTruncated ? "persona" : null, !c.defaultModel ? "default model" : null, !c.modelsValid ? "valid models" : null, !c.factsValid ? "valid facts" : null, !c.salesConfigurationValid ? "sales configuration" : null].filter(Boolean);
    live.push({ id: "live-ai", area: "AI configuration", status: missing.length ? "blocked" : "ok", title: missing.length ? `AI configuration incomplete: ${missing.join(", ")}` : "Persona, model and sales configuration are complete",
      detail: "Read from the configuration contract.", evidence: `configuration revision ${c.configurationRevision}`, action: { label: "Open personality and AI", kind: "command", command: "personality" } });
  }

  return <div className="space-y-4">
    <Section title="Live checks" id="live-checks">
      <p className="text-xs text-muted">Read now from the connected account and configuration contracts. {WIRING.readiness.note}</p>
      <StateLine state={acct.state} retry={acct.reload} label="account status" />
      <StateLine state={cfg.state} retry={cfg.reload} label="AI configuration" />
      {acct.state.kind === "pending" || cfg.state.kind === "pending" ? <p className="text-xs text-muted">A live source is not configured on this dashboard, so those rows are absent, not passing.</p> : null}
      {live.length ? <ul className="space-y-2">{live.map(b => <Row key={b.id} b={b} onGo={onGo} />)}</ul> : null}
    </Section>
    <Section title="Full launch readiness" id="full-readiness">
      <StateLine state={full.state} retry={full.reload} label="launch readiness" />
      {full.state.kind === "pending" && !fixture ? <Pending screen="Readiness" error={full.state.error} onFixture={() => setFixture(true)} /> : null}
      {full.state.kind === "ok" ? <><p className="text-xs text-muted">As of {when(full.state.data.asOf)}</p>
        {full.state.data.blockers.length ? <ul className="space-y-2">{full.state.data.blockers.map(b => <Row key={b.id} b={b} onGo={onGo} />)}</ul>
          : <p data-launch-state="empty" className="text-sm text-muted">The backend reported no blockers and no checks. Treat this as not verified until it lists its checks.</p>}</> : null}
      {full.state.kind === "pending" && fixture ? <>
        <FixtureBanner what="Blockers below repeat the read-only facts recorded on 23 Oct 2026, not a live read." />
        <ul className="space-y-2">{FIXTURES.readiness.blockers.map(b => <Row key={b.id} b={b} onGo={onGo} />)}</ul>
        <button type="button" className={buttonClass} onClick={() => setFixture(false)}>Hide sample</button></> : null}
    </Section>
  </div>;
}
