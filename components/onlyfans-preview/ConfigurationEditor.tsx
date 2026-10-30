"use client";

import { inputCls } from "@/components/clone/fields";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import FactFieldView from "./FactFieldView";
import { StudioTabPanel } from "./StudioTabs";
import { fanSelectionFromText } from "@/lib/onlyfans/activation";
import { FACT_KEYS, parseConfiguration, parseConfigurationAck, validConfigurationRequest,
  type Configuration, type ConfigurationPatch, type ConfigurationRequest, type FactKey } from "@/lib/onlyfans/configuration";

const inputClass = `${inputCls} mt-1 disabled:opacity-50`;
const buttonClass = "rounded-lg border border-line px-4 py-2 text-sm font-semibold text-accent disabled:opacity-50";
const overrideValue = (data: Configuration) => !data.modelsValid || (data.replyOverridePresent && data.replyModelOverride === null)
  ? "__review" : data.replyModelOverride ?? "";

export default function ConfigurationEditor({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Configuration | null>(null);
  const [persona, setPersona] = useState("");
  const [facts, setFacts] = useState<Partial<Record<FactKey, string>>>({});
  const [defaultModel, setDefaultModel] = useState("");
  const [override, setOverride] = useState("");
  const [contextualMode, setContextualMode] = useState<"off" | "shadow" | "live">("off");
  const [onRequestSales, setOnRequestSales] = useState(false);
  const [replyPacing, setReplyPacing] = useState(false), [replyFormat, setReplyFormat] = useState(false);
  const [discountResend, setDiscountResend] = useState(false), [postBuyUpsell, setPostBuyUpsell] = useState(false);
  const [scopeMode, setScopeMode] = useState<"selected" | "all">("selected"), [scopeFans, setScopeFans] = useState("");
  const [dailyBudget, setDailyBudget] = useState("0"), [effort, setEffort] = useState("");
  const [editingFacts, setEditingFacts] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(true);
  const [denied, setDenied] = useState(false);
  const [notice, setNotice] = useState("Loading editable configuration…");
  const [retry, setRetry] = useState<ConfigurationRequest | null>(null);
  const active = useRef(false), submitting = useRef(false);
  const sessionDenied = useRef(false);
  const endpoint = `/api/onlyfans-configuration/accounts/${encodeURIComponent(accountId)}`;

  const read = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store", redirect: "error" });
      if (!active.current) return false;
      if ([401, 403].includes(response.status)) {
        sessionDenied.current = true;
        setData(null); setPersona(""); setFacts({}); setRetry(null); setDenied(true);
        setDefaultModel(""); setOverride(""); setOnRequestSales(false);
        setNotice("Your session cannot edit this creator. Sign in again."); router.refresh(); return false;
      }
      const next = response.ok ? parseConfiguration(await response.json(), accountId) : null;
      if (!active.current) return false;
      if (!next) { setData(null); setNotice("Editable configuration is unavailable. Refresh to try again."); return false; }
      setData(next); setPersona(next.persona ?? "");
      setFacts(Object.fromEntries(FACT_KEYS.map(key => [key, next.creatorFacts[key] ?? ""])));
      setDefaultModel(next.defaultModel ?? ""); setOverride(overrideValue(next));
      setContextualMode(next.fasttContextualSalesMode ?? "off");
      setOnRequestSales(next.onRequestSalesEnabled);
      setReplyPacing(next.nativeReplyPacingEnabled ?? false); setReplyFormat(next.nativeReplyFormatEnabled ?? false);
      setDiscountResend(next.fasttDiscountResend); setPostBuyUpsell(next.fasttPostBuyUpsell);
      if (next.activation) {
        setScopeMode(next.activation.selection?.mode === "all" || !next.activation.selection && next.activation.allFansAllowed && !next.activation.allowedFans.length ? "all" : "selected");
        setScopeFans((next.activation.selection?.fans ?? next.activation.allowedFans).join(", "));
      }
      setDailyBudget(String(next.dailyCostCapCents)); setEffort(next.reasoningEffort ?? "");
      return true;
    } catch { if (active.current) { setData(null); setNotice("Configuration could not be refreshed. Try again."); } return false; }
  }, [accountId, endpoint, router]);

  useEffect(() => {
    active.current = true;
    void read().then(ok => { if (active.current) { setBusy(false); if (ok) setNotice(""); } });
    return () => { active.current = false; };
  }, [read]);

  const patch: ConfigurationPatch = {};
  const selection = fanSelectionFromText(scopeMode, scopeFans);
  const scopeDirty = !!data?.activation && (scopeMode !== (data.activation.selection?.mode === "all" || !data.activation.selection && data.activation.allFansAllowed && !data.activation.allowedFans.length ? "all" : "selected") ||
    scopeFans !== (data.activation.selection?.fans ?? data.activation.allowedFans).join(", "));
  if (data) {
    if (scopeDirty && selection) patch.fasttScope = selection;
    if ((data.personaTruncated && persona.trim()) || (!data.personaTruncated && persona !== data.persona)) patch.persona = persona.trim();
    const changed: Partial<Record<FactKey, string | null>> = {};
    if (data.factsValid) for (const key of FACT_KEYS) {
      if (!data.readOnlyFacts.includes(key) && (facts[key] ?? "") !== (data.creatorFacts[key] ?? "")) changed[key] = facts[key]?.trim() || null;
    }
    if (Object.keys(changed).length) patch.creatorFacts = changed;
    if (data.modelsValid && defaultModel !== (data.defaultModel ?? "") && defaultModel) patch.defaultModel = defaultModel;
    if (data.modelsValid && override !== overrideValue(data) && override !== "__review") patch.replyModelOverride = override || null;
    if (data.salesConfigurationValid && data.fasttContextualSalesMode !== undefined && contextualMode !== data.fasttContextualSalesMode) patch.fasttContextualSalesMode = contextualMode;
    if (data.salesConfigurationValid && onRequestSales !== data.onRequestSalesEnabled) patch.onRequestSalesEnabled = onRequestSales;
    if (data.salesConfigurationValid && data.nativeReplyPacingEnabled !== undefined && replyPacing !== data.nativeReplyPacingEnabled) patch.nativeReplyPacingEnabled = replyPacing;
    if (data.salesConfigurationValid && data.nativeReplyFormatEnabled !== undefined && replyFormat !== data.nativeReplyFormatEnabled) patch.nativeReplyFormatEnabled = replyFormat;
    if (data.salesConfigurationValid && discountResend !== data.fasttDiscountResend) patch.fasttDiscountResend = discountResend;
    if (data.salesConfigurationValid && postBuyUpsell !== data.fasttPostBuyUpsell) patch.fasttPostBuyUpsell = postBuyUpsell;
    if (Number(dailyBudget) !== data.dailyCostCapCents || !dailyBudget.trim()) patch.dailyCostCapCents = dailyBudget.trim() ? Number(dailyBudget) : NaN;
    if (effort !== (data.reasoningEffort ?? "")) patch.reasoningEffort = effort || null;
  }
  const command: ConfigurationRequest | null = data && Object.keys(patch).length ? {
    patch, expectedRevision: data.configurationRevision, expectedFingerprint: data.fingerprint,
  } : null;

  async function save(request: ConfigurationRequest) {
    if (submitting.current || !validConfigurationRequest(request)) return;
    submitting.current = true; setBusy(true); setNotice("Saving creator configuration…");
    let message = "Save outcome not confirmed. The refreshed settings show the latest recorded values.";
    let nextRetry: ConfigurationRequest | null = request;
    let sessionLost = false;
    try {
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", redirect: "error", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
      if (!active.current) return;
      if ([401, 403].includes(response.status)) {
        sessionLost = true;
        sessionDenied.current = true;
        setData(null); setPersona(""); setFacts({}); setRetry(null); setDenied(true);
        setDefaultModel(""); setOverride(""); setOnRequestSales(false);
        setNotice("Your session cannot edit this creator. Sign in again."); router.refresh(); return;
      }
      if (response.ok && parseConfigurationAck(await response.json(), { ...request, accountId })) {
        message = "Save recorded. Current settings refreshed."; nextRetry = null;
      } else if ([400, 404, 409, 413, 503].includes(response.status)) {
        message = response.status === 409 ? "Configuration changed. Review the refreshed values before saving again."
          : "The change was refused. Review the refreshed values before trying again.";
        nextRetry = null;
      }
    } catch { /* Keep the exact original request for an explicit retry. */ }
    finally {
      if (active.current && !sessionLost) {
        const refreshed = await read();
        if (active.current) {
          if (!sessionDenied.current) setRetry(nextRetry);
          if (refreshed) setNotice(message);
          router.refresh(); setBusy(false);
        }
      }
      if (active.current && sessionLost) setBusy(false);
      submitting.current = false;
    }
  }

  return <Card className="mt-5 min-w-0 p-4" data-of-configuration-editor>
    <h2 className="font-semibold">Edit creator settings</h2>
    <p className="mt-1 text-xs text-muted">Update the creator persona, approved facts and saved reply model. Changes are recorded for this operator session.</p>
    {notice ? <p role="status" className="mt-3 text-sm" data-of-configuration-notice>{notice}</p> : null}
    {data && !denied ? <form className="mt-4" onSubmit={event => { event.preventDefault(); if (command && !retry) void save(command); }}>
      <fieldset disabled={busy || !!retry} className="min-w-0 space-y-4">
        <StudioTabPanel value="personality"><label className="block text-sm">{data.personaTruncated ? "Replace saved persona" : "Creator persona"}
          <textarea data-of-edit-persona className={`${inputClass} min-h-32`} maxLength={4096} value={persona} onChange={event => setPersona(event.target.value)} />
          {data.personaTruncated ? <span className="mt-1 block text-xs text-muted">The full saved persona exceeds this editor’s limit. Enter a complete replacement only if you want to replace it.</span> : null}
        </label>
        <div><h3 className="text-sm font-semibold">Approved creator facts</h3>
          <p className="mt-1 text-xs text-muted" data-of-shared-facts-state>
            {data.sharedFacts.state === "unconfigured" ? "Twin fact synchronization has not been connected for this account."
              : data.sharedFacts.state === "current" ? "Twin facts are synchronized. Editing a fact creates an OnlyFans override."
              : "Twin facts are unavailable or out of date. AI replies wait for synchronization."}
          </p>
          {!data.factsValid ? <p className="mt-1 text-xs text-muted">Saved facts need review before they can be edited.</p> : null}
          <div className="mt-2 grid min-w-0 gap-3 sm:grid-cols-2">{data.factFields.map(field => <div key={field.key} className="min-w-0">
            <FactFieldView label={field.label} factKey={field.key} savedValue={data.creatorFacts[field.key] ?? ""} value={facts[field.key] ?? ""}
              overridden={data.sharedFacts.overrideKeys.includes(field.key)} sharedState={data.sharedFacts.state} editing={editingFacts.has(field.key)}
              readOnly={data.readOnlyFacts.includes(field.key)} onEdit={() => setEditingFacts(previous => new Set(previous).add(field.key))}>
              {data.readOnlyFacts.includes(field.key)
                ? <textarea data-of-edit-fact={field.key} className={`${inputClass} min-h-24`} readOnly value={facts[field.key] ?? ""} />
                : <input data-of-edit-fact={field.key} className={inputClass} maxLength={240} value={facts[field.key] ?? ""}
                    disabled={!data.factsValid} onChange={event => setFacts(previous => ({ ...previous, [field.key]: event.target.value }))} />}
            </FactFieldView>
            {data.readOnlyFacts.includes(field.key) ? <span className="block text-xs text-muted">Long saved facts are shown in full and cannot be edited here.</span> : null}
            {data.sharedFacts.state === "current" && data.sharedFacts.overrideKeys.includes(field.key) ? <button
              type="button" data-of-inherit-fact={field.key} disabled={!!command || !data.factsValid}
              className="mt-1 text-xs font-semibold text-accent disabled:opacity-50"
              onClick={() => void save({ patch: { inheritCreatorFacts: [field.key] }, expectedRevision: data.configurationRevision, expectedFingerprint: data.fingerprint })}>
              Use Twin value
            </button> : null}
          </div>)}</div>
          <p className="mt-2 text-xs text-muted">Leave a fact blank to clear it for OnlyFans. Save only facts approved by the creator. Facts shown as Not provided are not sent to the AI. Save or discard other edits before choosing Use Twin value.</p>
        </div>
        </StudioTabPanel><StudioTabPanel value="replies"><p className="text-sm" data-of-model-summary>Reply model: {data.resolvedReplyModel ? "Saved on this creator" : "Not set up"}{!data.modelsValid ? ", needs review" : ""}</p>
        <details className="rounded-lg border border-line p-3" open={!data.modelsValid} data-of-model-advanced><summary className="cursor-pointer text-sm font-semibold">Advanced</summary><div className="mt-3 space-y-3"><div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="min-w-0 text-sm">Default model<select data-of-edit-model className={inputClass} disabled={!data.modelsValid} value={defaultModel} onChange={event => setDefaultModel(event.target.value)}>
            {!data.defaultModel ? <option value="" disabled>No saved model</option> : !data.modelOptions.includes(data.defaultModel) ? <option value={data.defaultModel} disabled>Current choice needs review</option> : null}
            {data.modelOptions.map(model => <option key={model} value={model}>{model}</option>)}
          </select></label>
          <label className="min-w-0 text-sm">Reply model override<select data-of-edit-override className={inputClass} disabled={!data.modelsValid} value={override} onChange={event => setOverride(event.target.value)}>
            {overrideValue(data) === "__review" ? <option value="__review" disabled>Current override needs review</option> : data.replyModelOverride && !data.modelOptions.includes(data.replyModelOverride) ? <option value={data.replyModelOverride} disabled>Current choice needs review</option> : null}
            <option value="">Use saved default model</option>
            {data.modelOptions.map(model => <option key={model} value={model}>{model}</option>)}
          </select></label>
        </div>
        <p className="text-xs text-muted">Resolved reply model: {data.resolvedReplyModel ?? "No supported explicit model saved"}.{!data.modelsValid ? " Saved model configuration needs review." : ""}</p></div></details>
        <div className="min-w-0">
          <label className="text-sm">Contextual offers<select data-of-edit-contextual className={inputClass}
            disabled={!data.salesConfigurationValid || data.fasttContextualSalesMode === undefined}
            value={contextualMode} onChange={event => setContextualMode(event.target.value as "off" | "shadow" | "live")}>
            <option value="off">Off</option><option value="shadow">Preview</option><option value="live">On</option>
          </select></label>
          <p className="mt-1 text-xs text-muted">Offer relevant available content during AI conversations.</p>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="min-w-0 text-sm">Daily model budget (USD cents)<input data-of-edit-budget type="number" min={0} max={1_000_000} step={1} className={inputClass} value={dailyBudget} onChange={event => setDailyBudget(event.target.value)} /></label>
          <label className="min-w-0 text-sm">Reasoning effort<select data-of-edit-reasoning className={inputClass} value={effort} onChange={event => setEffort(event.target.value)}>
            <option value="">Use model default</option>
            {effort && !(data.reasoningOptions[override || defaultModel] ?? []).includes(effort) ? <option value={effort} disabled>Saved effort needs review</option> : null}
            {(data.reasoningOptions[override || defaultModel] ?? []).map(e => <option key={e} value={e}>{e}</option>)}
          </select></label>
        </div>
        <div className="rounded-lg border border-line p-3">
          <label className="flex items-start gap-2 text-sm font-medium">
            <input type="checkbox" data-of-edit-reply-pacing checked={replyPacing}
              disabled={!data.salesConfigurationValid || data.nativeReplyPacingEnabled === undefined}
              onChange={event => setReplyPacing(event.target.checked)} />
            Varied reply timing
          </label>
          <p className="mt-2 text-xs text-muted">Group incoming messages and vary reply timing, targeting 25 to 90 seconds when capacity allows.</p>
        </div>
        <div className="rounded-lg border border-line p-3">
          <label className="flex items-start gap-2 text-sm font-medium">
            <input type="checkbox" data-of-edit-reply-format checked={replyFormat}
              disabled={!data.salesConfigurationValid || data.nativeReplyFormatEnabled === undefined}
              onChange={event => setReplyFormat(event.target.checked)} />
            Flexible reply length
          </label>
          <p className="mt-2 text-xs text-muted">Allow a short acknowledgment or a fuller reply when the conversation needs it.</p>
        </div>
        <div className="rounded-lg border border-line p-3">
          <label className="flex items-start gap-2 text-sm font-medium">
            <input type="checkbox" data-of-edit-request-sales checked={onRequestSales}
              disabled={!data.salesConfigurationValid} onChange={event => setOnRequestSales(event.target.checked)} />
            Offer saved content when a fan asks
          </label>
          <p className="mt-2 text-xs text-muted">Use eligible saved catalogue items for direct content requests. Existing pricing, spending limits and qualification checks apply. Sending also requires a verified active account, paid-media permission and current purchase reconciliation.</p>
          {!data.salesConfigurationValid ? <p className="mt-2 text-xs text-muted">Saved sales settings need review before this option can be changed.</p> : null}
        </div>
        <div className="rounded-lg border border-line p-3">
          <label className="flex items-start gap-2 text-sm font-medium">
            <input type="checkbox" data-of-edit-discount-resend checked={discountResend}
              disabled={!data.salesConfigurationValid} onChange={event => setDiscountResend(event.target.checked)} />
            Discounted resend
          </label>
          <p className="mt-2 text-xs text-muted">Off by default. When on: if a fan did not buy a card, voiced a price objection and then messaged again, the same item is resent 90 minutes or more after the original card at 10-20% below the price he saw. It never goes below the $3 minimum, so $3 cards are skipped. Turning this off stops its queued actions.</p>
        </div>
        <div className="rounded-lg border border-line p-3">
          <label className="flex items-start gap-2 text-sm font-medium">
            <input type="checkbox" data-of-edit-post-buy-upsell checked={postBuyUpsell}
              disabled={!data.salesConfigurationValid} onChange={event => setPostBuyUpsell(event.target.checked)} />
            Post-purchase upsell
          </label>
          <p className="mt-2 text-xs text-muted">Off by default. When on: one follow-up offer is sent 90-240 seconds after a purchase confirmed by the ledger. Turning this off stops its queued actions.</p>
        </div>
        {data.activation ? <section className="rounded-lg border border-line p-3" data-of-activation-readiness>
          <h3 className="text-sm font-semibold">Automation readiness and fan scope</h3>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            <li>{data.activation.deploymentAllowed ? "Creator is authorized for the FASTT runner." : "This creator needs deployment authorization before the FASTT runner can start."}</li>
            <li>{data.activation.modelCredentialReady ? "A matching model credential is ready." : "Save and verify a model credential matching this creator’s settings."}</li>
            <li>{data.activation.proxySaved ? "A proxy is saved for this creator." : "No proxy is saved. Configure this creator’s dedicated proxy before rollout."}</li>
            <li>{data.activation.automatedConversations} recorded as automated · {data.activation.pausedConversations} paused · {data.activation.takeoverConversations} with human control · {data.activation.noContactConversations} no-contact</li>
            <li>Send interval: {data.activation.throttleSeconds === null ? "not configured" : `${data.activation.throttleSeconds} seconds`}. Next send window: {data.activation.nextSendAt ? new Date(data.activation.nextSendAt).toLocaleString() : "not waiting"}.</li>
          </ul>
          <label className="mt-3 block text-xs">Fan scope<select data-of-edit-fan-scope className={inputClass} value={scopeMode}
            disabled={!data.activation.deploymentAllowed || !data.activation.selectionValid} onChange={e => setScopeMode(e.target.value as "selected" | "all")}>
            <option value="selected">Selected fans</option><option value="all" disabled={!data.activation.allFansAllowed}>All eligible fans</option>
          </select></label>
          {scopeMode === "selected" ? <label className="mt-2 block text-xs">Fan IDs, separated by commas<input data-of-edit-fan-ids className={inputClass} value={scopeFans}
            disabled={!data.activation.deploymentAllowed || !data.activation.selectionValid} onChange={e => setScopeFans(e.target.value)} /></label> : null}
          {scopeDirty && !selection ? <p role="alert" className="mt-2 text-xs">Enter one or more valid numeric fan IDs.</p> : null}
          {!data.activation.selectionValid ? <p role="alert" className="mt-2 text-xs">The saved fan scope needs review before it can be edited.</p> : null}
          <p className="mt-2 text-xs text-muted">Scope selection does not resume paused chats or override human control or no-contact. Resume an approved chat in Inbox. New conversations are never enabled automatically; enable each fan in the inbox. Changes remain inside this creator’s deployment authorization.</p>
        </section> : null}
        </StudioTabPanel><button type="submit" data-of-save-configuration disabled={!command || !validConfigurationRequest(command) || scopeDirty && !selection} className={buttonClass}>Save creator settings</button>
      </fieldset>
    </form> : null}
    {retry && !denied ? <div className="mt-4 flex flex-wrap gap-3">
      <button data-of-retry-configuration disabled={busy} className={buttonClass} onClick={() => void save(retry)}>Retry same save</button>
      <button disabled={busy || !data} className={buttonClass} onClick={() => { setRetry(null); setNotice("Review the refreshed settings before editing again."); }}>Use refreshed settings</button>
    </div> : null}
    {!data && !denied ? <button className={`${buttonClass} mt-3`} disabled={busy} onClick={() => { setBusy(true); void read().then(ok => { if (active.current) { setBusy(false); if (ok) setNotice(""); } }); }}>Refresh editor</button> : null}
  </Card>;
}

