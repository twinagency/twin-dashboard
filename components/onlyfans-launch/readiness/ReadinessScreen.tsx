"use client";
import { parseReadiness, type Blocker } from "@/lib/onlyfans/launch/a-types";
import { Section, StateLine, StatusPill, Unavailable, buttonClass, useLaunchResource, when } from "../a-shared";

function Row({ b }: { b: Blocker }) {
  return <li data-blocker={b.id} className="rounded-lg border border-line p-3">
    <div className="flex flex-wrap items-center gap-2"><StatusPill status={b.status} /><span className="text-xs uppercase tracking-wide text-muted">{b.area}</span></div>
    <div className="mt-1 text-sm font-semibold text-ink">{b.title}</div>
    <p className="mt-1 text-xs leading-5 text-muted">{b.detail}</p>
    {b.evidence ? <p className="mt-1 text-xs text-muted">Evidence: {b.evidence}</p> : null}
    {b.action ? <a className={`${buttonClass} mt-2 inline-flex items-center`} href={b.action.href}>{b.action.label}</a> : null}
  </li>;
}

/** The checklist is composed on the server from real reads. Each row names its evidence; an unreadable source is "Not verified". */
export default function ReadinessScreen({ accountId }: { accountId: string; onGo?: (screen: string) => void }) {
  const full = useLaunchResource(accountId, "readiness", parseReadiness);
  const rows = full.state.kind === "ok" ? full.state.data.blockers : [];
  const notReady = rows.filter(b => b.status !== "ok").length;
  return <div className="space-y-4">
    <Section title="Account readiness" id="full-readiness">
      <StateLine state={full.state} retry={full.reload} label="account readiness" />
      {full.state.kind === "unavailable" ? <Unavailable screen="Readiness" error={full.state.error} /> : null}
      {full.state.kind === "ok" ? <>
        <p className="text-xs text-muted">As of {when(full.state.data.asOf)}. {notReady ? `${notReady} item${notReady === 1 ? "" : "s"} not ready or not verified.` : "Every listed check passed."} This list does not turn anything on.</p>
        {rows.length ? <ul className="space-y-2">{rows.map(b => <Row key={b.id} b={b} />)}</ul>
          : <p data-launch-state="empty" className="text-sm text-muted">The backend listed no checks. Treat this as not verified.</p>}
        <button type="button" className={buttonClass} onClick={full.reload}>Re-check now</button></> : null}
    </Section>
  </div>;
}
