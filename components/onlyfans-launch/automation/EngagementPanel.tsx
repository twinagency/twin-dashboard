"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { bFetch, bTime } from "@/lib/onlyfans/launch/b-common";
import {
  object,
  parseEngagementAction,
  parseEngagementPage,
  parseEngagementSettings,
  POLICY_LIMITS,
  validPolicy,
  type EngagementAction,
  type EngagementPolicy,
  type EngagementSettings,
} from "@/lib/onlyfans/launch/native";
import {
  StateLine,
  buttonClass,
  dangerClass,
  useJsonResource,
} from "../a-shared";
const field =
  "min-h-11 w-full min-w-0 rounded-lg border border-line bg-white px-2 text-sm disabled:opacity-60";
const label = (s: string) => s.replaceAll("_", " ");
const settingsParser = (accountId: string) => (v: unknown) =>
  object(v) &&
  v.schemaVersion === "of-launch-b.v1" &&
  v.ok === true &&
  v.accountId === accountId
    ? parseEngagementSettings(v)
    : null;
const pageParser = (accountId: string) => (v: unknown) =>
  object(v) &&
  v.schemaVersion === "of-launch-b.v1" &&
  v.ok === true &&
  v.accountId === accountId
    ? parseEngagementPage(v)
    : null;
const FLAGS = ["enabled", "offers", "follow_ups", "reengagement"] as const;
/** A brake: every flag off, or against `saved` it turns at least one flag off and changes nothing else. An identical policy with a
 *  flag on is a go. Anything that is not a brake is held while `goHold` is set. */
function brakeOnly(next: EngagementPolicy, saved: EngagementPolicy | null) {
  if (FLAGS.every((f) => !next[f])) return true;
  if (saved === null) return false;
  const changed = (Object.keys(next) as (keyof EngagementPolicy)[]).filter((k) => next[k] !== saved[k]);
  return changed.length > 0 && changed.every((k) => (FLAGS as readonly string[]).includes(k) && next[k] === false);
}
function Settings({
  data,
  manage,
  goHold,
  submit,
}: {
  data: EngagementSettings;
  manage: boolean;
  goHold: string | null;
  submit: (command: {
    expectedRevision: number;
    settings: EngagementPolicy;
  }) => Promise<void>;
}) {
  const [p, setP] = useState<EngagementPolicy>(data.settings),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const held = goHold !== null && !brakeOnly(p, data.settings);
  async function save() {
    if (!manage || busy || !validPolicy(p) || held) return;
    setBusy(true);
    await submit({ expectedRevision: data.revision, settings: p });
    if (mounted.current) setBusy(false);
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Proactive engagement settings</h3>
      <p className="text-sm">
        Settings revision {data.revision}.{" "}
        {data.bindingCurrent
          ? "Current creator binding."
          : "Settings belong to a prior binding. Review and save before use."}
      </p>
      <fieldset disabled={!manage || busy} className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          {(["enabled", "offers", "follow_ups", "reengagement"] as const).map(
            (k) => (
              <label
                key={k}
                className="flex min-h-11 items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={p[k]}
                  onChange={(e) =>
                    setP((s) => ({ ...s, [k]: e.target.checked }))
                  }
                />
                {label(k)}
              </label>
            ),
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(POLICY_LIMITS).map(([k, [lo, hi]]) => (
            <label key={k} className="text-sm">
              {label(k)}
              <input
                className={field}
                type="number"
                min={lo}
                max={hi}
                step={1}
                value={p[k as keyof typeof POLICY_LIMITS]}
                onChange={(e) =>
                  setP((s) => ({
                    ...s,
                    [k]: e.target.value === "" ? NaN : Number(e.target.value),
                  }))
                }
              />
            </label>
          ))}
        </div>
        {(["follow_up_text", "reengage_text"] as const).map((k) => (
          <label key={k} className="block text-sm">
            {label(k)}
            <textarea
              aria-label={label(k)}
              className={`${field} min-h-20 p-2`}
              value={p[k]}
              maxLength={1000}
              onChange={(e) => setP((s) => ({ ...s, [k]: e.target.value }))}
            />
          </label>
        ))}
        <button
          className={buttonClass}
          disabled={!validPolicy(p) || held}
          onClick={() => void save()}
        >
          Save engagement settings
        </button>
        {held ? <span title={goHold ?? undefined} aria-label="Enabling engagement held" className="ml-2 cursor-help text-blue-700">ⓘ</span> : null}
      </fieldset>
      <p className="text-xs text-muted">
        Saved settings alone do not enable autonomous handling. Account
        controls, delivery authority, eligible content and worker flags still
        apply.
      </p>
      <p role="status" className="text-sm">
        {notice}
      </p>
    </div>
  );
}
function Action({
  a,
  manage,
  run,
  busy,
  onOpen,
}: {
  a: EngagementAction;
  manage: boolean;
  run: (id: string, action: "refresh" | "cancel") => void;
  busy: boolean;
  onOpen?: (id: string) => void;
}) {
  return (
    <li
      data-b-followup={a.status}
      className="rounded-lg border border-line p-3 text-sm"
    >
      <p className="font-semibold">
        Fan {a.fanId} · {label(a.kind)}
      </p>
      <p>
        {label(a.status)}
        {a.cancelRequested ? " · cancellation requested" : ""}
      </p>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3">
        <dt>Due</dt>
        <dd>{bTime(a.dueAt)}</dd>
        <dt>Expires</dt>
        <dd>{bTime(a.expiresAt)}</dd>
        <dt>Action</dt>
        <dd className="break-all">{a.actionId}</dd>
        <dt>Delivery intent</dt>
        <dd className="break-all">{a.intentId ?? "not queued"}</dd>
      </dl>
      {a.reason ? <p>{label(a.reason)}</p> : null}
      {["dispatching", "unknown"].includes(a.status) ? (
        <p className="mt-1">
          Delivery may already have started. A cancellation request cannot
          establish that nothing was sent.
        </p>
      ) : null}
      {a.status === "accepted" ? (
        <p className="mt-1">
          Transport accepted the message. This does not establish a purchase.
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {onOpen ? (
          <button className={buttonClass} onClick={() => onOpen(a.actionId)}>
            Inspect saved action
          </button>
        ) : null}
        <button
          className={buttonClass}
          disabled={!manage || busy}
          onClick={() => run(a.actionId, "refresh")}
        >
          Refresh durable state
        </button>
        {["scheduled", "queued", "dispatching", "unknown"].includes(a.status) &&
        !a.cancelRequested ? (
          <button
            className={dangerClass}
            disabled={!manage || busy}
            onClick={() => run(a.actionId, "cancel")}
          >
            Request cancellation
          </button>
        ) : null}
      </div>
    </li>
  );
}
/** Follow-ups and their cancel control always render; only the policy editor is gated on ownership (`editPolicy`). */
export default function EngagementPanel({
  accountId,
  manage,
  goHold,
  editPolicy,
}: {
  accountId: string;
  manage: boolean;
  goHold: string | null;
  editPolicy: boolean;
}) {
  const [cursor, setCursor] = useState<string | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [detail, setDetail] = useState<string | null>(null),
    [detailEpoch, setDetailEpoch] = useState(0),
    [pendingSettings, setPendingSettings] = useState<{
      expectedRevision: number;
      settings: EngagementPolicy;
    } | null>(null),
    [settingsNotice, setSettingsNotice] = useState(""),
    [settingsBusy, setSettingsBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const base = `/api/onlyfans-launch/automation/accounts/${encodeURIComponent(accountId)}`;
  const settings = useJsonResource(
    `${base}/settings`,
    useCallback(settingsParser(accountId), [accountId]),
    false,
  );
  const actions = useJsonResource(
    `${base}/follow-ups${cursor === null ? "" : `?cursor=${encodeURIComponent(cursor)}`}`,
    useCallback(pageParser(accountId), [accountId]),
    false,
  );
  // An identical retry is a brake only if every flag is off: it is not compared with the current read.
  const retryHeld = (p: EngagementPolicy) => goHold !== null && !brakeOnly(p, null);
  async function saveSettings(command: {
    expectedRevision: number;
    settings: EngagementPolicy;
  }, retry = false) {
    const saved = settings.state.kind === "ok" ? settings.state.data.settings : null;
    if (!manage || settingsBusy || (goHold !== null && !brakeOnly(command.settings, retry ? null : saved))) return;
    setSettingsBusy(true);
    const r = await bFetch(`${base}/settings`, {
      method: "POST",
      body: command,
    });
    if (!mounted.current) return;
    setSettingsBusy(false);
    const recorded =
      r.kind === "ok" &&
      object(r.data) &&
      r.data.schemaVersion === "of-launch-b.v1" &&
      r.data.ok === true &&
      r.data.accountId === accountId &&
      r.data.revision === command.expectedRevision + 1;
    setPendingSettings(
      r.kind === "unconfirmed" || (r.kind === "ok" && !recorded)
        ? command
        : null,
    );
    setSettingsNotice(
      recorded
        ? "Engagement settings recorded. Current settings and actions are read again."
        : "error" in r
          ? r.error
          : "Settings acknowledgement could not be verified. Read current state before retrying.",
    );
    settings.reload();
    actions.reload();
    setDetailEpoch((n) => n + 1);
  }
  async function run(actionId: string, action: "refresh" | "cancel") {
    if (!manage || busy) return;
    setBusy(true);
    const r = await bFetch(`${base}/follow-ups`, {
      method: "POST",
      body: { actionId, action },
    });
    if (!mounted.current) return;
    setBusy(false);
    const row =
      r.kind === "ok" && object(r.data)
        ? parseEngagementAction(r.data.action)
        : null;
    setNotice(
      row
        ? `${action === "cancel" ? "Cancellation request" : "Refresh"} recorded. Backend status: ${label(row.status)}${row.cancelRequested ? ", cancellation requested" : ""}. Reading current state.`
        : "error" in r
          ? r.error
          : "The action outcome could not be confirmed. Read current state before retrying.",
    );
    actions.reload();
    setDetailEpoch((n) => n + 1);
  }
  return (
    <div className="space-y-4">
      {editPolicy ? <div className="rounded-xl border border-line p-3">
        <StateLine
          state={settings.state}
          retry={settings.reload}
          label="engagement settings"
        />
        {settings.state.kind === "pending" ? (
          <p role="alert">
            {settings.state.error}
            <button className={buttonClass} onClick={settings.reload}>
              Retry
            </button>
          </p>
        ) : null}
        {settings.state.kind === "ok" ? (
          <Settings
            key={`${accountId}-${settings.state.data.revision}`}
            data={settings.state.data}
            manage={manage && pendingSettings === null && !settingsBusy}
            goHold={goHold}
            submit={saveSettings}
          />
        ) : null}
        <p role="status" className="mt-2 text-sm">
          {settingsNotice}
        </p>
        {pendingSettings ? (
          <div className="flex flex-wrap gap-2">
            <button
              className={buttonClass}
              disabled={!manage || settingsBusy || retryHeld(pendingSettings.settings)}
              title={goHold ?? undefined}
              onClick={() => void saveSettings(pendingSettings, true)}
            >
              Retry identical engagement settings
            </button>
            <button
              className={buttonClass}
              disabled={settingsBusy}
              onClick={() => {
                setPendingSettings(null);
                setSettingsNotice(
                  "Review current engagement settings before another change.",
                );
              }}
            >
              Use current engagement view
            </button>
          </div>
        ) : null}
      </div> : null}
      <div
        className="rounded-xl border border-line p-3"
        data-b-card="follow-ups"
      >
        <h3 className="font-semibold">
          Offers, follow-ups and reengagement actions
        </h3>
        <StateLine
          state={actions.state}
          retry={actions.reload}
          label="engagement actions"
        />
        {actions.state.kind === "pending" ? (
          <p role="alert">
            {actions.state.error}
            <button className={buttonClass} onClick={actions.reload}>
              Retry
            </button>
          </p>
        ) : null}
        {actions.state.kind === "ok" ? (
          <>
            {actions.state.data.actions.length ? (
              <ul className="mt-3 space-y-2">
                {actions.state.data.actions.map((a) => (
                  <Action
                    key={a.actionId}
                    a={a}
                    manage={manage}
                    run={(id, action) => void run(id, action)}
                    busy={busy}
                    onOpen={setDetail}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm">No engagement actions on this page.</p>
            )}
          </>
        ) : null}
        {/* Outside the ok branch: a failed older-page read must never hide the way back to the newest page. */}
        <div className="mt-3 flex gap-2">
          <button
            className={buttonClass}
            disabled={cursor === null}
            onClick={() => setCursor(null)}
          >
            Newest actions
          </button>
          <button
            className={buttonClass}
            disabled={
              actions.state.kind !== "ok" ||
              actions.state.data.nextCursor === null
            }
            onClick={() =>
              actions.state.kind === "ok" &&
              setCursor(actions.state.data.nextCursor)
            }
          >
            Older actions
          </button>
        </div>
        <p role="status" className="mt-2 text-sm">
          {notice}
        </p>
        {detail ? (
          <ActionDetail
            key={`${detail}-${detailEpoch}`}
            accountId={accountId}
            actionId={detail}
            manage={manage}
            run={(id, action) => void run(id, action)}
            busy={busy}
          />
        ) : null}
      </div>
    </div>
  );
}

function ActionDetail({
  accountId,
  actionId,
  manage,
  run,
  busy,
}: {
  accountId: string;
  actionId: string;
  manage: boolean;
  run: (id: string, action: "refresh" | "cancel") => void;
  busy: boolean;
}) {
  const parse = useCallback(
    (v: unknown) =>
      object(v) &&
      v.schemaVersion === "of-launch-b.v1" &&
      v.ok === true &&
      v.accountId === accountId &&
      v.engagementVersion === "of-engagement.v1"
        ? parseEngagementAction(v.action)
        : null,
    [accountId],
  );
  const r = useJsonResource(
    `/api/onlyfans-launch/automation/accounts/${encodeURIComponent(accountId)}/follow-ups/${encodeURIComponent(actionId)}`,
    parse,
    false,
  );
  return (
    <div className="mt-3 border-t border-line pt-3">
      <h4 className="font-semibold">Saved action detail</h4>
      <StateLine state={r.state} retry={r.reload} label="saved action" />
      {r.state.kind === "pending" ? <p role="alert">{r.state.error}</p> : null}
      {r.state.kind === "ok" && r.state.data.actionId === actionId ? (
        <ul>
          <Action a={r.state.data} manage={manage} run={run} busy={busy} />
        </ul>
      ) : null}
    </div>
  );
}
