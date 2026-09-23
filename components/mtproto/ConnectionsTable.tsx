"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Info } from "@/components/clone/fields";
import { setConnectionDailyCapAction, setConnectionLiveEnabledAction, setConnectionPausedAction } from "@/app/mtproto-campaign/actions";
import type { AutoHaltInfo, CreatorLite, UserbotConnection } from "@/lib/mtproto/types";
import { CreatorAvatar, EmptyBlock, Meter, StatusPill, When } from "./kit";
import { CONNECTION_INFO, num, timeAgo } from "./view";
import TelegramLoginControl from "./TelegramLoginControl";

type ConnRow = { creator: CreatorLite; connection: UserbotConnection; autoHalt: AutoHaltInfo | null; resumePhrase: string; goLivePhrase: string; sentToday?: number | null };

const inputCls = "h-9 min-w-0 rounded-lg border border-line bg-panel px-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent-2 focus:ring-2 focus:ring-accent-2/20";

// One card per creator: who is connected, whether they can send, today's cap,
// and the three controls (LIVE/DRY, change cap, pause/resume). Every rule is
// unchanged and still enforced server-side: the cap is 1 to 100, resuming an
// auto-halt needs its typed phrase, and switching a creator to LIVE needs its
// own typed phrase. The server re-checks both before writing.
//
// LIVE/DRY is the loudest thing on the card on purpose. It is the switch that
// decides whether real messages reach real fans from this creator's own
// Telegram account, so the mode is stated in words at the top, the card is
// ringed red while it is LIVE, and going live costs a typed phrase. Going back
// to DRY is one click, always.
function ConnectionCard({ row }: { row: ConnRow }) {
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
    // Server re-checks this phrase; the field is only where it is collected.
    if (confirmText) fd.set("confirmText", confirmText);
    send(fd, setConnectionPausedAction, () => {
      setResuming(false);
      setTyped("");
    });
  };

  // Server re-checks the phrase; the field is only where it is collected.
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
    if (!Number.isInteger(dailyCap) || dailyCap <= 0 || dailyCap > 100) {
      setError("Daily cap must be a whole number between 1 and 100");
      return;
    }
    const fd = new FormData();
    fd.set("cloneId", creator.id);
    fd.set("dailyCap", String(dailyCap));
    send(fd, setConnectionDailyCapAction, () => setEditingCap(false));
  };

  const status = CONNECTION_INFO[connection.status];
  const sent = row.sentToday ?? null;

  return (
    <div
      className={`flex flex-col rounded-2xl border bg-panel p-4 shadow-[var(--shadow-card)] ${connection.paused ? "border-crit/40" : "border-line"} ${
        connection.liveEnabled ? "ring-2 ring-crit/50" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <CreatorAvatar id={creator.id} name={creator.name} className="size-11 text-sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-heading text-base font-semibold text-ink">{creator.name}</div>
          <div className="truncate text-xs text-muted">{creator.businessUsername ? `Business bot @${creator.businessUsername.replace(/^@/, "")}` : "No business bot name on file"}</div>
        </div>
        <StatusPill tone={status.tone} dot title={status.hint}>
          {status.label}
        </StatusPill>
      </div>

      <div
        className={`mt-3 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
          connection.liveEnabled ? "border-crit/50 bg-crit/10" : "border-line bg-muted/5"
        }`}
      >
        <span className="flex items-center gap-1.5">
          {connection.liveEnabled ? (
            <StatusPill solid dot>LIVE</StatusPill>
          ) : (
            <StatusPill tone="neutral" dot>DRY RUN</StatusPill>
          )}
          <span className={`text-xs font-semibold ${connection.liveEnabled ? "text-crit" : "text-muted"}`}>
            {connection.liveEnabled ? "Real messages go to real fans" : "Nothing is actually sent"}
          </span>
          <Info
            text={
              connection.liveEnabled
                ? "This creator's Telegram account can send real messages to real fans. A live run still needs its own GO LIVE confirmation, and the worker still needs to be started in live mode, before anything goes out. Switch back to DRY RUN at any time."
                : "This creator is dry run only. Fans are still scanned, messages are still written and everything is still recorded, but nothing leaves the Telegram account. Switching to LIVE needs a typed confirmation."
            }
          />
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            Connected as
            <Info text="The Telegram account this creator logged in with. Messages are sent from this account, not from the Business Bot." />
          </dt>
          <dd className="mt-0.5 text-ink">{connection.tgUserId != null ? <span className="font-mono text-[13px]">Telegram account #{connection.tgUserId}</span> : <span className="text-muted">Nobody logged in yet</span>}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Last seen online</dt>
          <dd className="mt-0.5 text-ink">
            <When iso={connection.lastSeenAt} relative={timeAgo(connection.lastSeenAt)} />
          </dd>
        </div>
      </dl>

      <TelegramLoginControl
        cloneId={creator.id}
        creatorName={creator.name}
        connected={connection.status === "connected"}
      />

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted">
          <span className="flex items-center gap-1">
            Daily cap
            <Info text="The most messages this creator's account may send per day. Lower is safer for the account. Between 1 and 100." />
          </span>
          {editingCap ? null : (
            <span className="tabular-nums">
              {sent != null && <span className="text-sm font-semibold text-ink">{num(sent)}</span>}
              {sent != null ? " sent of " : ""}
              <span className={sent != null ? "" : "text-sm font-semibold text-ink"}>{connection.dailyCap}</span>
              {sent == null ? " per day" : " today"}
            </span>
          )}
        </div>
        {editingCap ? (
          <div className="flex items-center gap-2">
            <input type="number" min={1} max={100} step={1} value={capText} onChange={(e) => setCapText(e.target.value)} aria-label={`Daily cap for ${creator.name}`} className={`${inputCls} w-24`} autoFocus />
            <Button size="lg" className="h-9" onClick={saveCap} disabled={pending}>
              Save
            </Button>
            <Button size="lg" variant="ghost" className="h-9" onClick={() => { setEditingCap(false); setCapText(String(connection.dailyCap)); }} disabled={pending}>
              Cancel
            </Button>
          </div>
        ) : (
          <Meter value={sent ?? 0} max={connection.dailyCap} />
        )}
      </div>

      <div className="mt-4">
        {connection.paused && autoHalt ? (
          <div className="space-y-0.5 rounded-xl border border-crit/40 bg-crit/10 px-3 py-2.5">
            <span className="inline-block rounded bg-crit px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">AUTO-HALTED</span>
            <div className="text-sm font-semibold text-crit">{autoHalt.label}</div>
            <div className="text-xs text-muted">{autoHalt.explanation}</div>
            {autoHalt.tripped ? <div className="text-xs font-medium text-ink">{autoHalt.tripped}</div> : <div className="text-xs text-warn">Halt numbers unavailable (no matching halt event found).</div>}
            {autoHalt.threshold && <div className="text-xs text-muted">{autoHalt.threshold}</div>}
            {autoHalt.haltedAt && (
              <div className="text-xs text-muted">
                Halted <When iso={autoHalt.haltedAt} relative={timeAgo(autoHalt.haltedAt)} />
              </div>
            )}
          </div>
        ) : connection.paused ? (
          <div className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2.5 text-sm">
            <StatusPill tone="warn" dot>Paused by hand</StatusPill>
            {connection.pausedReason && <div className="mt-1 text-xs text-muted">{connection.pausedReason}</div>}
          </div>
        ) : (
          <StatusPill tone="good" dot>Sending is on</StatusPill>
        )}
      </div>

      {resuming && (
        <div className="mt-3 rounded-xl border border-crit/40 bg-panel p-3">
          <div className="text-xs font-semibold text-crit">This account was halted by a safety check. Resuming needs a typed confirmation.</div>
          <div className="mt-0.5 text-[11px] text-muted">
            Type <span className="font-mono font-semibold text-ink">{row.resumePhrase}</span> to confirm you have looked at why it stopped.
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={row.resumePhrase} aria-label={`Type ${row.resumePhrase} to resume`} className={`${inputCls} flex-1`} />
            <Button size="lg" className="h-9" onClick={() => resume(typed)} disabled={pending || !typed.trim()}>
              Resume
            </Button>
            <Button size="lg" variant="ghost" className="h-9" onClick={() => { setResuming(false); setTyped(""); }} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {goingLive && (
        <div className="mt-3 rounded-xl border border-crit/50 bg-panel p-3">
          <div className="text-xs font-semibold text-crit">Switching {creator.name} to LIVE lets this account send real messages to real fans.</div>
          <div className="mt-0.5 text-[11px] text-muted">
            Type <span className="font-mono font-semibold text-ink">{row.goLivePhrase}</span> to confirm.
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              autoFocus
              value={liveTyped}
              onChange={(e) => setLiveTyped(e.target.value)}
              placeholder={row.goLivePhrase}
              aria-label={`Type ${row.goLivePhrase} to switch ${creator.name} to live sending`}
              className={`${inputCls} flex-1`}
            />
            <Button size="lg" variant="destructive" className="h-9" onClick={() => setLive(true, liveTyped)} disabled={pending || !liveTyped.trim()}>
              Go live
            </Button>
            <Button size="lg" variant="ghost" className="h-9" onClick={() => { setGoingLive(false); setLiveTyped(""); }} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="mt-3 rounded-lg border border-crit/40 bg-crit/10 px-3 py-2 text-xs font-medium text-crit">
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {connection.liveEnabled ? (
          <Button size="lg" variant="outline" className="h-9 rounded-lg" onClick={() => setLive(false)} disabled={pending}>
            Switch to dry run
          </Button>
        ) : (
          !goingLive && (
            <Button size="lg" variant="destructive" className="h-9 rounded-lg" onClick={() => setGoingLive(true)} disabled={pending}>
              Switch to live (type phrase)
            </Button>
          )
        )}
        {!editingCap && (
          <Button size="lg" variant="outline" className="h-9 rounded-lg" onClick={() => setEditingCap(true)} disabled={pending}>
            Change cap
          </Button>
        )}
        {connection.paused ? (
          autoHalt ? (
            !resuming && (
              <Button size="lg" className="h-9 rounded-lg" onClick={() => setResuming(true)} disabled={pending}>
                Resume (type phrase)
              </Button>
            )
          ) : (
            <Button size="lg" className="h-9 rounded-lg" onClick={() => resume()} disabled={pending}>
              Resume sending
            </Button>
          )
        ) : (
          <Button size="lg" variant="destructive" className="h-9 rounded-lg" onClick={pause} disabled={pending}>
            Pause sending
          </Button>
        )}
      </div>
    </div>
  );
}

export default function ConnectionsTable({ rows }: { rows: ConnRow[] }) {
  if (rows.length === 0) {
    return <EmptyBlock icon="◌" title="No creators yet" hint="Creators appear here once they exist in the dashboard. Each one gets its own Telegram login." />;
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      {rows.map((r) => (
        <ConnectionCard key={r.creator.id} row={r} />
      ))}
    </div>
  );
}
