"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldLabel, Toggle, inputCls, selectCls } from "@/components/clone/fields";
import { MONEY_KEYS, type SettingKey } from "@/lib/tsocial";
import { approvePost, dismissReports, hideReported, rejectPost, saveSetting, setAccountBanned, setAccountPlan, setAccountVerified } from "./actions";

function useRun() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<void>) => {
    setError(null);
    start(async () => { try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } });
  };
  return { pending, error, run };
}

const Err = ({ text }: { text: string | null }) => (text ? <span className="text-xs text-crit">{text}</span> : null);

export function ReviewControls({ postId }: { postId: string }) {
  const { pending, error, run } = useRun();
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <Button size="sm" disabled={pending} onClick={() => run(() => approvePost(postId))}>Approve</Button>
      <input className={inputCls} value={reason} maxLength={200} placeholder="Reject reason" onChange={(e) => setReason(e.target.value)} />
      <Button size="sm" variant="destructive" disabled={pending || !reason.trim()} onClick={() => run(() => rejectPost(postId, reason))}>Reject</Button>
      <Err text={error} />
    </div>
  );
}

export function ReportControls({ kind, itemId }: { kind: "clip" | "chat"; itemId: string }) {
  const { pending, error, run } = useRun();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => hideReported(kind, itemId))}>Hide</Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => dismissReports(kind, itemId))}>Dismiss</Button>
      <Err text={error} />
    </div>
  );
}

export function AccountControls({ id, banned, verified, plan }: { id: string; banned: boolean; verified: boolean; plan: string }) {
  const { pending, error, run } = useRun();
  const [isBanned, setBanned] = useState(banned);
  const [isVerified, setVerified] = useState(verified);
  const [curPlan, setPlan] = useState(plan);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Toggle label="Verified" name={`verified-${id}`} checked={isVerified} disabled={pending} accent="soft"
        onChange={(v) => { const p = isVerified; setVerified(v); run(async () => { try { await setAccountVerified(id, v); } catch (e) { setVerified(p); throw e; } }); }} />
      {curPlan !== "paid" ? (
        <select className={selectCls + " !w-24"} value={curPlan} disabled={pending} aria-label="Plan"
          onChange={(e) => { const next = e.target.value as "free" | "staff"; const p = curPlan; setPlan(next); run(async () => { try { await setAccountPlan(id, next); } catch (e2) { setPlan(p); throw e2; } }); }}>
          <option value="free">free</option>
          <option value="staff">staff</option>
        </select>
      ) : (
        <>
          <span className="text-xs text-muted">paid</span>
          <Button size="xs" variant="outline" disabled={pending}
            onClick={() => run(async () => { await setAccountPlan(id, "free"); setPlan("free"); })}>Set free</Button>
        </>
      )}
      <Button size="sm" variant={isBanned ? "outline" : "destructive"} disabled={pending}
        onClick={() => run(async () => { await setAccountBanned(id, !isBanned); setBanned(!isBanned); })}>{isBanned ? "Unban" : "Ban"}</Button>
      <Err text={error} />
    </div>
  );
}

export function SettingRow({ settingKey, label, hint, initial, multiline }: { settingKey: SettingKey; label: string; hint: string; initial: string; multiline?: boolean }) {
  const { pending, error, run } = useRun();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const money = (MONEY_KEYS as readonly string[]).includes(settingKey);
  const dirty = value !== saved;
  const save = (confirmed: boolean) => run(async () => {
    await saveSetting(settingKey, value, confirmed);
    setSaved(value);
    setConfirming(false);
  });
  return (
    <div className="flex flex-col gap-1">
      <label className="block min-w-0">
        <FieldLabel label={label} hint={hint} />
        {multiline ? (
          <textarea className={inputCls} rows={3} value={value} onChange={(e) => { setValue(e.target.value); setConfirming(false); }} />
        ) : (
          <input className={inputCls} value={value} onChange={(e) => { setValue(e.target.value); setConfirming(false); }} />
        )}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {!confirming ? (
          <Button size="sm" disabled={!dirty || pending} onClick={() => (money ? setConfirming(true) : save(false))}>Save</Button>
        ) : (
          <>
            <span className="text-xs text-ink">Change {label} from {saved === "" ? "empty" : saved} to {value === "" ? "empty" : value}?</span>
            <Button size="sm" disabled={pending} onClick={() => save(true)}>Confirm</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>Cancel</Button>
          </>
        )}
        <Err text={error} />
      </div>
    </div>
  );
}
