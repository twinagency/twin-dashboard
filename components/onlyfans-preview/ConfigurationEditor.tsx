"use client";

import { inputCls } from "@/components/clone/fields";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
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
        setDefaultModel(""); setOverride("");
        setNotice("Your session cannot edit this creator. Sign in again."); router.refresh(); return false;
      }
      const next = response.ok ? parseConfiguration(await response.json(), accountId) : null;
      if (!active.current) return false;
      if (!next) { setData(null); setNotice("Editable configuration is unavailable. Refresh to try again."); return false; }
      setData(next); setPersona(next.persona ?? "");
      setFacts(Object.fromEntries(FACT_KEYS.map(key => [key, next.creatorFacts[key] ?? ""])));
      setDefaultModel(next.defaultModel ?? ""); setOverride(overrideValue(next));
      return true;
    } catch { if (active.current) { setData(null); setNotice("Configuration could not be refreshed. Try again."); } return false; }
  }, [accountId, endpoint, router]);

  useEffect(() => {
    active.current = true;
    void read().then(ok => { if (active.current) { setBusy(false); if (ok) setNotice(""); } });
    return () => { active.current = false; };
  }, [read]);

  const patch: ConfigurationPatch = {};
  if (data) {
    if ((data.personaTruncated && persona.trim()) || (!data.personaTruncated && persona !== data.persona)) patch.persona = persona.trim();
    const changed: Partial<Record<FactKey, string | null>> = {};
    if (data.factsValid) for (const key of FACT_KEYS) {
      if (!data.readOnlyFacts.includes(key) && (facts[key] ?? "") !== (data.creatorFacts[key] ?? "")) changed[key] = facts[key]?.trim() || null;
    }
    if (Object.keys(changed).length) patch.creatorFacts = changed;
    if (data.modelsValid && defaultModel !== (data.defaultModel ?? "") && defaultModel) patch.defaultModel = defaultModel;
    if (data.modelsValid && override !== overrideValue(data) && override !== "__review") patch.replyModelOverride = override || null;
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
        setDefaultModel(""); setOverride("");
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
        <label className="block text-sm">{data.personaTruncated ? "Replace saved persona" : "Creator persona"}
          <textarea data-of-edit-persona className={`${inputClass} min-h-32`} maxLength={4096} value={persona} onChange={event => setPersona(event.target.value)} />
          {data.personaTruncated ? <span className="mt-1 block text-xs text-muted">The full saved persona exceeds this editor’s limit. Enter a complete replacement only if you want to replace it.</span> : null}
        </label>
        <div><h3 className="text-sm font-semibold">Approved creator facts</h3>
          {!data.factsValid ? <p className="mt-1 text-xs text-muted">Saved facts need review before they can be edited.</p> : null}
          <div className="mt-2 grid min-w-0 gap-3 sm:grid-cols-2">{data.factFields.map(field => <label key={field.key} className="min-w-0 text-sm">{field.label}
            <input data-of-edit-fact={field.key} className={inputClass} maxLength={240} value={facts[field.key] ?? ""}
              disabled={!data.factsValid || data.readOnlyFacts.includes(field.key)} onChange={event => setFacts(previous => ({ ...previous, [field.key]: event.target.value }))} />
            {data.readOnlyFacts.includes(field.key) ? <span className="text-xs text-muted">Saved value needs review.</span> : null}
          </label>)}</div>
          <p className="mt-2 text-xs text-muted">Leave a fact blank to clear it. Save only facts approved by the creator.</p>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
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
        <p className="text-xs text-muted">Resolved reply model: {data.resolvedReplyModel ?? "No supported explicit model saved"}.{!data.modelsValid ? " Saved model configuration needs review." : ""}</p>
        <button type="submit" data-of-save-configuration disabled={!command || !validConfigurationRequest(command)} className={buttonClass}>Save creator settings</button>
      </fieldset>
    </form> : null}
    {retry && !denied ? <div className="mt-4 flex flex-wrap gap-3">
      <button data-of-retry-configuration disabled={busy} className={buttonClass} onClick={() => void save(retry)}>Retry same save</button>
      <button disabled={busy || !data} className={buttonClass} onClick={() => { setRetry(null); setNotice("Review the refreshed settings before editing again."); }}>Use refreshed settings</button>
    </div> : null}
    {!data && !denied ? <button className={`${buttonClass} mt-3`} disabled={busy} onClick={() => { setBusy(true); void read().then(ok => { if (active.current) { setBusy(false); if (ok) setNotice(""); } }); }}>Refresh editor</button> : null}
  </Card>;
}
