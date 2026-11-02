"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Info } from "@/components/clone/fields";
import { setConnectionDailyCapAction, setConnectionLiveEnabledAction, setConnectionPausedAction } from "@/app/mtproto-campaign/actions";
import { HARD_MAX_DAILY_CAP } from "@/lib/mtproto/types";
import type { AutoHaltInfo, CreatorLite, UserbotConnection } from "@/lib/mtproto/types";
import { CreatorAvatar, Meter, StatusPill, When } from "./kit";
import { connectionStatusInfo, num, timeAgo } from "./view";

export type SettingsConnRow = { creator: CreatorLite; connection: UserbotConnection; autoHalt: AutoHaltInfo | null; resumePhrase: string; goLivePhrase: string; sentToday: number | null };

const inputCls = "h-9 min-w-0 rounded-lg border border-line bg-panel px-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent-2 focus:ring-2 focus:ring-accent-2/20";

// Same rules as the git-history ConnectionsTable this was adapted from
// (2026-09-23: those per-girl controls moved here, to Settings, and were
// compacted from a grid of cards into a table). Every gate is unchanged and
// still enforced server-side: the cap is 1 to HARD_MAX_DAILY_CAP, resuming an
// auto-halt needs its typed phrase, switching a creator to LIVE needs its own
// typed phrase, going back to DRY or resuming a manual pause is never gated.
function ConnRowView({ row }: { row: SettingsConnRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { creator, connection, autoHalt } = row;
  const [error, setError] = useState<string | null>(null);
  const [editingCap, setEditingCap] = useState(false);
  const [capText, setCapText] = useState(String(connection.dailyCap));
  const [resuming, setResuming] = useState(false);
  const [typed, setTyped] = useState("");
  const [goingLive, setGoingLive] = useState(false);
  const [liveTyped, setLiveTyped] = useState("");

  const send = (fd: FormData, action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action(fd);
        if (!result.ok) setError(result.error ?? "failed");
        else onOk?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed");
      }
      router.refresh();
    });
  };

  const pause = () => {
    const fd = new FormData();
    fd.set("cloneId", creator.id);
    fd.set("paused", "true");
    send(fd, setConnectionPausedAction);
  };

  const resume = (confirmText?: string) => {
    const fd = new FormData();
    fd.set("cloneId", creator.id);
    fd.set("paused", "false");
    if (confirmText) fd.set("confirmText", confirmText);
    send(fd, setConnectionPausedAction, () => {
      setResuming(false);
      setTyped("");
    });
  };

  const setLive = (liveEnabled: boolean, confirmText?: string) => {
    const fd = new FormData();
    fd.set("cloneId", creator.id);
    fd.set("liveEnabled", String(liveEnabled));
    if (confirmText) fd.set("confirmText", confirmText);
    send(fd, setConnectionLiveEnabledAction, () => {
      setGoingLive(false);
      setLiveTyped("");
    });
  };

  const saveCap = () => {
    const dailyCap = Number(capText);
    if (!Number.isInteger(dailyCap) || dailyCap <= 0 || dailyCap > HARD_MAX_DAILY_CAP) {
      setError(`Daily cap must be a whole number between 1 and ${HARD_MAX_DAILY_CAP}`);
      return;
    }
    const fd = new FormData();
    fd.set("cloneId", creator.id);
    fd.set("dailyCap", String(dailyCap));
    send(fd, setConnectionDailyCapAction, () => setEditingCap(false));
  };

  const status = connectionStatusInfo(connection);
  const sent = row.sentToday;

  return (
    <div className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-3">
        <CreatorAvatar id={creator.id} name={creator.name} className="size-8 shrink-0 text-xs" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{creator.name}</span>
        <StatusPill tone={status.tone} dot title={status.hint}>
          {status.label}
        </StatusPill>
        {connection.liveEnabled ? (
          <StatusPill solid dot title="Real messages go to real fans from this account.">
            LIVE
          </StatusPill>
        ) : (
          <StatusPill tone="neutral" dot title="Dry run only. Nothing leaves the Telegram account.">
            DRY RUN
          </StatusPill>
        )}
        {connection.paused && (autoHalt ? <StatusPill tone="crit" dot>AUTO-HALTED</StatusPill> : <StatusPill tone="warn" dot>Paused</StatusPill>)}

        <div className="ml-auto flex items-center gap-1.5">
          {connection.liveEnabled ? (
            <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => setLive(false)} disabled={pending}>
              Switch to dry
            </Button>
          ) : (
            !goingLive && (
              <Button size="sm" variant="destructive" className="h-8 rounded-lg" onClick={() => setGoingLive(true)} disabled={pending}>
                Go live
              </Button>
            )
          )}
          {connection.paused ? (
            autoHalt ? (
              !resuming && (
                <Button size="sm" className="h-8 rounded-lg" onClick={() => setResuming(true)} disabled={pending}>
                  Resume
                </Button>
              )
            ) : (
              <Button size="sm" className="h-8 rounded-lg" onClick={() => resume()} disabled={pending}>
                Resume
              </Button>
            )
          ) : (
            <Button size="sm" variant="destructive" className="h-8 rounded-lg" onClick={pause} disabled={pending}>
              Pause
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 pl-11 text-xs text-muted">
        <span className="flex items-center gap-1">
          Last seen <When iso={connection.lastSeenAt} relative={timeAgo(connection.lastSeenAt)} />
        </span>
        <span className="flex min-w-[9rem] flex-1 items-center gap-2">
          <span className="flex items-center gap-1 whitespace-nowrap">
            Cap
            <Info text={`The most messages this creator's account may send per day. Lower is safer for the account. Between 1 and ${HARD_MAX_DAILY_CAP}.`} />
          </span>
          {editingCap ? (
            <span className="flex items-center gap-1.5">
              <input type="number" min={1} max={HARD_MAX_DAILY_CAP} step={1} value={capText} onChange={(e) => setCapText(e.target.value)} aria-label={`Daily cap for ${creator.name}`} className={`${inputCls} h-7 w-20 px-2`} autoFocus />
              <Button size="sm" className="h-7 px-2" onClick={saveCap} disabled={pending}>Save</Button>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setEditingCap(false); setCapText(String(connection.dailyCap)); }} disabled={pending}>Cancel</Button>
            </span>
          ) : (
            <button type="button" onClick={() => setEditingCap(true)} className="flex items-center gap-1.5 text-ink hover:underline">
              <span className="tabular-nums">{sent != null ? `${num(sent)} of ` : ""}{connection.dailyCap}{sent == null ? "/day" : ""}</span>
              <span className="w-16"><Meter value={sent ?? 0} max={connection.dailyCap} /></span>
            </button>
          )}
        </span>
      </div>

      {connection.paused && autoHalt && (
        <div className="ml-11 rounded-lg border border-crit/40 bg-crit/10 px-3 py-2 text-xs">
          <span className="font-semibold text-crit">{autoHalt.label}.</span> <span className="text-muted">{autoHalt.explanation}</span>
          {autoHalt.tripped && <div className="mt-0.5 font-medium text-ink">{autoHalt.tripped}</div>}
        </div>
      )}

      {resuming && (
        <div className="ml-11 rounded-lg border border-crit/40 bg-panel p-2.5">
          <div className="text-xs font-semibold text-crit">Type {row.resumePhrase} to confirm.</div>
          <div className="mt-1.5 flex items-center gap-2">
            <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={row.resumePhrase} aria-label={`Type ${row.resumePhrase} to resume`} className={`${inputCls} flex-1`} />
            <Button size="sm" className="h-9" onClick={() => resume(typed)} disabled={pending || !typed.trim()}>Resume</Button>
            <Button size="sm" variant="ghost" className="h-9" onClick={() => { setResuming(false); setTyped(""); }} disabled={pending}>Cancel</Button>
          </div>
        </div>
      )}

      {goingLive && (
        <div className="ml-11 rounded-lg border border-crit/50 bg-panel p-2.5">
          <div className="text-xs font-semibold text-crit">Real messages to real fans. Type {row.goLivePhrase} to confirm.</div>
          <div className="mt-1.5 flex items-center gap-2">
            <input autoFocus value={liveTyped} onChange={(e) => setLiveTyped(e.target.value)} placeholder={row.goLivePhrase} aria-label={`Type ${row.goLivePhrase} to switch ${creator.name} to live`} className={`${inputCls} flex-1`} />
            <Button size="sm" variant="destructive" className="h-9" onClick={() => setLive(true, liveTyped)} disabled={pending || !liveTyped.trim()}>Go live</Button>
            <Button size="sm" variant="ghost" className="h-9" onClick={() => { setGoingLive(false); setLiveTyped(""); }} disabled={pending}>Cancel</Button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="ml-11 rounded-lg border border-crit/40 bg-crit/10 px-2.5 py-1.5 text-xs font-medium text-crit">
          {error}
        </div>
      )}
    </div>
  );
}

export default function SettingsConnectionsTable({ rows }: { rows: SettingsConnRow[] }) {
  if (rows.length === 0) return <div className="px-4 py-6 text-center text-sm text-muted">No creators yet.</div>;
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-panel">
      {rows.map((r) => (
        <ConnRowView key={r.creator.id} row={r} />
      ))}
    </div>
  );
}
