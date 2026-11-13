"use client";
import { useEffect, useRef, useState } from "react";
import ConfigurationEditor from "@/components/onlyfans-preview/ConfigurationEditor";
import { FACT_KEYS, type FactKey } from "@/lib/onlyfans/configuration";
import {
  parseNativePersonality,
  parsePersonalityHistory,
  type Personality,
  type PersonalityReview,
} from "@/lib/onlyfans/launch/native";
import {
  Section,
  StateLine,
  buttonClass,
  postCommand,
  useCanManage,
  useLaunchResource,
  type Post,
} from "../a-shared";

const field =
  "min-h-11 w-full rounded-lg border border-line bg-white px-2 text-sm disabled:opacity-60";
const label = (key: string) => key.replaceAll("_", " ");
function EvidenceView({ p }: { p: Personality }) {
  if (!p.document) return null;
  const d = p.document.draft;
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt>Source</dt>
        <dd>{p.document.source}</dd>
        <dt>Sampled outgoing messages</dt>
        <dd>
          {d.coverage.sampledMessages} of {d.coverage.uniqueMessages} in bounded
          input
        </dd>
        <dt>Authorship</dt>
        <dd>
          {Object.entries(d.coverage.authorship)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ")}
        </dd>
      </dl>
      <ul className="list-disc pl-5 text-sm">
        {d.coverage.limitations.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
      <details>
        <summary className="cursor-pointer text-sm font-semibold">
          Imported facts and writing observations
        </summary>
        <ul className="mt-2 space-y-2 text-sm">
          {[...d.creatorFacts, ...d.writingStyle].map((o, i) => (
            <li key={i}>
              <strong>{label(o.key)}</strong>: {o.value} ({o.attribution});
              evidence {o.evidenceIds.join(", ")}
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary className="cursor-pointer text-sm font-semibold">
          Source excerpts ({d.evidence.length})
        </summary>
        <ul className="mt-2 space-y-2 text-sm">
          {d.evidence.map((e) => (
            <li
              key={e.id}
              className="break-words rounded-lg border border-line p-2"
            >
              <strong>{e.author}</strong> · {e.sourceId}
              <blockquote>
                {e.excerpt}
                {e.truncated ? "…" : ""}
              </blockquote>
              <span className="text-xs">Evidence {e.id}</span>
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary className="cursor-pointer text-sm font-semibold">
          Excluded operational instructions ({d.operationalInstructions.length})
        </summary>
        <ul className="mt-2 space-y-2 text-sm">
          {d.operationalInstructions.map((o, i) => (
            <li key={i}>
              {o.text}
              <span className="block text-xs">
                {o.attribution}. Excluded from configuration.{" "}
                {o.conflicts.map((c) => c.message).join(" ")}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
function ReviewEditor({
  p,
  enabled,
  submit,
}: {
  p: Personality;
  enabled: boolean;
  submit: (command: unknown) => Promise<Post>;
}) {
  const review = p.document?.review ?? {};
  const [persona, setPersona] = useState(
    review.persona ?? p.document?.draft.suggestedPersona.text ?? "",
  );
  const [selected, setSelected] = useState<Partial<Record<FactKey, boolean>>>(
    Object.fromEntries(
      Object.keys(review.creatorFacts ?? {}).map((k) => [k, true]),
    ),
  );
  const [values, setValues] = useState<Partial<Record<FactKey, string>>>(
    Object.fromEntries(
      Object.entries(review.creatorFacts ?? {}).map(([k, v]) => [k, v ?? ""]),
    ),
  );
  const [acks, setAcks] = useState({
    mixedAuthorship: false,
    runtimeRules: false,
    factsVerified: false,
  });
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState<Post | null>(null);
  async function command(path: string, body: Record<string, unknown> = {}) {
    if (busy || !enabled) return;
    setBusy(true);
    setResult(null);
    const r = await submit({
      path,
      id: null,
      body: { expectedRevision: p.revision, expectedBindingId: p.bindingId, ...body },
    });
    setResult(r);
    setBusy(false);
    // The parent preserves uncertain commands and refreshes only authoritative current state.
  }
  const save = () => {
    const creatorFacts = Object.fromEntries(
      FACT_KEYS.filter((k) => selected[k]).map((k) => [
        k,
        values[k]?.trim() || null,
      ]),
    );
    const next: PersonalityReview = { ...review, persona: persona.trim() };
    if (Object.keys(creatorFacts).length) next.creatorFacts = creatorFacts;
    else delete next.creatorFacts;
    return command("personality/review", { review: next });
  };
  return (
    <div className="space-y-3">
      <p className="text-sm">
        Personality revision {p.revision}: {p.state}.{" "}
        {p.configurationCurrent === false
          ? "Saved AI configuration has changed since this revision."
          : ""}
      </p>
      <button
        className={buttonClass}
        disabled={!enabled || busy}
        onClick={() => void command("personality/import")}
      >
        {p.state === "empty"
          ? "Import a review draft from history"
          : "Create a new import draft"}
      </button>
      {p.document ? (
        <>
          {p.state === "draft" ? (
            <p role="note" className="text-sm">
              This review has not been applied. The prior saved configuration
              remains effective until approval.
            </p>
          ) : null}
          <label
            className="block text-sm font-semibold"
            htmlFor="personality-tone"
          >
            Reviewed tone
          </label>
          <textarea
            id="personality-tone"
            className={`${field} min-h-40 p-2`}
            maxLength={4096}
            value={persona}
            disabled={!enabled || busy}
            onChange={(e) => setPersona(e.target.value)}
          />
          {p.document.draft.suggestedPersona.warning ? (
            <p className="text-sm" role="note">
              {p.document.draft.suggestedPersona.warning}
            </p>
          ) : null}
          <fieldset disabled={!enabled || busy} className="space-y-2">
            <legend className="text-sm font-semibold">
              Verified creator facts to include in this replacement review
            </legend>
            {FACT_KEYS.map((k) => (
              <div key={k} className="grid gap-1 sm:grid-cols-[12rem_1fr]">
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected[k] === true}
                    onChange={(e) =>
                      setSelected((s) => ({ ...s, [k]: e.target.checked }))
                    }
                  />
                  {label(k)}
                </label>
                <input
                  aria-label={`Reviewed ${label(k)}`}
                  className={field}
                  disabled={!selected[k]}
                  maxLength={240}
                  value={values[k] ?? ""}
                  onChange={(e) =>
                    setValues((s) => ({ ...s, [k]: e.target.value }))
                  }
                />
              </div>
            ))}
          </fieldset>
          <p className="text-xs text-muted">
            A selected empty fact explicitly clears that saved fact. Unselected
            facts remain outside this review.
          </p>
          <button
            className={buttonClass}
            disabled={!enabled || busy || !persona.trim()}
            onClick={() => void save()}
          >
            Save complete review as a new draft
          </button>
          {p.factComparisons?.length ? (
            <ul className="text-sm">
              {p.factComparisons.map((f) => (
                <li key={f.key}>
                  {label(f.key)}: {f.current ?? "empty"} →{" "}
                  {f.proposed ?? "clear"}
                  {f.changed ? " (change)" : " (unchanged)"}
                </li>
              ))}
            </ul>
          ) : null}
          {p.requiresFactResolution?.length ? (
            <p role="alert" className="text-sm">
              Verify facts from the prior creator before approval:{" "}
              {p.requiresFactResolution.join(", ")}
            </p>
          ) : null}
          {p.conflicts?.length ? (
            <ul role="alert" className="text-sm">
              {p.conflicts.map((c) => (
                <li key={c.code}>{c.message}</li>
              ))}
            </ul>
          ) : null}
          <fieldset
            disabled={!enabled || busy || p.state !== "draft"}
            className="space-y-2"
          >
            <legend className="text-sm font-semibold">
              Approval acknowledgements
            </legend>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={acks.mixedAuthorship}
                onChange={(e) =>
                  setAcks((s) => ({ ...s, mixedAuthorship: e.target.checked }))
                }
              />
              I reviewed mixed and unknown authorship. Account messages are not
              automatically the creator's own words.
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={acks.runtimeRules}
                onChange={(e) =>
                  setAcks((s) => ({ ...s, runtimeRules: e.target.checked }))
                }
              />
              I reviewed the tone and excluded conflicting operational
              instructions.
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={acks.factsVerified}
                onChange={(e) =>
                  setAcks((s) => ({ ...s, factsVerified: e.target.checked }))
                }
              />
              I verified the creator facts in the saved review.
            </label>
          </fieldset>
          <button
            className={buttonClass}
            disabled={
              !enabled ||
              busy ||
              p.state !== "draft" ||
              !review.persona?.trim() ||
              !Object.values(acks).every(Boolean)
            }
            onClick={() =>
              void command("personality/approve", { acknowledgements: acks })
            }
          >
            Approve saved personality revision {p.revision}
          </button>
          <p className="text-xs text-muted">
            Approval applies the saved review. Unsaved edits above are not
            approved. Approval does not enable autonomous handling.
          </p>
        </>
      ) : null}
      {result ? (
        <p role="status" className="text-sm">
          {result.ok
            ? "Command recorded. Reading the current revision."
            : result.error}
        </p>
      ) : null}
    </div>
  );
}
function History({ accountId }: { accountId: string }) {
  const [before, setBefore] = useState<number | null>(null),
    [revision, setRevision] = useState<number | null>(null);
  const history = useLaunchResource(
    accountId,
    `personality/history${before === null ? "" : `?before=${before}`}`,
    parsePersonalityHistory,
  );
  return (
    <div className="space-y-3">
      <StateLine
        state={history.state}
        retry={history.reload}
        label="personality history"
      />
      {history.state.kind === "pending" ? (
        <p role="alert">{history.state.error}</p>
      ) : null}
      {history.state.kind === "ok" ? (
        <>
          <ul className="space-y-2 text-sm">
            {history.state.data.revisions.map((r) => (
              <li key={r.revision}>
                <button
                  className={buttonClass}
                  onClick={() => setRevision(r.revision)}
                >
                  Revision {r.revision}, {r.state}
                </button>{" "}
                · {r.actor} · {new Date(r.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              className={buttonClass}
              disabled={before === null}
              onClick={() => setBefore(null)}
            >
              Newest revisions
            </button>
            <button
              className={buttonClass}
              disabled={history.state.data.nextBefore === null}
              onClick={() =>
                history.state.kind === "ok" &&
                setBefore(history.state.data.nextBefore)
              }
            >
              Older revisions
            </button>
          </div>
        </>
      ) : null}
      {revision !== null ? (
        <Revision key={revision} accountId={accountId} revision={revision} />
      ) : null}
    </div>
  );
}
function Revision({
  accountId,
  revision,
}: {
  accountId: string;
  revision: number;
}) {
  const r = useLaunchResource(
    accountId,
    `personality/revisions/${revision}`,
    parseNativePersonality,
  );
  return (
    <div className="rounded-lg border border-line p-3">
      <StateLine
        state={r.state}
        retry={r.reload}
        label={`revision ${revision}`}
      />
      {r.state.kind === "ok" ? (
        <>
          <h3 className="font-semibold">
            Historical revision {r.state.data.revision}
          </h3>
          <pre className="whitespace-pre-wrap break-words text-xs">
            {JSON.stringify(r.state.data.document?.review ?? {}, null, 2)}
          </pre>
          <EvidenceView p={r.state.data} />
        </>
      ) : null}
    </div>
  );
}
export default function PersonalityScreen({
  accountId,
}: {
  accountId: string;
}) {
  const { state, reload } = useLaunchResource(
    accountId,
    "personality",
    parseNativePersonality,
  );
  const manage = useCanManage(accountId);
  const [retry, setRetry] = useState<unknown | null>(null),
    [notice, setNotice] = useState(""),
    [sending, setSending] = useState(false);
  // The editor stays mounted (disabled) through a loading, failed or pending re-read of THIS account, so an unchanged revision keeps
  // the typed draft and a new one remounts it. useJsonResource never returns another url's state, so lastOk is always this account's
  // read; a denied read hides it.
  const lastOk = useRef<{ accountId: string; data: Personality } | null>(null);
  useEffect(() => {
    if (state.kind === "ok") lastOk.current = { accountId, data: state.data };
    else if (lastOk.current?.accountId !== accountId) lastOk.current = null;
  }, [state, accountId]);
  const view =
    state.kind === "ok"
      ? state.data
      : state.kind !== "denied" && lastOk.current?.accountId === accountId
        ? lastOk.current.data
        : null;
  const editable =
    state.kind === "ok" && manage === true && retry === null && !sending;
  async function submit(command: unknown): Promise<Post> {
    setSending(true);
    const r = await postCommand(accountId, command);
    setSending(false);
    setRetry(!r.ok && r.outcome === "unconfirmed" ? command : null);
    setNotice(
      r.ok
        ? "Command recorded. Current personality is read again; a historical replay never replaces it."
        : r.error,
    );
    reload();
    return r;
  }
  return (
    <div className="space-y-4">
      <Section title="AI configuration">
        {manage === true ? (
          <fieldset disabled={retry !== null || sending}>
            <ConfigurationEditor key={accountId} accountId={accountId} />
          </fieldset>
        ) : (
          <p className="text-sm">
            {manage === false
              ? "Your team access is read-only. Model and budget state appear in AI readiness below."
              : "Checking management access…"}
          </p>
        )}
      </Section>
      <Section title="Personality import, review and approval">
        <StateLine state={state} retry={reload} label="personality" />
        {state.kind === "pending" ? (
          <p role="alert" className="text-sm">
            {state.error}
            <button className={buttonClass} onClick={reload}>
              Retry
            </button>
          </p>
        ) : null}
        {manage === false ? (
          <p data-launch-state="readonly" className="text-sm">
            Your team access is read-only.
          </p>
        ) : null}
        {view ? (
          <ReviewEditor
            key={`${accountId}-${view.bindingId}-${view.revision}`}
            p={view}
            enabled={editable}
            submit={submit}
          />
        ) : null}
        {notice ? (
          <p role="status" className="text-sm">
            {notice}
          </p>
        ) : null}
        {retry !== null ? (
          <div className="flex flex-wrap gap-2">
            <button
              className={buttonClass}
              disabled={manage !== true || sending}
              onClick={() => void submit(retry)}
            >
              Retry identical personality command
            </button>
            <button
              className={buttonClass}
              disabled={sending}
              onClick={() => {
                setRetry(null);
                setNotice(
                  "Review the current saved personality before making another change.",
                );
              }}
            >
              Use current saved view
            </button>
          </div>
        ) : null}
      </Section>
      {state.kind === "ok" && state.data.document ? (
        <>
          <Section title="Source attribution and coverage">
            <EvidenceView p={state.data} />
          </Section>
          <Section title="AI readiness">
            <p className="text-sm">
              These checks describe this document. Overall account readiness
              uses the currently effective approved configuration.
            </p>
            <p className="text-sm">
              Approved: {state.data.state === "approved" ? "yes" : "no"}. Saved
              configuration snapshot match:{" "}
              {state.data.configurationCurrent ? "yes" : "no"}. This document
              ready: {state.data.readiness?.ready ? "yes" : "no"}.
            </p>
            <ConfigurationDrift value={state.data.configurationDrift} />
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt>Model</dt>
              <dd>{state.data.readiness?.model.modelId ?? "unset"}</dd>
              <dt>Credential</dt>
              <dd>{state.data.readiness?.credential.state ?? "unknown"}</dd>
              <dt>Budget (cents/day)</dt>
              <dd>
                {state.data.readiness?.budget.dailyCostCapCents ?? "unknown"}
              </dd>
            </dl>
            <ul className="text-sm">
              {state.data.readiness?.blockers.map((b) => (
                <li key={b}>{label(b)}</li>
              ))}
            </ul>
          </Section>
        </>
      ) : null}
      <Section title="Revision history">
        <History
          key={`${accountId}-${state.kind === "ok" ? state.data.revision : "loading"}`}
          accountId={accountId}
        />
      </Section>
    </div>
  );
}

function ConfigurationDrift({ value }: { value: unknown }) {
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  if (!object(value) || !Number.isSafeInteger(value.fromRevision) || !Number.isSafeInteger(value.toRevision) || typeof value.auditComplete !== "boolean" || !Array.isArray(value.changes) || value.changes.length > 200 || !value.changes.every(row => object(row) && Number.isSafeInteger(row.revision) && typeof row.actor === "string" && typeof row.recordedAt === "string" && object(row.before) && object(row.after))) return <p className="text-sm">Configuration difference evidence unavailable. No approval has been refreshed.</p>;
  return <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer text-sm font-semibold">Saved changes since this document: revision {String(value.fromRevision)} to {String(value.toRevision)}</summary>
    <p className="text-sm">{value.auditComplete ? "The immutable configuration audit connects this document to the saved settings." : "The audit chain does not fully explain the saved fingerprint. Effective sender configuration still needs investigation."} These are recorded saved changes. Review substantive personality and fact changes before approving; current settings are preserved.</p>
    {value.changes.map((row, i) => { if (!object(row) || !object(row.before) || !object(row.after)) return null; const before = row.before, after = row.after; return <div className="mt-3" key={i}><p className="text-xs">Revision {String(row.revision)} · {String(row.actor)} · {String(row.recordedAt)}</p><table className="w-full table-fixed text-xs"><thead><tr><th>Setting</th><th>Before</th><th>After</th></tr></thead><tbody>{[...new Set([...Object.keys(before), ...Object.keys(after)])].map(key => <tr key={key}><th className="break-words text-left">{key}</th><td className="whitespace-pre-wrap break-words">{JSON.stringify(before[key]) ?? "Not recorded"}</td><td className="whitespace-pre-wrap break-words">{JSON.stringify(after[key]) ?? "Not recorded"}</td></tr>)}</tbody></table></div>; })}
  </details>;
}
