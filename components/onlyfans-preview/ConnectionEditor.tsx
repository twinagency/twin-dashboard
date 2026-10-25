"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { connectionState, CONNECTION_LABELS, CONNECTION_DETAILS } from "@/lib/onlyfans-connections/presentation";
import { normalizeProxyInput, PROXY_RULE } from "@/lib/onlyfans-connections/proxy";
import ConnectionSyncStatus from "./ConnectionSyncStatus";
import { parseCommandJson } from "@/lib/onlyfans/command-json";
import { connectionCapture, connectionOwner, object, parseConnection, parseConnectionAck, parseRegistrationAck,
  validConnectionRequest, validConnectionRegistration, type Connection, type ConnectionCreator,
  type ConnectionRequest, type ConnectionRegistration } from "@/lib/onlyfans-connections/contract";

const inputClass = "mt-1 w-full min-w-0 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink disabled:opacity-50";
const buttonClass = "rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50";
const recordedTime = (value: string | null) => value ? new Date(value).toLocaleString() : "Not recorded";

export default function ConnectionEditor({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [denied, setDenied] = useState(false);
  const [data, setData] = useState<Connection | null>(null), [notice, setNotice] = useState("");
  const [owner, setOwner] = useState(""), [xHash, setXHash] = useState(""), [proxy, setProxy] = useState("");
  const [modelEnabled, setModelEnabled] = useState(false), [modelId, setModelId] = useState(""), [apiKey, setApiKey] = useState("");
  const [hours, setHours] = useState("6"), [captureReady, setCaptureReady] = useState(false);
  const [limit, setLimit] = useState(""), [throttle, setThrottle] = useState(""), [media, setMedia] = useState(false);
  const [automateNew, setAutomateNew] = useState(false);
  const [hasRetry, setHasRetry] = useState(false);
  const proxyEntry = useMemo(() => normalizeProxyInput(proxy), [proxy]);
  const active = useRef(false), submitting = useRef(false), sessionDenied = useRef(false);
  const capture = useRef<Record<string, unknown> | null>(null), retry = useRef<ConnectionRequest | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const captureGeneration = useRef(0);
  const endpoint = `/api/onlyfans-connections/accounts/${encodeURIComponent(accountId)}`;
  const clearSecrets = useCallback(() => {
    captureGeneration.current++; capture.current = null; setCaptureReady(false); setXHash(""); setProxy(""); setApiKey("");
    if (fileInput.current) fileInput.current.value = "";
  }, []);
  const dropRetry = useCallback(() => { retry.current = null; setHasRetry(false); }, []);
  useEffect(() => { active.current = true; return () => { active.current = false; capture.current = null; retry.current = null; }; }, []);
  const read = useCallback(async (updateForm = true) => {
    try {
      const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store", redirect: "error" });
      if (!active.current) return false;
      if ([401, 403].includes(response.status)) {
        sessionDenied.current = true; clearSecrets(); dropRetry(); setOwner(""); setModelId(""); setData(null); setDenied(true);
        setNotice("Your session cannot manage this account. Sign in again."); router.refresh(); return false;
      }
      const next = response.ok ? parseConnection(await response.json(), accountId) : null;
      if (!active.current) return false;
      if (!next) { setData(null); setNotice("Connection status could not be refreshed. Try again."); return false; }
      setData(next); if (updateForm) { setOwner(next.ownerId ?? ""); setLimit(next.limitUnits ? String(next.limitUnits) : ""); setThrottle(next.throttleSeconds ? String(next.throttleSeconds) : ""); setMedia(next.mediaEnabled); setAutomateNew(next.automateNewConversations); }
      return true;
    } catch { if (active.current) { setData(null); setNotice("Connection status could not be refreshed. Try again."); } return false; }
  }, [accountId, clearSecrets, dropRetry, endpoint, router]);
  useEffect(() => {
    if (!open || denied) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible" && !submitting.current) void read(false); }, 15000);
    return () => window.clearInterval(timer);
  }, [open, denied, read]);
  async function refresh() { setBusy(true); const ok = await read(); if (active.current) { setBusy(false); if (ok) setNotice(""); } }

  async function chooseCapture(file: File | undefined) {
    const generation = ++captureGeneration.current;
    capture.current = null; setCaptureReady(false);
    if (!file) return;
    if (file.size > 98_304) { setNotice("The capture file is too large. Use a current session capture under 96 KB."); if (fileInput.current) fileInput.current.value = ""; return; }
    try {
      const parsed = parseCommandJson(new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()));
      if (!active.current || generation !== captureGeneration.current) return;
      const capturedOwner = object(parsed) && object(parsed.headers) ? String(parsed.headers.user_id ?? "") : "";
      const selectedOwner = connectionOwner(owner || capturedOwner);
      if (!selectedOwner || !connectionCapture(parsed, selectedOwner)) throw new Error("Invalid capture");
      capture.current = parsed; setCaptureReady(true); if (!owner) setOwner(capturedOwner);
      setNotice("Capture selected. Credentials will be saved only when you submit this form.");
    } catch { if (active.current && generation === captureGeneration.current) { setNotice("The capture does not match this owner or the supported Fastt session format."); if (fileInput.current) fileInput.current.value = ""; } }
  }
  async function send(command: ConnectionRequest) {
    if (submitting.current || !validConnectionRequest(command)) return;
    submitting.current = true; setBusy(true); setNotice("Saving account connection command…");
    let message = "Outcome not confirmed. Refresh the recorded status or retry the exact same command.";
    let uncertain = true, sessionLost = false;
    try {
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      if (!active.current) return;
      if ([401, 403].includes(response.status)) {
        sessionLost = true; sessionDenied.current = true; clearSecrets(); dropRetry(); setData(null); setOwner(""); setModelId(""); setDenied(true);
        setNotice("Your session cannot manage this account. Sign in again."); router.refresh(); return;
      }
      if (response.ok && parseConnectionAck(await response.json(), { ...command, accountId })) {
        uncertain = false;
        message = command.action === "save" ? "Credential save recorded. Check the refreshed verification and outgoing state."
          : command.action === "verify" ? "Verification requested. Refresh for the worker’s recorded result."
          : command.action === "pause" ? "Pause recorded. Check the refreshed outgoing state."
          : "Activation recorded. Check the refreshed outgoing state and limits.";
      } else if ([400, 404, 409, 413, 503].includes(response.status)) {
        uncertain = false; message = command.action === "save" ? "Save refused. Check the owner ID, that messages are not queued or sending right now, and that the proxy and capture are valid, then review the refreshed account." : "Command refused. Review the refreshed account, credentials and limits before trying again.";
      }
    } catch { /* Keep the exact retry in memory only, with no persistent browser storage. */ }
    finally {
      if (active.current && !sessionLost) {
        retry.current = uncertain ? command : null; setHasRetry(uncertain); clearSecrets();
        const refreshed = await read(); if (active.current) { if (sessionDenied.current) dropRetry(); if (refreshed) setNotice(message); setBusy(false); router.refresh(); }
      }
      if (active.current && sessionLost) setBusy(false);
      submitting.current = false;
    }
  }
  function saveCapture() {
    const ownerId = connectionOwner(owner);
    if (!data || !ownerId || !capture.current) return;
    if (!proxyEntry.ok) { setNotice(proxyEntry.message); return; }
    const command: ConnectionRequest = { action: "save", expectedRevision: data.revision, payload: { ownerId, capture: capture.current,
      xHash, proxyUrl: proxyEntry.url, expiresAt: new Date(Date.now() + Number(hours) * 3_600_000).toISOString(), model: modelEnabled ? { modelId, apiKey } : null } };
    if (!validConnectionRequest(command)) { setNotice("Review the owner, capture, hash, proxy and selected model details."); return; }
    void send(command);
  }
  function activate() {
    if (!data || !/^\d+$/.test(limit) || !/^\d+$/.test(throttle)) return;
    const command: ConnectionRequest = { action: "activate", expectedRevision: data.revision,
      payload: { limitUnits: Number(limit), throttleSeconds: Number(throttle), mediaEnabled: media, automateNewConversations: automateNew } };
    if (Number(limit) < data.usedUnits || !validConnectionRequest(command)) { setNotice("Enter a valid total allowance at least equal to used units, and a send interval from 1 to 86400 seconds."); return; }
    void send(command);
  }

  const state = connectionState(data);
  return <div className="mt-4 min-w-0 border-t border-line pt-4" data-of-connection-editor={accountId} onClick={event => event.stopPropagation()}>
    <button type="button" className={buttonClass} aria-expanded={open} disabled={busy || denied} data-of-connection-open
      onClick={() => { setOpen(!open); if (!open && !hasRetry) void refresh(); }}>Manage connection</button>
    {open ? <div className="mt-4 min-w-0">
      {notice ? <p role="status" className="mb-3 text-sm" data-of-connection-notice>{notice}</p> : null}
      {data && !denied ? <>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs" data-of-connection-status>
          <dt className="text-muted">Connection</dt><dd>{data.status === "unconfigured" ? "Not connected" : CONNECTION_LABELS[state]}</dd><dt className="text-muted">Outgoing messages</dt><dd>{data.outgoingEnabled ? state === "connected" ? "Enabled" : "Waiting for verification" : "Disabled"}</dd>
          <dt className="text-muted">Verified at</dt><dd className="break-words">{recordedTime(data.verifiedAt)}</dd><dt className="text-muted">Next verification deadline</dt><dd className="break-words">{recordedTime(data.expiresAt)}</dd>
          <dt className="text-muted">Used allowance</dt><dd>{data.usedUnits} / {data.limitUnits}</dd>
        </dl>
        <p className="mt-2 text-xs text-muted" data-of-connection-detail>{CONNECTION_DETAILS[state]}</p>
        {data.verifiedAt ? <p className="mt-1 text-xs text-muted">Successful background verification renews the deadline. An elapsed deadline alone does not confirm a logout.</p> : null}
        <ConnectionSyncStatus connection={data} state={state} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={buttonClass} disabled={busy} onClick={() => void refresh()} data-of-connection-refresh>Refresh status</button>
          {data.status !== "unconfigured" ? <button type="button" className={buttonClass} disabled={busy || hasRetry || state === "retrying" || state === "checking" && data.verifiedAt !== null} onClick={() => void send({ action: "verify", payload: {}, expectedRevision: data.revision })} data-of-connection-verify>Request verification</button> : null}
          {data.status !== "unconfigured" ? <button type="button" className={buttonClass} disabled={busy || hasRetry} onClick={() => void send({ action: "pause", payload: {}, expectedRevision: data.revision })} data-of-connection-pause>Pause outgoing</button> : null}
        </div>
        <form className="mt-5" autoComplete="off" onSubmit={event => { event.preventDefault(); saveCapture(); }}>
          <fieldset disabled={busy || hasRetry} className="min-w-0 space-y-3">
            <legend className="mb-2 text-sm font-semibold">1. Save account credentials</legend>
            <label className="block text-xs">OnlyFans owner ID<input data-of-connection-owner className={inputClass} inputMode="numeric" value={owner} disabled={data.ownerId !== null} onChange={event => setOwner(event.target.value)} required /></label>
            <label className="block text-xs">Fastt session capture (.json)<input data-of-connection-capture ref={fileInput} type="file" accept="application/json,.json" className={`${inputClass} text-xs`} onChange={event => void chooseCapture(event.target.files?.[0])} /></label>
            <label className="block text-xs">X-Hash<input data-of-connection-hash type="password" className={inputClass} autoComplete="new-password" value={xHash} onChange={event => setXHash(event.target.value)} required /></label>
            <label className="block text-xs">Fixed proxy (residential, same country as the creator)<input data-of-connection-proxy type="password" className={inputClass} autoComplete="new-password" placeholder="user:pass@host:port" value={proxy} onChange={event => setProxy(event.target.value)} />
              <span className="mt-1 block text-xs text-muted" data-of-connection-proxy-preview title={PROXY_RULE}>{proxyEntry.ok ? `Will be saved as: ${proxyEntry.masked}` : proxyEntry.message}</span></label>
            <p className="text-xs text-muted" data-of-connection-proxy-rule>{PROXY_RULE} Leaving the proxy empty saves the account with no proxy.</p>
            <label className="block text-xs">Initial verification window<select data-of-connection-expiry className={inputClass} value={hours} onChange={event => setHours(event.target.value)}>{[1, 6, 12, 24].map(value => <option key={value} value={value}>{value} {value === 1 ? "hour" : "hours"}</option>)}</select></label>
            <label className="flex items-start gap-2 text-xs"><input data-of-connection-model-enabled type="checkbox" checked={modelEnabled} onChange={event => setModelEnabled(event.target.checked)} /><span>Attach a model credential for automated replies</span></label>
            {modelEnabled ? <>
              <label className="block text-xs">Saved reply model ID<input data-of-connection-model-id className={inputClass} value={modelId} onChange={event => setModelId(event.target.value)} required /></label>
              <label className="block text-xs">Model API key<input data-of-connection-model-key type="password" autoComplete="new-password" className={inputClass} value={apiKey} onChange={event => setApiKey(event.target.value)} required /></label>
              <p className="text-xs text-muted">Use the exact model saved in <Link className="text-accent" href={`/onlyfans/settings?account=${encodeURIComponent(accountId)}`}>creator settings</Link>.</p>
            </> : null}
            <p className="text-xs text-muted">The capture is encrypted by the backend. Saving stages identity verification with outgoing messages disabled.</p>
            <button type="submit" data-of-connection-save className={buttonClass} disabled={!captureReady || !xHash || !connectionOwner(owner) || !proxyEntry.ok}>Save credentials</button>
          </fieldset>
        </form>
        <form className="mt-5" onSubmit={event => { event.preventDefault(); activate(); }}>
          <fieldset disabled={busy || hasRetry || state !== "connected"} className="min-w-0 space-y-3">
            <legend className="mb-2 text-sm font-semibold">2. Enable verified account</legend>
            <label className="block text-xs">Total send allowance, including {data.usedUnits} already used<input data-of-connection-limit className={inputClass} type="number" min={Math.max(1, data.usedUnits)} max={10000} step={1} value={limit} onChange={event => setLimit(event.target.value)} required /></label>
            <label className="block text-xs">Minimum seconds between sends<input data-of-connection-throttle className={inputClass} type="number" min={1} max={86400} step={1} value={throttle} onChange={event => setThrottle(event.target.value)} required /></label>
            <label className="flex items-start gap-2 text-xs"><input data-of-connection-media type="checkbox" checked={media} onChange={event => setMedia(event.target.checked)} /><span>Allow eligible paid media sends</span></label>
            <label className="flex items-start gap-2 text-xs"><input data-of-connection-automate-new type="checkbox" checked={automateNew} onChange={event => setAutomateNew(event.target.checked)} /><span>Automatically reply to new conversations</span></label>
            <p className="text-xs text-muted">Automatic replies require a saved matching model credential and creator settings. This option applies to new conversations received after activation; existing paused, takeover and no-contact conversations keep their saved state.</p>
            <p className="text-xs text-muted">Enabling outgoing permits this account’s worker to send messages within these limits. Used allowance is retained.</p>
            <button type="submit" className={buttonClass} data-of-connection-activate disabled={state !== "connected"}>Enable outgoing messages</button>
          </fieldset>
        </form>
      </> : null}
      {hasRetry && !denied ? <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={buttonClass} disabled={busy} data-of-connection-retry onClick={() => { if (retry.current) void send(retry.current); }}>Retry same command</button>
        <button type="button" className={buttonClass} disabled={busy || !data} onClick={() => { dropRetry(); setNotice("Review the recorded status before entering another command."); }}>Discard retry</button>
      </div> : null}
      {!data && !denied ? <button type="button" className={buttonClass} disabled={busy} onClick={() => void refresh()}>Refresh connection</button> : null}
    </div> : null}
  </div>;
}

export function RegisterConnection({ creators }: { creators: ConnectionCreator[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [creatorId, setCreatorId] = useState(""), [owner, setOwner] = useState(""), [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [denied, setDenied] = useState(false);
  const [retry, setRetry] = useState<ConnectionRegistration | null>(null);
  const active = useRef(false), submitting = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function register(command: ConnectionRegistration) {
    if (submitting.current || !validConnectionRegistration(command)) return;
    submitting.current = true; setBusy(true); setNotice("Registering the selected creator’s account…");
    try {
      const response = await fetch("/api/onlyfans-connections/accounts", { method: "POST", credentials: "same-origin", redirect: "error", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      if (!active.current) return;
      if ([401, 403].includes(response.status)) { setDenied(true); setRetry(null); setOwner(""); setHandle(""); setNotice("Sign in again before registering an account."); router.refresh(); return; }
      const ack = response.ok ? parseRegistrationAck(await response.json(), command) : null;
      if (ack) {
        setRetry(null); setNotice("Registration recorded. Check the account’s current connection and outgoing state.");
        router.push(`/onlyfans/accounts?creator=${encodeURIComponent(command.creatorId)}&account=${encodeURIComponent(ack.accountId)}`); router.refresh();
      } else if ([400, 404, 409, 413, 503].includes(response.status)) { setRetry(null); setNotice("Registration refused. Check the existing creator and account owner."); }
      else { setRetry(command); setNotice("Registration outcome not confirmed. Retry the same registration."); }
    } catch { if (active.current) { setRetry(command); setNotice("Registration outcome not confirmed. Retry the same registration."); } }
    finally { if (active.current) setBusy(false); submitting.current = false; }
  }
  return <Card className="mb-5 min-w-0 p-4" data-of-register-connection>
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-semibold">Your next connection.</h2><p className="mt-2 text-sm text-muted">Add OnlyFans to an existing creator profile.</p></div><button type="button" className={buttonClass} aria-expanded={open} onClick={() => setOpen(!open)} disabled={busy || denied}>Add OnlyFans account</button></div>
    <p className="mt-3 text-xs text-muted">Creators can sign in through Platforms → Connect OnlyFans in their creator account. Use this form for administrator-assisted setup.</p>
    {open ? <div className="mt-4">
      {notice ? <p role="status" className="mb-3 text-sm" data-of-registration-notice>{notice}</p> : null}
      {!creators.length ? <p className="text-sm text-muted">Existing Twin creators could not be loaded. Refresh the dashboard to try again.</p> : null}
      {!denied && creators.length ? <form onSubmit={event => { event.preventDefault(); const ownerId = connectionOwner(owner); if (ownerId) void register({ creatorId, ownerId, handle: handle.trim().replace(/^@/, "") }); }}>
        <fieldset disabled={busy || !!retry} className="grid min-w-0 gap-3 sm:grid-cols-3">
          <label className="min-w-0 text-sm">Existing Twin creator<select data-of-register-creator className={inputClass} value={creatorId} onChange={event => setCreatorId(event.target.value)} required><option value="" disabled>Select creator</option>{creators.map(creator => <option key={creator.id} value={creator.id}>{creator.name}</option>)}</select></label>
          <label className="min-w-0 text-sm">OnlyFans owner ID<input data-of-register-owner className={inputClass} inputMode="numeric" value={owner} onChange={event => setOwner(event.target.value)} required /></label>
          <label className="min-w-0 text-sm">OnlyFans handle<input data-of-register-handle className={inputClass} value={handle} onChange={event => setHandle(event.target.value)} maxLength={160} /></label>
          <div className="sm:col-span-3"><p className="mb-3 text-xs text-muted">Registers an account for the selected existing creator. Then save a session capture and verify the account before enabling outgoing messages.</p><button type="submit" data-of-register-submit className={buttonClass} disabled={!creatorId || !connectionOwner(owner)}>Register disabled account</button></div>
        </fieldset>
      </form> : null}
      {retry && !denied ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={busy} data-of-register-retry onClick={() => void register(retry)}>Retry same registration</button><button type="button" className={buttonClass} disabled={busy} onClick={() => setRetry(null)}>Discard retry</button></div> : null}
    </div> : null}
  </Card>;
}
