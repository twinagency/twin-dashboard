"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseVaultProcessingRead, parseVaultProcessingAck, type VaultProcessingStatus } from "./vault-processing";
import { processingActive, processingPollDelay, type SyncLite } from "./vault-processing-view";
import type { VaultProcessingAction } from "./vault";

export type ProcessingLoad = "loading" | "ready" | "unavailable" | "denied";
/** Status polling with backoff plus the four commands. The server owns identity; this sends a nonce, an action and media IDs only. */
export function useVaultProcessing(accountId: string, options: { sync?: SyncLite | null; fetchImpl?: typeof fetch; enabled?: boolean } = {}) {
  const { sync = null, fetchImpl, enabled = true } = options;
  const [status, setStatus] = useState<VaultProcessingStatus | null>(null);
  const [load, setLoad] = useState<ProcessingLoad>("loading");
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const alive = useRef(true), generation = useRef(0), failures = useRef(0), unchanged = useRef(0), last = useRef(""), inflight = useRef(false), commanding = useRef(false), deniedRef = useRef(false);
  const syncRef = useRef<SyncLite | null>(sync); syncRef.current = sync;
  const statusRef = useRef<VaultProcessingStatus | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doFetch = fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const url = `/api/onlyfans-content/accounts/${encodeURIComponent(accountId)}/vault/processing`;
  const apply = useCallback((next: VaultProcessingStatus) => {
    const signature = JSON.stringify(next);
    unchanged.current = signature === last.current ? unchanged.current + 1 : 0; last.current = signature;
    statusRef.current = next; setStatus(next); setLoad("ready"); failures.current = 0;
  }, []);
  const read = useCallback(async (): Promise<boolean> => {
    if (inflight.current) return false;
    const mine = generation.current; inflight.current = true;
    try {
      const response = await doFetch(url, { credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
      if (!alive.current || mine !== generation.current) return false;
      if (response.status === 401 || response.status === 403) { statusRef.current = null; setStatus(null); setLoad("denied"); deniedRef.current = true; return false; }
      const next = response.ok ? parseVaultProcessingRead(await response.json(), accountId) : null;
      if (!alive.current || mine !== generation.current) return false;
      if (!next) { failures.current++; setLoad(statusRef.current ? "ready" : "unavailable"); return false; }
      apply(next); return true;
    } catch { if (alive.current && mine === generation.current) { failures.current++; setLoad(statusRef.current ? "ready" : "unavailable"); } return false; }
    finally { inflight.current = false; }
  }, [accountId, apply, url]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!enabled) return;
    alive.current = true; deniedRef.current = false; generation.current++; failures.current = 0; unchanged.current = 0; last.current = ""; statusRef.current = null;
    setStatus(null); setLoad("loading"); setNotice("");
    const tick = async () => {
      if (!alive.current) return;
      if (document.visibilityState !== "hidden" && !commanding.current) await read();
      if (!alive.current) return;
      if (!deniedRef.current) timer.current = setTimeout(tick, processingPollDelay({ active: processingActive(statusRef.current, syncRef.current), failures: failures.current, unchanged: unchanged.current }));
    };
    void tick();
    return () => { alive.current = false; generation.current++; if (timer.current) clearTimeout(timer.current); };
  }, [accountId, enabled, read]);
  const command = useCallback(async (action: VaultProcessingAction, mediaIds?: string[]) => {
    if (commanding.current) return;
    commanding.current = true; setBusy(true); setNotice("Sending…");
    let message = "Outcome not confirmed. Check the status below before trying again.";
    try {
      const response = await doFetch(url, { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: crypto.randomUUID(), action, ...(mediaIds ? { mediaIds } : {}) }) });
      if (!alive.current) return;
      if (response.status === 401 || response.status === 403) { setLoad("denied"); deniedRef.current = true; setStatus(null); statusRef.current = null; message = "Your session cannot manage this vault. Sign in again."; }
      else {
        const body: unknown = response.ok ? await response.json() : null;
        const ack = parseVaultProcessingAck(body, { accountId });
        if (ack) { message = ACK_NOTICE[action]; if (ack.processing) apply(ack.processing); }
        else if ([400, 404, 409, 413, 503].includes(response.status)) message = "The request was refused. Refresh and review the current status.";
      }
    } catch { /* A lost reply cannot prove the command did not commit; the re-read below shows the truth. */ }
    finally {
      if (alive.current) { setNotice(message); setBusy(false); commanding.current = false; void read(); } else commanding.current = false;
    }
  }, [accountId, apply, read, url]); // eslint-disable-line react-hooks/exhaustive-deps
  return { status, load, busy, notice, refresh: read, command };
}
const ACK_NOTICE: Record<VaultProcessingAction, string> = {
  pause: "Description paused. Items already in flight may still finish.", resume: "Description resumed.",
  retry: "Unresolved items were queued to retry.", redescribe: "Selected items were queued to be described again.",
};
