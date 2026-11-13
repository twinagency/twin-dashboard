"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import { connectionState, CONNECTION_LABELS, CONNECTION_DETAILS } from "@/lib/onlyfans-connections/presentation";
import { normalizeProxyInput, PROXY_RULE } from "@/lib/onlyfans-connections/proxy";
import ConnectionSyncStatus from "./ConnectionSyncStatus";
import AdminOnlyFansSignIn from "./AdminOnlyFansSignIn";
import LoginMethodChoice, { type LoginMethod } from "./LoginMethodChoice";
import { parseCommandJson } from "@/lib/onlyfans/command-json";
import { connectionCapture, connectionCaptureRef, connectionOwner, object, parseConnection, parseConnectionAck, parseRegistrationAck,
  validConnectionRefSave, validConnectionRequest, validConnectionRegistration, type Connection, type ConnectionCreator,
  type ConnectionRefSave, type ConnectionRequest, type ConnectionRegistration } from "@/lib/onlyfans-connections/contract";
import { BROWSERBASE_TERMINAL, browserbaseState, parseHeldBrowserbaseJob, type BrowserbaseState } from "@/lib/onlyfans-connections/browserbase";

const inputClass = "mt-1 w-full min-w-0 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink disabled:opacity-50";
const buttonClass = "rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50";
const primaryClass = "rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const BROWSERBASE_POLL_MS = 2000, BROWSERBASE_POLL_FAILURES = 5, BROWSERBASE_DEADLINE_MS = 11 * 60_000;
const BROWSERBASE_STATUS: Record<BrowserbaseState, string> = {
  starting: "Starting the Browserbase browser…", waiting_login: "Sign in to OnlyFans in the hosted browser. The session is captured automatically after login.",
  capturing: "Logged in. Capturing the session…", done: "Session captured.", failed: "Browserbase login failed.",
  cancelled: "Browserbase login cancelled.", expired: "The Browserbase login expired. Start it again.",
};
type BrowserbaseView = { jobId: string; state: BrowserbaseState; liveViewUrl: string | null; error: string | null };
const RETRY_LABELS: Record<ConnectionRequest["action"], string> = { save: "Retry credential save", session: "Retry session update",
  verify: "Retry verification request", pause: "Retry pause", activate: "Retry enabling outgoing" };
const recordedTime = (value: string | null) => value ? new Date(value).toLocaleString() : "Not recorded";

export default function ConnectionEditor({ accountId,creatorId,creatorName,initiallyOpen = false }: { accountId: string;creatorId?:string;creatorName?:string;initiallyOpen?:boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(initiallyOpen), [busy, setBusy] = useState(false), [denied, setDenied] = useState(false);
  const [data, setData] = useState<Connection | null>(null), [notice, setNotice] = useState("");
  const [owner, setOwner] = useState(""), [xHash, setXHash] = useState(""), [proxy, setProxy] = useState("");
  const [modelEnabled, setModelEnabled] = useState(false), [modelId, setModelId] = useState(""), [apiKey, setApiKey] = useState("");
  const [hours, setHours] = useState("6"), [captureReady, setCaptureReady] = useState(false);
  // Ref mode: the capture is held server-side under this handle (the reply's captureId); Save sends it as payload.captureRef.
  const [captureRef, setCaptureRef] = useState<string | null>(null);
  const [curlText, setCurlText] = useState(""), [curlBusy, setCurlBusy] = useState(false);
  const [bb, setBb] = useState<BrowserbaseView | null>(null), [bbBusy, setBbBusy] = useState(false);
  const [method, setMethod] = useState<LoginMethod>("browser"), [bbHidden, setBbHidden] = useState(false);
  const bbActive = !!bb && !BROWSERBASE_TERMINAL.includes(bb.state);
  const bbOpen = bbActive && !!bb?.liveViewUrl && !bbHidden;
  const bbDialog = useRef<HTMLDivElement | null>(null);
  useEffect(() => { // modal: focus in on open, give focus back on close
    if (!bbOpen) return;
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    bbDialog.current?.querySelector<HTMLElement>("button")?.focus();
    return () => { if (back?.isConnected) back.focus(); };
  }, [bbOpen]);
  function bbDialogKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); setBbHidden(true); return; }
    if (event.key !== "Tab" || !bbDialog.current) return;
    const items = [...bbDialog.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),iframe")];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1], at = document.activeElement;
    if (event.shiftKey && (at === first || at === bbDialog.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && at === last) { event.preventDefault(); first.focus(); }
  }
  const [limit, setLimit] = useState(""), [throttle, setThrottle] = useState(""), [media, setMedia] = useState(false);
  // The action an unconfirmed command would repeat; the Retry button names it.
  const [retryAction, setRetryAction] = useState<ConnectionRequest["action"] | null>(null), hasRetry = retryAction !== null;
  const proxyEntry = useMemo(() => normalizeProxyInput(proxy), [proxy]);
  const active = useRef(false), submitting = useRef(false), sessionDenied = useRef(false);
  const capture = useRef<Record<string, unknown> | null>(null), retry = useRef<ConnectionRequest | ConnectionRefSave | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const statusTarget = useRef<HTMLDivElement>(null);
  const captureGeneration = useRef(0);
  const bbRun = useRef(0), bbTimer = useRef<number | null>(null), bbDeadline = useRef(0);
  const endpoint = `/api/onlyfans-connections/accounts/${encodeURIComponent(accountId)}`;
  /** Best-effort cancel that survives unmount and tab close; the outcome is not awaited. */
  const bbFireCancel = (jobId: string) => void fetch(`${endpoint}/browserbase-login/${encodeURIComponent(jobId)}/cancel`, { method: "POST", credentials: "same-origin", cache: "no-store", keepalive: true,
    headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => undefined);
  const clearSecrets = useCallback(() => {
    captureGeneration.current++; capture.current = null; setCaptureRef(null); setCaptureReady(false); setXHash(""); setProxy(""); setApiKey("");
    if (fileInput.current) fileInput.current.value = "";
  }, []);
  // Curl and Browserbase captures follow chooseCapture's rule: a recorded or typed owner must match. Read through a ref because a
  // Browserbase poll runs in the closure of the click that started it.
  const expectedOwner = useRef(""); expectedOwner.current = data?.ownerId ?? owner;
  /** True (and nothing held) when `ownerId` is not the recorded or typed owner. */
  const refuseOtherOwner = (ownerId: number, source: string) => {
    const expected = expectedOwner.current;
    if (!expected || connectionOwner(expected) === ownerId) return false;
    captureGeneration.current++; capture.current = null; setCaptureRef(null); setCaptureReady(false);
    setNotice(`${source} is for another OnlyFans account (owner ${ownerId}), not owner ${expected}. Sign in as this account and try again.`);
    return true;
  };
  /** Holds a curl or Browserbase capture by its server-side handle only; the server supplies capture and X-Hash on save. */
  const holdCapture = (ownerId: number, ref: string) => {
    capture.current = null; setCaptureRef(ref); setXHash(""); setCaptureReady(true); setOwner(String(ownerId));
  };
  const dropRetry = useCallback(() => { retry.current = null; setRetryAction(null); }, []);
  useEffect(() => { active.current = true; return () => { active.current = false; capture.current = null; retry.current = null; bbRun.current++; if (bbTimer.current !== null) window.clearTimeout(bbTimer.current);
    const open = bbLive.current; if (open) bbFireCancel(open); }; }, []);
  // Leaving the page must not strand a paid Browserbase session: cancel the open job on unmount.
  const bbLive = useRef<string | null>(null);
  useEffect(() => { bbLive.current = bb && !BROWSERBASE_TERMINAL.includes(bb.state) ? bb.jobId : null; }, [bb]);
  useEffect(() => { // closing the tab never unmounts React: cancel on pagehide too
    const onHide = () => { const open = bbLive.current; if (!open) return; bbLive.current = null; bbFireCancel(open); };
    window.addEventListener("pagehide", onHide); return () => window.removeEventListener("pagehide", onHide);
  }, [endpoint]);
  /** The refreshed connection, or null. A transient failure keeps the last-known connection and revision, so Pause stays. */
  const read = useCallback(async (updateForm = true): Promise<Connection | null> => {
    try {
      const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store", redirect: "error" });
      if (!active.current) return null;
      if ([401, 403].includes(response.status)) {
        sessionDenied.current = true; clearSecrets(); dropRetry(); setOwner(""); setModelId(""); setData(null); setDenied(true);
        setNotice("Your session cannot manage this account. Sign in again."); router.refresh(); return null;
      }
      const next = response.ok ? parseConnection(await response.json(), accountId, true) : null;
      if (!active.current) return null;
      if (!next) { setNotice("Connection status could not be refreshed. Try again."); return null; }
      setData(next); if (updateForm) { setOwner(next.ownerId ?? ""); setLimit(next.limitUnits ? String(next.limitUnits) : ""); setThrottle(next.throttleSeconds ? String(next.throttleSeconds) : ""); setMedia(next.mediaEnabled); }
      return next;
    } catch { if (active.current) setNotice("Connection status could not be refreshed. Try again."); return null; }
  }, [accountId, clearSecrets, dropRetry, endpoint, router]);
  useEffect(() => {
    if (initiallyOpen) { setOpen(true); void read(); }
  }, [initiallyOpen, read]);
  useEffect(() => {
    if (initiallyOpen && data?.accountId) {
      statusTarget.current?.scrollIntoView({ block: "start" });
      statusTarget.current?.focus({ preventScroll: true });
    }
  }, [initiallyOpen, data?.accountId]);
  useEffect(() => {
    if (!open || denied) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible" && !submitting.current) void read(false); }, 15000);
    return () => window.clearInterval(timer);
  }, [open, denied, read]);
  async function refresh() { setBusy(true); const ok = await read(); if (active.current) { setBusy(false); if (ok) setNotice(""); } }

  async function chooseCapture(file: File | undefined) {
    const generation = ++captureGeneration.current;
    capture.current = null; setCaptureRef(null); setCaptureReady(false);
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
  async function applyCurl() {
    const text = curlText.trim();
    if (!text || curlBusy) return;
    const generation = ++captureGeneration.current;
    capture.current = null; setCaptureRef(null); setCaptureReady(false); setCurlBusy(true);
    setNotice("Reading the pasted curl… deriving signing rules.");
    try {
      const response = await fetch(`${endpoint}/capture-from-curl`, { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ curl: text }) });
      if (!active.current || generation !== captureGeneration.current) return;
      if ([401, 403].includes(response.status)) {
        sessionDenied.current = true; clearSecrets(); dropRetry(); setData(null); setOwner(""); setModelId(""); setDenied(true);
        setNotice("Your session cannot manage this account. Sign in again."); router.refresh(); return;
      }
      const payload = response.ok ? await response.json() as { ok?: boolean; ownerId?: unknown; captureId?: unknown } : null;
      const ownerId = payload && Number.isSafeInteger(payload.ownerId) ? payload.ownerId as number : null;
      const ref = payload && connectionCaptureRef(payload.captureId) ? payload.captureId : null;
      if (!payload || payload.ok !== true || !ownerId || !ref) {
        setNotice("That curl could not be used. Copy a fresh curl from the Fastt Login Capture extension (or a signed /api2/v2/* request from DevTools) and paste it again."); return;
      }
      if (refuseOtherOwner(ownerId, "That curl")) return;
      holdCapture(ownerId, ref); setCurlText("");
      setNotice("Curl applied: session captured and owner filled in. Set the proxy and window if needed, then Save credentials.");
    } catch { if (active.current && generation === captureGeneration.current) setNotice("The curl could not be converted. Check the connection and try again."); }
    finally { if (active.current) setCurlBusy(false); }
  }
  function stopBrowserbasePoll() { bbRun.current++; if (bbTimer.current !== null) window.clearTimeout(bbTimer.current); bbTimer.current = null; }
  function denyBrowserbase() {
    sessionDenied.current = true; clearSecrets(); dropRetry(); setData(null); setOwner(""); setModelId(""); setDenied(true); setBb(null);
    setNotice("Your session cannot manage this account. Sign in again."); router.refresh();
  }
  async function startBrowserbase() {
    if (bbBusy || bb && !BROWSERBASE_TERMINAL.includes(bb.state)) return;
    stopBrowserbasePoll(); const run = bbRun.current; bbDeadline.current = Date.now() + BROWSERBASE_DEADLINE_MS;
    setBb(null); setBbHidden(false); setMethod("browser"); setBbBusy(true); setNotice("Starting a Browserbase login…");
    try {
      const response = await fetch(`${endpoint}/browserbase-login`, { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
        headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!active.current || run !== bbRun.current) return;
      if ([401, 403].includes(response.status)) { denyBrowserbase(); return; }
      const payload = await response.json().catch(() => null) as { code?: unknown } | null;
      if (!active.current || run !== bbRun.current) return;
      if (response.status === 503 && payload?.code === "browserbase_unconfigured") {
        setNotice("Browserbase login is not configured on this server. Use the Fastt Login Capture extension or paste a curl instead."); return;
      }
      if (response.status === 429 && payload?.code === "browserbase_busy") { setNotice("Too many Browserbase logins are running. Try again in a few minutes."); return; }
      const job = response.ok ? parseHeldBrowserbaseJob(payload) : null;
      if (!job) { setNotice("The Browserbase login could not be started. Try again."); return; }
      setBb({ jobId: job.jobId, state: job.state, liveViewUrl: job.liveViewUrl, error: job.error }); setNotice("");
      if (!BROWSERBASE_TERMINAL.includes(job.state)) bbTimer.current = window.setTimeout(() => void pollBrowserbase(job.jobId, run, 0), BROWSERBASE_POLL_MS);
    } catch { if (active.current && run === bbRun.current) setNotice("The Browserbase login could not be started. Check the connection and try again."); }
    finally { if (active.current) setBbBusy(false); }
  }
  async function pollBrowserbase(jobId: string, run: number, failures: number) {
    bbTimer.current = null;
    if (!active.current || run !== bbRun.current) return;
    const again = (count: number) => { if (active.current && run === bbRun.current) bbTimer.current = window.setTimeout(() => void pollBrowserbase(jobId, run, count), BROWSERBASE_POLL_MS); };
    // Stop watching locally, but never strand a paid session: cancel first, then mark it ended.
    const end = (state: "failed" | "expired", message: string) => {
      if (!active.current || run !== bbRun.current) return;
      bbLive.current = null; bbFireCancel(jobId); setBb(view => view && { ...view, state, error: null }); setNotice(message);
    };
    const giveUp = (message: string) => end("failed", message);
    const unreadable = "The Browserbase login status could not be read. Start it again.";
    if (Date.now() >= bbDeadline.current) { end("expired", "The Browserbase login took too long and was stopped. Start it again."); return; }
    try {
      const response = await fetch(`${endpoint}/browserbase-login/${encodeURIComponent(jobId)}`, { credentials: "same-origin", cache: "no-store", redirect: "error" });
      if (!active.current || run !== bbRun.current) return;
      if ([401, 403].includes(response.status)) { denyBrowserbase(); return; }
      const payload = response.ok ? await response.json().catch(() => null) as unknown : null;
      if (!active.current || run !== bbRun.current) return;
      const job = parseHeldBrowserbaseJob(payload, jobId);
      if (!job) {
        const doneButInvalid = typeof payload === "object" && payload !== null && (payload as { state?: unknown }).state === "done";
        if (doneButInvalid) giveUp("The Browserbase capture could not be used. Start the login again, or paste a curl instead.");
        else if (response.status === 404 || failures + 1 >= BROWSERBASE_POLL_FAILURES) giveUp(unreadable);
        else again(failures + 1);
        return;
      }
      const otherOwner = job.state === "done" && refuseOtherOwner(job.ownerId, "The Browserbase login");
      setBb({ jobId, state: otherOwner ? "failed" : job.state, liveViewUrl: job.liveViewUrl, error: otherOwner ? null : job.error });
      if (otherOwner) return;
      if (job.state === "done") {
        captureGeneration.current++; // newest capture wins over any curl or file still being read
        holdCapture(job.ownerId, job.captureId);
        setNotice("Logged in via Browserbase: session captured and owner filled in. Set the proxy and window if needed, then Save credentials.");
        return;
      }
      if (!BROWSERBASE_TERMINAL.includes(job.state)) again(0);
    } catch { if (failures + 1 >= BROWSERBASE_POLL_FAILURES) giveUp(unreadable); else again(failures + 1); }
  }
  async function cancelBrowserbase() {
    const job = bb; if (!job || BROWSERBASE_TERMINAL.includes(job.state) || bbBusy) return;
    stopBrowserbasePoll(); const run = bbRun.current;
    // Not confirmed: the job stays live (unmount/pagehide still cancel it) and polling resumes.
    const unconfirmed = () => {
      setNotice("The cancel was not confirmed. The login is still open; try Cancel again.");
      bbTimer.current = window.setTimeout(() => void pollBrowserbase(job.jobId, run, 0), BROWSERBASE_POLL_MS);
    };
    setBbBusy(true);
    try {
      const response = await fetch(`${endpoint}/browserbase-login/${encodeURIComponent(job.jobId)}/cancel`, { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
        headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!active.current || run !== bbRun.current) return;
      if ([401, 403].includes(response.status)) { denyBrowserbase(); return; }
      const payload = response.ok ? await response.json().catch(() => null) as { ok?: unknown; state?: unknown } | null : null;
      if (!active.current || run !== bbRun.current) return;
      const state = payload?.ok === true ? browserbaseState(payload.state) : null;
      if (state === "done") { void pollBrowserbase(job.jobId, run, 0); return; } // finished before the cancel landed: collect the capture
      if (state && BROWSERBASE_TERMINAL.includes(state)) { setBb({ ...job, state }); setNotice(""); return; }
      unconfirmed();
    } catch { if (active.current && run === bbRun.current) unconfirmed(); }
    finally { if (active.current) setBbBusy(false); }
  }
  async function send(command: ConnectionRequest | ConnectionRefSave) {
    if (submitting.current || !validConnectionRequest(command) && !validConnectionRefSave(command)) return;
    submitting.current = true; setBusy(true); setNotice("Saving account connection command…");
    let message = "Outcome not confirmed. Refresh the recorded status or retry the exact same command.";
    let uncertain = true, sessionLost = false, expired = false, refused = false;
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
      } else if (response.status === 410 && (await response.json().catch(() => null) as { code?: unknown } | null)?.code === "capture_expired") {
        uncertain = false; expired = true; message = "That capture expired. If an earlier attempt may have saved, check the status below. Otherwise capture the session again.";
      } else if ([400, 404, 409, 413, 503].includes(response.status)) {
        uncertain = false; refused = true; message = command.action === "save" ? "Save refused. Check the owner ID, that messages are not queued or sending right now, and that the proxy and capture are valid, then review the refreshed account." : "Command refused. Review the refreshed account, credentials and limits before trying again.";
      }
    } catch { /* Keep the exact retry in memory only, with no persistent browser storage. */ }
    finally {
      if (active.current && !sessionLost) {
        // A refused pause changed nothing, so an earlier unconfirmed command keeps its retry and the forms stay held.
        if (!(refused && command.action === "pause")) { retry.current = uncertain ? command : null; setRetryAction(uncertain ? command.action : null); }
        if (expired) { setCaptureRef(null); setCaptureReady(false); } else clearSecrets(); // expiry keeps the typed proxy and model key
        const refreshed = await read(); if (active.current) { if (sessionDenied.current) dropRetry(); if (refreshed || (expired && !sessionDenied.current)) setNotice(message); setBusy(false); router.refresh(); }
      }
      if (active.current && sessionLost) setBusy(false);
      submitting.current = false;
    }
  }
  function saveCapture() {
    const ownerId = connectionOwner(owner), raw = capture.current;
    if (!data || !ownerId || !captureRef && !raw) return;
    if (!proxyEntry.ok) { setNotice(proxyEntry.message); return; }
    const rest = { ownerId, proxyUrl: proxyEntry.url, expiresAt: new Date(Date.now() + Number(hours) * 3_600_000).toISOString(), model: modelEnabled ? { modelId, apiKey } : null };
    const command = { action: "save" as const, expectedRevision: data.revision, payload: captureRef ? { ...rest, captureRef } : { ...rest, capture: raw, xHash } };
    if (!validConnectionRefSave(command) && !validConnectionRequest(command)) { setNotice("Review the owner, capture, hash, proxy and selected model details."); return; }
    void send(command);
  }
  /** An unconfirmed command may have landed and moved the revision: read it first so the stop is not refused as stale. */
  async function pause() {
    if (submitting.current || !data) return;
    setBusy(true);
    const fresh = await read(false);
    if (!active.current) return;
    setBusy(false);
    if (sessionDenied.current) return;
    void send({ action: "pause", payload: {}, expectedRevision: (fresh ?? data).revision });
  }
  function activate() {
    if (!data || !/^\d+$/.test(limit) || !/^\d+$/.test(throttle)) return;
    const command: ConnectionRequest = { action: "activate", expectedRevision: data.revision,
      payload: { limitUnits: Number(limit), throttleSeconds: Number(throttle), mediaEnabled: media, automateNewConversations: false } };
    if (Number(limit) < data.usedUnits || !validConnectionRequest(command)) { setNotice("Enter a valid total allowance at least equal to used units, and a send interval from 1 to 86400 seconds."); return; }
    void send(command);
  }

  const state = connectionState(data);
  return <div ref={statusTarget} tabIndex={-1} id={`connection-${accountId}`} className="mt-4 min-w-0 scroll-mt-24 border-t border-line pt-4" data-of-connection-editor={accountId} onClick={event => event.stopPropagation()}>
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
        {data.lastError ? <details className="mt-2 text-xs" data-of-connection-error><summary>Recorded connection error</summary><code className="mt-1 block break-all">{data.lastError}</code></details> : null}
        {data.verifiedAt ? <p className="mt-1 text-xs text-muted">Successful background verification renews the deadline. An elapsed deadline alone does not confirm a logout.</p> : null}
        <ConnectionSyncStatus connection={data} state={state} operator /* mounted only for managing operators (AccountsView: !agencyConnections && !readOnly); server strips cost unless internalOperator */ />
        <div className="mt-3 flex flex-wrap gap-2">
          {creatorId && creatorName ? <AdminOnlyFansSignIn creators={[{id:creatorId,name:creatorName}]} accountId={accountId} /> : null}
          <button type="button" className={buttonClass} disabled={busy} onClick={() => void refresh()} data-of-connection-refresh>Refresh status</button>
          {data.status !== "unconfigured" ? <button type="button" className={buttonClass} disabled={busy || hasRetry || state === "retrying" || state === "checking" && data.verifiedAt !== null} onClick={() => void send({ action: "verify", payload: {}, expectedRevision: data.revision })} data-of-connection-verify>Request verification</button> : null}
          {data.status !== "unconfigured" ? <button type="button" className={buttonClass} disabled={busy} onClick={() => void pause()} data-of-connection-pause>Pause outgoing</button> : null}
        </div>
        <form className="mt-5" autoComplete="off" onSubmit={event => { event.preventDefault(); saveCapture(); }}>
          <fieldset disabled={busy || hasRetry} className="min-w-0 space-y-3">
            <legend className="mb-2 text-sm font-semibold">1. Save account credentials</legend>
            <label className="block text-xs">OnlyFans owner ID<input data-of-connection-owner className={inputClass} inputMode="numeric" value={owner} disabled={data.ownerId !== null} onChange={event => setOwner(event.target.value)} required /></label>
            <LoginMethodChoice value={method} onChange={setMethod} disabled={bbBusy || bbActive} panels={{
              browser: <div className="min-w-0" data-of-connection-browserbase-panel>
                <p className="mb-3 text-xs text-muted">Opens OnlyFans in a hosted browser. Sign in there (2FA included) and the session is captured for you. Your password never passes through Twin.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" data-of-connection-browserbase className={primaryClass} disabled={busy || bbBusy || bbActive} onClick={() => void startBrowserbase()}>{bbBusy && !bb ? "Starting browser…" : bb?.state === "done" ? "Log in again" : "Log in with Browserbase"}</button>
                </div>
              </div>,
              extension: <div className="min-w-0 space-y-3">
                <ol className="list-decimal space-y-1 pl-4 text-xs text-muted">
                  <li>Download and unzip the extension.</li>
                  <li>Open <code>chrome://extensions</code>, turn on Developer mode, click Load unpacked.</li>
                  <li>Sign in to OnlyFans in that Chrome, open the extension, Copy curl, paste it below.</li>
                </ol>
                <a data-of-connection-extension className={`${buttonClass} inline-block no-underline`} href="/downloads/fastt-login-capture.zip" download>⬇ Download Fastt Login Capture</a>
                <label className="block text-xs">Paste curl — from the extension, or a signed <code>/api2/v2/*</code> request from DevTools
                  <textarea data-of-connection-curl className={`${inputClass} h-24 font-mono text-xs`} value={curlText} placeholder="curl 'https://onlyfans.com/api2/v2/…' -H 'user-id: …' -H 'x-bc: …' -H 'sign: …' -b '…'" onChange={event => setCurlText(event.target.value)} /></label>
                <button type="button" data-of-connection-curl-apply className={primaryClass} disabled={busy || curlBusy || !curlText.trim()} onClick={() => void applyCurl()}>{curlBusy ? "Reading curl…" : "Use pasted curl"}</button>
              </div>,
              file: <label className="block text-xs">Fastt session capture (.json)<input data-of-connection-capture ref={fileInput} type="file" accept="application/json,.json" className={`${inputClass} text-xs`} onChange={event => void chooseCapture(event.target.files?.[0])} /></label>,
            }} />
            {bb ? <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-line p-2" data-of-connection-browserbase-bar>
              <p role="status" className={`w-full min-w-0 basis-full text-xs ${bb.state === "done" ? "font-semibold text-[#1a7f37]" : bb.state === "failed" || bb.state === "expired" ? "text-[#b42318]" : ""}`} data-of-connection-browserbase-status data-state={bb.state}>{bb.state === "done" ? "✓ " : ""}{BROWSERBASE_STATUS[bb.state]}{bb.state === "failed" && bb.error ? ` ${bb.error}` : ""}</p>
              {bbActive && bb.liveViewUrl && bbHidden ? <button type="button" data-of-connection-browserbase-show className={buttonClass} onClick={() => setBbHidden(false)}>Show browser</button> : null}
              {bbActive && (!bb.liveViewUrl || bbHidden) ? <button type="button" data-of-connection-browserbase-cancel className={buttonClass} disabled={bbBusy} onClick={() => void cancelBrowserbase()}>Cancel</button> : null}
            </div> : null}
            <label className="block text-xs">X-Hash<input data-of-connection-hash type="password" className={inputClass} autoComplete="new-password" value={xHash} disabled={!!captureRef} placeholder={captureRef ? "Taken from the capture" : undefined} onChange={event => setXHash(event.target.value)} required /></label>
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
            <button type="submit" data-of-connection-save className={buttonClass} disabled={!captureReady || !captureRef && !xHash || !connectionOwner(owner) || !proxyEntry.ok}>Save credentials</button>
          </fieldset>
        {bbOpen && bb?.liveViewUrl ? createPortal(<div ref={bbDialog} tabIndex={-1} onKeyDown={bbDialogKey} className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4 outline-none" data-of-connection-browserbase-overlay role="dialog" aria-modal="true" aria-label="Sign in to OnlyFans">
          <div className="flex h-full max-h-[860px] w-full max-w-[1200px] flex-col overflow-hidden rounded-xl border border-line bg-card shadow-2xl">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Sign in to OnlyFans</p><p className="text-xs text-muted">{BROWSERBASE_STATUS[bb.state]}</p></div>
              <a data-of-connection-browserbase-open className={`${buttonClass} no-underline`} href={bb.liveViewUrl} target="_blank" rel="noopener noreferrer">Open in new tab</a>
              <button type="button" className={buttonClass} onClick={() => setBbHidden(true)}>Minimise</button>
              <button type="button" data-of-connection-browserbase-cancel className={buttonClass} disabled={bbBusy} onClick={() => void cancelBrowserbase()}>Cancel</button>
            </div>
            <iframe data-of-connection-browserbase-frame src={bb.liveViewUrl} title="Browserbase OnlyFans login" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              referrerPolicy="no-referrer" className="block min-h-0 w-full flex-1 bg-white" />
          </div>
        </div>, document.body) : null}
        </form>
        <form className="mt-5" onSubmit={event => { event.preventDefault(); activate(); }}>
          <fieldset disabled={busy || hasRetry || state !== "connected"} className="min-w-0 space-y-3">
            <legend className="mb-2 text-sm font-semibold">2. Enable verified account</legend>
            <label className="block text-xs">Total send allowance, including {data.usedUnits} already used<input data-of-connection-limit className={inputClass} type="number" min={Math.max(1, data.usedUnits)} max={10000} step={1} value={limit} onChange={event => setLimit(event.target.value)} required /></label>
            <label className="block text-xs">Minimum seconds between sends<input data-of-connection-throttle className={inputClass} type="number" min={1} max={86400} step={1} value={throttle} onChange={event => setThrottle(event.target.value)} required /></label>
            <label className="flex items-start gap-2 text-xs"><input data-of-connection-media type="checkbox" checked={media} onChange={event => setMedia(event.target.checked)} /><span>Allow eligible paid media sends</span></label>
            <p className="text-xs text-muted" data-of-connection-automate-new-note>New conversations are never enabled automatically; enable each fan in the inbox.</p>
            <p className="text-xs text-muted">Enabling outgoing permits this account’s worker to send messages within these limits. Used allowance is retained.</p>
            <button type="submit" className={buttonClass} data-of-connection-activate disabled={state !== "connected"}>Enable outgoing messages</button>
          </fieldset>
        </form>
      </> : null}
      {hasRetry && !denied ? <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={buttonClass} disabled={busy} data-of-connection-retry onClick={() => { if (retry.current) void send(retry.current); }}>{RETRY_LABELS[retryAction!]}</button>
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
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-semibold">Your next connection.</h2><p className="mt-2 text-sm text-muted">Add a creator or connect an existing creator to OnlyFans.</p></div><div className="flex flex-wrap gap-2"><AdminOnlyFansSignIn creators={creators} /><button type="button" className={buttonClass} aria-expanded={open} onClick={() => setOpen(!open)} disabled={busy || denied}>Manual session setup</button></div></div>
    <p className="mt-3 text-xs text-muted">Choose Add OnlyFans account to sign in from this admin dashboard. Manual registration and session import remain available below.</p>
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

