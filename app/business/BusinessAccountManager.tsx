"use client";
import { ReadOnlyEditor } from "@/components/DashboardAccessProvider";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/clone/fields";

// Drives app/api/business-account/route.ts: read the live connection + granted
// rights + CURRENT profile values, then perform one action at a time
// (name/username/bio/photo/story). Every action is gated client side on the
// right the connection actually granted (fetched fresh on load), AND
// re-checked server side right before the Telegram call, so a stale UI never
// lets an action through the API only to fail there. See route.ts for why:
// business bot rights can be revoked or granted from her side at any time.
//
// Laid out like Telegram's own Edit Profile screen on purpose (2026-09-01
// rework, previous version was blank fields with no current values shown):
// one photo, tap to replace, name/username/bio stacked underneath prefilled
// with what's live right now, each with its own inline Save that only
// enables once you've actually changed something.

type Rights = Record<string, boolean>;
type Account = { id: number | null; firstName: string | null; lastName: string | null; username: string | null; bio: string | null };
type Status =
  | { loading: true }
  | { loading: false; connected: false; error: string }
  | {
      loading: false;
      connected: true;
      isEnabled: boolean;
      businessConnectionId: string;
      rights: Rights;
      account: Account;
    };

function BizPhoto({ cloneId, telegramId, name, size = 84 }: { cloneId: string; telegramId: number | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    setFailed(false);
    setSrc(telegramId != null ? `/api/avatar?clone=${encodeURIComponent(cloneId)}&tg=${telegramId}&t=${Date.now()}` : null);
  }, [cloneId, telegramId]);
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "?";
  if (failed || !src) {
    return (
      <span
        className="creator-name flex shrink-0 items-center justify-center rounded-full bg-muted/20 font-semibold text-muted"
        style={{ height: size, width: size, fontSize: size / 3 }}
      >
        {initials}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full object-cover"
      style={{ height: size, width: size }}
    />
  );
}

export default function BusinessAccountManager({ cloneId }: { cloneId: string }) {
  const [status, setStatus] = useState<Status>({ loading: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ action: string; ok: boolean; message: string } | null>(null);

  function load() {
    setStatus({ loading: true });
    fetch(`/api/business-account?cloneId=${cloneId}`)
      .then((r) => r.json())
      .then((d) => setStatus({ loading: false, ...d }))
      .catch((e) => setStatus({ loading: false, connected: false, error: e instanceof Error ? e.message : String(e) }));
  }
  useEffect(load, [cloneId]);

  async function act(action: string, build: (fd: FormData) => void) {
    setBusy(action);
    setResult(null);
    try {
      const fd = new FormData();
      fd.set("cloneId", cloneId);
      fd.set("action", action);
      build(fd);
      const res = await fetch("/api/business-account", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok || j.error) {
        setResult({ action, ok: false, message: j.error ?? `failed (${res.status})` });
      } else {
        setResult({ action, ok: true, message: "Done." });
        load();
      }
    } catch (e) {
      setResult({ action, ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  if (status.loading) {
    return (
      <div className="text-ink">
        <h1 className="mb-4 text-2xl font-semibold">Business account</h1>
        <div className="text-sm text-muted">Loading connection…</div>
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div className="text-ink">
        <h1 className="mb-4 text-2xl font-semibold">Business account</h1>
        <Card className="p-4 text-sm text-warn">{status.error}</Card>
      </div>
    );
  }

  const { rights, account, isEnabled } = status;
  const fullName = [account.firstName, account.lastName].filter(Boolean).join(" ") || "(no name)";

  return (
    <div className="text-ink">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-2xl font-semibold">Business account</h1>
        <span
          className="cursor-help text-sm text-muted"
          title="Edits her live Telegram Business profile: name, username, bio, photo and stories. Every field below shows what's actually live right now. Each action requires the matching right in her Chatbot Permissions and is logged to /logs."
        >
          ⓘ
        </span>
        <span className={"ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium " + (isEnabled ? "bg-good/15 text-good" : "bg-crit/15 text-crit")}>
          {isEnabled ? "Connection active" : "Connection disabled"}
        </span>
      </div>

      {result && (
        <div className={"mb-4 rounded-md border px-3 py-2 text-xs " + (result.ok ? "border-good/30 bg-good/10 text-good" : "border-crit/30 bg-crit/10 text-crit")}>
          {result.message}
        </div>
      )}

      <Card className="mb-4 p-5">
        <div className="mb-5 flex items-center gap-4">
          <PhotoEditor
            cloneId={cloneId}
            account={account}
            fullName={fullName}
            disabled={!rights.can_edit_profile_photo}
            busy={busy === "photo" || busy === "removePhoto"}
            onSet={(fd) => act("photo", (f) => { f.set("file", fd.get("file") as Blob); f.set("isPublic", fd.get("isPublic") as string); })}
            onRemove={() => act("removePhoto", (f) => f.set("isPublic", "false"))}
          />
          <div className="min-w-0">
            <div className="creator-name truncate text-lg font-semibold">{fullName}</div>
            <div className="creator-name truncate text-sm text-muted">{account.username ? `@${account.username}` : "no username set"}</div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <NameField
            disabled={!rights.can_edit_name}
            busy={busy === "name"}
            firstName={account.firstName ?? ""}
            lastName={account.lastName ?? ""}
            onSave={(firstName, lastName) => act("name", (f) => { f.set("firstName", firstName); f.set("lastName", lastName); })}
          />
          <UsernameField
            disabled={!rights.can_edit_username}
            busy={busy === "username"}
            current={account.username ?? ""}
            onSave={(username) => act("username", (f) => f.set("username", username))}
          />
          <div className="sm:col-span-2">
            <BioField
              disabled={!rights.can_edit_bio}
              busy={busy === "bio"}
              current={account.bio ?? ""}
              onSave={(bio) => act("bio", (f) => f.set("bio", bio))}
            />
          </div>
        </div>
      </Card>

      <StoryCard busy={busy === "story"} disabled={!rights.can_manage_stories} onSubmit={(fd) => act("story", (f) => { for (const [k, v] of fd.entries()) f.set(k, v); })} />
    </div>
  );
}

// One field row: shows the CURRENT live value, only turns its Save button on
// once the user actually edits it away from that value.
function FieldShell({
  label,
  hint,
  disabled,
  children,
}: {
  label: string;
  hint: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-xs font-semibold text-muted">{label}</span>
        <span className="cursor-help text-[11px] text-muted" title={hint}>ⓘ</span>
        {disabled && <span className="ml-auto rounded-full bg-muted/10 px-2 py-0.5 text-[10px] text-muted">not granted</span>}
      </div>
      {children}
    </div>
  );
}

function NameField({
  disabled,
  busy,
  firstName,
  lastName,
  onSave,
}: {
  disabled: boolean;
  busy: boolean;
  firstName: string;
  lastName: string;
  onSave: (firstName: string, lastName: string) => void;
}) {
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);
  useEffect(() => { setFirst(firstName); setLast(lastName); }, [firstName, lastName]);
  const dirty = first !== firstName || last !== lastName;
  return (
    <FieldShell label="Name" hint="First and last name shown on her Telegram Business account. Requires the Change name permission." disabled={disabled}>
      <fieldset disabled={disabled || busy} className="flex flex-col gap-2 disabled:opacity-50">
        <input className={inputCls} value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" maxLength={64} />
        <input className={inputCls} value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name (optional)" maxLength={64} />
        <Button type="button" size="sm" disabled={!dirty || !first.trim()} onClick={() => onSave(first.trim(), last.trim())}>
          {busy ? "Saving…" : "Save name"}
        </Button>
      </fieldset>
    </FieldShell>
  );
}

function UsernameField({
  disabled,
  busy,
  current,
  onSave,
}: {
  disabled: boolean;
  busy: boolean;
  current: string;
  onSave: (username: string) => void;
}) {
  const [value, setValue] = useState(current);
  useEffect(() => setValue(current), [current]);
  const dirty = value !== current;
  return (
    <FieldShell label="Username" hint="Her @handle. Clear it and save to remove entirely. Requires the Change username permission." disabled={disabled}>
      <fieldset disabled={disabled || busy} className="flex flex-col gap-2 disabled:opacity-50">
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted">@</span>
          <input className={inputCls} value={value} onChange={(e) => setValue(e.target.value.replace(/^@/, ""))} placeholder="username" maxLength={32} />
        </div>
        <Button type="button" size="sm" disabled={!dirty} onClick={() => onSave(value.trim())}>
          {busy ? "Saving…" : "Save username"}
        </Button>
      </fieldset>
    </FieldShell>
  );
}

function BioField({
  disabled,
  busy,
  current,
  onSave,
}: {
  disabled: boolean;
  busy: boolean;
  current: string;
  onSave: (bio: string) => void;
}) {
  const [value, setValue] = useState(current);
  useEffect(() => setValue(current), [current]);
  const dirty = value !== current;
  return (
    <FieldShell label="Bio" hint="Her Telegram bio, up to 140 characters. Clear it and save to remove entirely. Requires the Change bio permission." disabled={disabled}>
      <fieldset disabled={disabled || busy} className="flex flex-col gap-2 disabled:opacity-50">
        <textarea className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Bio" maxLength={140} rows={2} />
        <Button type="button" size="sm" disabled={!dirty} onClick={() => onSave(value.trim())} className="self-start">
          {busy ? "Saving…" : "Save bio"}
        </Button>
      </fieldset>
    </FieldShell>
  );
}

function PhotoEditor({
  cloneId,
  account,
  fullName,
  disabled,
  busy,
  onSet,
  onRemove,
}: {
  cloneId: string;
  account: Account;
  fullName: string;
  disabled: boolean;
  busy: boolean;
  onSet: (fd: FormData) => void;
  onRemove: () => void;
}) {
  const [isPublic, setIsPublic] = useState(false);
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <label
        className={
          "group relative block cursor-pointer rounded-full " + (disabled || busy ? "pointer-events-none opacity-60" : "")
        }
        title={disabled ? "She hasn't granted the Change profile photo permission" : "Click to upload a new profile photo"}
      >
        <BizPhoto cloneId={cloneId} telegramId={account.id} name={fullName} size={84} />
        {!disabled && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-[10px] font-medium text-transparent transition group-hover:bg-black/40 group-hover:text-white">
            {busy ? "…" : "Change"}
          </span>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={disabled || busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const fd = new FormData();
            fd.set("file", file);
            fd.set("isPublic", isPublic ? "true" : "false");
            onSet(fd);
          }}
        />
      </label>
      <label className="flex items-center gap-1 text-[10px] text-muted">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} disabled={disabled || busy} />
        Public
      </label>
      <button
        type="button"
        className="text-[10px] text-muted underline decoration-dotted disabled:opacity-50"
        disabled={disabled || busy || account.id == null}
        onClick={onRemove}
      >
        Remove
      </button>
    </div>
  );
}

const STORY_PERIODS = [
  { value: 21600, label: "6 hours" },
  { value: 43200, label: "12 hours" },
  { value: 86400, label: "24 hours" },
  { value: 172800, label: "48 hours" },
];

function StoryCard({ disabled, busy, onSubmit }: { disabled: boolean; busy: boolean; onSubmit: (fd: FormData) => void }) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-1.5">
        <div className="text-sm font-semibold">Post a story</div>
        <span
          className="cursor-help text-[11px] text-muted"
          title="Posts a photo or video story on her behalf. Photo must be 1080x1920 JPEG, under 10MB. Video must be 720x1280, H.265 MPEG4, under 30MB and 60s. Requires the Post stories permission."
        >
          ⓘ
        </span>
        {disabled && <span className="ml-auto rounded-full bg-muted/10 px-2 py-0.5 text-[10px] text-muted">not granted</span>}
      </div>
      <div className="mb-3 text-[11px] text-muted">
        Telegram's Bot API only lets a bot post new stories, it has no method to list what's currently live on her page. Check the
        Telegram app itself to see what's up right now.
      </div>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }} className="flex flex-col gap-2">
        <fieldset disabled={disabled || busy} className="flex flex-col gap-2 disabled:opacity-50">
          <select name="contentType" className={inputCls} defaultValue="photo">
            <option value="photo">Photo</option>
            <option value="video">Video</option>
          </select>
          <input type="file" name="file" accept="image/*,video/*" required className="text-xs" />
          <select name="activePeriod" className={inputCls} defaultValue={86400}>
            {STORY_PERIODS.map((p) => (
              <option key={p.value} value={p.value}>Visible for {p.label}</option>
            ))}
          </select>
          <textarea name="caption" placeholder="Caption (optional)" maxLength={2048} rows={2} className={inputCls} />
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" name="postToChatPage" value="true" />
            Keep visible on her page after it expires
          </label>
          <Button type="submit" size="sm" className="self-start">{busy ? "Posting…" : "Post story"}</Button>
        </fieldset>
      </form>
    </Card>
  );
}

