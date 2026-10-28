"use client";
import { useState } from "react";
import { parseNativeReadiness } from "@/lib/onlyfans/launch/native";
import { bFetch } from "@/lib/onlyfans/launch/b-common";
import {
  Section,
  StateLine,
  buttonClass,
  useCanManage,
  useLaunchResource,
  when,
} from "../a-shared";
const names: Record<string, string> = {
  schema: "Database schema",
  connection: "Current connection and creator binding",
  worker: "API and worker health",
  recentIntake: "Recent message intake",
  archive: "Provider archive recovery",
  memory: "Memory processing of stored messages",
  ledger: "Purchase ledger",
  model: "Selected model",
  credential: "Usable model credential",
  budget: "Daily model budget",
  personality: "Approved current personality",
  deliveryPolicy: "Outgoing delivery policy",
  catalogue: "Approved usable catalogue",
  engagement: "Proactive engagement",
};
const destinations: Record<string, { label: string; href: string }> = {
  connection: { label: "Open connections", href: "/onlyfans/settings" },
  worker_status: { label: "Open service status", href: "/onlyfans/settings" },
  history_memory: {
    label: "Open history and memory",
    href: "/onlyfans/launch/memory",
  },
  connection_credentials: {
    label: "Review credentials",
    href: "/onlyfans/settings",
  },
  delivery_policy: {
    label: "Review outgoing policy",
    href: "/onlyfans/settings",
  },
  catalogue: { label: "Review catalogue", href: "/onlyfans/content" },
  engagement: {
    label: "Review engagement",
    href: "/onlyfans/launch/automation",
  },
};
export default function ReadinessScreen({
  accountId,
  onGo,
}: {
  accountId: string;
  onGo: (screen: string) => void;
}) {
  const r = useLaunchResource(accountId, "readiness", parseNativeReadiness),
    manage = useCanManage(accountId),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function backfill() {
    if (busy || !manage) return;
    setBusy(true);
    const q = await bFetch(
      `/api/onlyfans-launch/memory/accounts/${encodeURIComponent(accountId)}/backfill`,
      { method: "POST", body: {} },
    );
    setBusy(false);
    setNotice(
      q.kind === "ok"
        ? "Recovery was requested. Progress is read below; the request does not mean recovery is complete."
        : "error" in q
          ? q.error
          : "Recovery request was not confirmed.",
    );
    r.reload();
  }
  return (
    <div className="space-y-4">
      <Section title="Account launch readiness">
        <StateLine state={r.state} retry={r.reload} label={r.attempt > 1 ? "account readiness (retry)" : "account readiness"} />
        <p className="text-xs text-muted">Account {accountId}. Last successful check: {r.lastSuccess ? when(r.lastSuccess.checkedAt) : "No successful check in this session"}. {r.state.kind === "loading" ? "Check in progress; sending permission is unchanged." : r.state.kind !== "ok" ? "Current readiness is unverified." : ""}</p>
        {r.state.kind === "pending" ? (
          <p role="alert" className="text-sm">
            {r.state.error}
            <button className={buttonClass} onClick={r.reload}>
              Retry
            </button>
          </p>
        ) : null}
        {r.state.kind === "ok" ? (
          <>
            <p className="text-sm">
              Observed {when(r.state.data.observedAt)}. Schema{" "}
              {r.state.data.schemaRevision}.{" "}
              {r.state.data.readyToEnable
                ? "Blocking prerequisites are ready."
                : "Blocking prerequisites require attention."}
            </p>
            <ul className="space-y-2">
              {r.state.data.checks.map((c) => {
                const link = c.action ? destinations[c.action] : undefined;
                return (
                  <li
                    key={c.key}
                    data-blocker={c.key}
                    className="rounded-lg border border-line p-3"
                  >
                    <p className="font-semibold">
                      {names[c.key] ?? c.key}: {c.status}
                      {c.blocking ? " (required)" : " (progress/capability)"}
                    </p>
                    <p className="text-xs text-muted">
                      Observed {when(c.observedAt)}
                    </p>
                    {c.blocker ? (
                      <p className="text-sm">
                        {c.blocker.replaceAll("_", " ")}
                      </p>
                    ) : null}
                    {link ? (
                      <a
                        className={`${buttonClass} mt-2 inline-block`}
                        href={`${link.href}?account=${encodeURIComponent(accountId)}`}
                      >
                        {link.label}
                      </a>
                    ) : null}
                    {c.action === "history_backfill" ? (
                      <button
                        className={`${buttonClass} mt-2`}
                        disabled={!manage || busy}
                        onClick={() => void backfill()}
                      >
                        Request/resume history recovery
                      </button>
                    ) : null}
                    {["personality", "ai_configuration"].includes(
                      c.action ?? "",
                    ) ? (
                      <button
                        className={`${buttonClass} mt-2`}
                        onClick={() => onGo("personality")}
                      >
                        Review personality and AI
                      </button>
                    ) : null}
                    {c.action === "ledger" ? (
                      <button
                        className={`${buttonClass} mt-2`}
                        onClick={() => onGo("purchases")}
                      >
                        Inspect purchase ledger
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <p role="status" className="text-sm">
              {notice}
            </p>
          </>
        ) : null}
      </Section>
      {r.state.kind === "ok" ? (
        <>
          <Section title="Coverage">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt>Stored messages</dt>
              <dd>{r.state.data.coverage.storedMessages}</dd>
              <dt>Stored messages processed into memory</dt>
              <dd>{r.state.data.coverage.processedMessages ?? "Full count unverified"}</dd>
              {r.state.data.coverage.memorySample && !r.state.data.coverage.memorySample.complete ? <>
                <dt>Bounded memory evidence</dt><dd>{r.state.data.coverage.memorySample.processedCurrentMessages} current receipts in {r.state.data.coverage.memorySample.inspectedMessages} inspected stored messages. This does not establish full coverage.</dd>
              </> : null}
              <dt>Provider history total</dt>
              <dd>Unknown</dd>
              <dt>Available archive recovery</dt>
              <dd>
                {r.state.data.coverage.archiveComplete
                  ? "Complete"
                  : "Still running or not started"}
              </dd>
              <dt>Pending archive conversations</dt>
              <dd>{r.state.data.coverage.pendingArchiveConversations}</dd>
              <dt>Usable inspected catalogue items</dt>
              <dd>
                {r.state.data.catalogue.usableInspectedItems} of{" "}
                {r.state.data.catalogue.inspectedItems}
                {r.state.data.catalogue.hasMore ? ", more items remain" : ""}
              </dd>
            </dl>
          </Section>
          <Section title="Actual autonomous handling state">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt>Account runtime</dt>
              <dd>
                {r.state.data.autonomy.accountEnabled ? "Enabled" : "Stopped"}
              </dd>
              <dt>Outgoing policy</dt>
              <dd>
                {r.state.data.autonomy.deliveryEnabled ? "Enabled" : "Disabled"}
              </dd>
              <dt>Existing automated conversations</dt>
              <dd>{r.state.data.autonomy.existingAutomatedConversations}</dd>
              <dt>New conversations</dt>
              <dd>
                {r.state.data.autonomy.automateNewConversations
                  ? "Automatic handling on"
                  : "Off (locked): enable each fan individually"}
              </dd>
              <dt>Engagement settings</dt>
              <dd>
                {r.state.data.autonomy.engagementEnabled
                  ? "Enabled"
                  : "Disabled"}
              </dd>
              <dt>Worker capabilities</dt>
              <dd>
                {Object.entries(r.state.data.autonomy.workerCapabilities)
                  .map(([k, v]) => `${k}: ${v ? "on" : "off"}`)
                  .join(", ") || "Not observed"}
              </dd>
              <dt>Unresolved outgoing operations</dt>
              <dd>{r.state.data.accountControl.unresolvedOutgoing}</dd>
            </dl>
            <a
              className={`${buttonClass} inline-block`}
              href={`/onlyfans/launch/automation?account=${encodeURIComponent(accountId)}`}
            >
              Open account controls
            </a>
          </Section>
          <Section title="Supported capability limits">
            <ul className="list-disc pl-5 text-sm">
              {r.state.data.limits.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </Section>
        </>
      ) : null}
    </div>
  );
}
