"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/clone/fields";

// Drives app/api/business-account/route.ts: read the live connection + granted
// rights, then perform one action at a time (name/username/bio/photo/story).
// Every action is gated client side on the right the connection actually
// granted (fetched fresh on load), AND re-checked server side right before
// the Telegram call, so a stale UI never lets an action through the API only
// to fail there. See route.ts for why: business bot rights can be revoked or
// granted from her side at any time.

type Rights = Record<string, boolean>;
type Status =
  | { loading: true }
  | { loading: false; connected: false; error: string }
  | {
      loading: false;
      connected: true;
      isEnabled: boolean;
      businessConnectionId: string;
      rights: Rights;
      account: { id: number | null; firstName: string | null; lastName: string | null; username: string | null };
    };

const RIGHT_LABEL: Record<string, string> = {
  can_edit_name: "Change name",
  can_edit_username: "Change username",
  can_edit_bio: "Change bio",
  can_edit_profile_photo: "Change profile photo",
  can_manage_stories: "Post stories",
};

function RightBadge({ granted, label }: { granted: boolean; label: string }) {
  return (
    <span
      className={
        "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium " +
        (granted ? "bg-good/15 text-good" : "bg-muted/10 text-muted")
      }
      title={granted ? `${label}: granted by her` : `${label}: not granted, the matching action is disabled below`}
    >
      {granted ? "✓" : "✕"} {label}
    </span>
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

  return (
    <div className="text-ink">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-2xl font-semibold">Business account</h1>
        <span
          className="cursor-help text-sm text-muted"
          title="Changes her live Telegram Business profile: name, username, bio, photo and stories. Every action requires the matching right in her Chatbot Permissions and is logged to /logs as an operator action."
        >
          ⓘ
        </span>
      </div>

      {!status.connected ? (
        <Card className="p-4 text-sm text-warn">{status.error}</Card>
      ) : (
        <>
          <Card className="mb-4 p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={"rounded-full px-2 py-0.5 text-[10px] font-medium " + (status.isEnabled ? "bg-good/15 text-good" : "bg-crit/15 text-crit")}>
                {status.isEnabled ? "Connection active" : "Connection disabled"}
              </span>
              <span className="text-xs text-muted">
                {status.account.firstName} {status.account.lastName ?? ""}
                {status.account.username ? ` · @${status.account.username}` : ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(RIGHT_LABEL).map(([field, label]) => (
                <RightBadge key={field} granted={!!status.rights[field]} label={label} />
              ))}
            </div>
          </Card>

          {result && (
            <div className={"mb-4 rounded-md border px-3 py-2 text-xs " + (result.ok ? "border-good/30 bg-good/10 text-good" : "border-crit/30 bg-crit/10 text-crit")}>
              {result.message}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <NameCard busy={busy === "name"} disabled={!status.rights.can_edit_name} onSubmit={(fd) => act("name", (f) => { f.set("firstName", fd.get("firstName") as string); f.set("lastName", fd.get("lastName") as string); })} />
            <UsernameCard busy={busy === "username"} disabled={!status.rights.can_edit_username} onSubmit={(fd) => act("username", (f) => f.set("username", fd.get("username") as string))} />
            <BioCard busy={busy === "bio"} disabled={!status.rights.can_edit_bio} onSubmit={(fd) => act("bio", (f) => f.set("bio", fd.get("bio") as string))} />
            <PhotoCard
              busy={busy === "photo" || busy === "removePhoto"}
              disabled={!status.rights.can_edit_profile_photo}
              onSet={(fd) => act("photo", (f) => { f.set("file", fd.get("file") as Blob); f.set("isPublic", fd.get("isPublic") as string); })}
              onRemove={() => act("removePhoto", (f) => f.set("isPublic", "false"))}
            />
            <StoryCard busy={busy === "story"} disabled={!status.rights.can_manage_stories} onSubmit={(fd) => act("story", (f) => { for (const [k, v] of fd.entries()) f.set(k, v); })} />
          </div>
        </>
      )}
    </div>
  );
}

// Title + ⓘ-hint + "not granted" badge shell. Each specific card below owns
// its own single <form> (nesting a second form inside this one would be
// invalid HTML and double-submit), so this wrapper only renders the header.
function ActionCard({
  title,
  hint,
  disabled,
  children,
}: {
  title: string;
  hint: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-1.5">
        <div className="text-sm font-semibold">{title}</div>
        <span className="cursor-help text-[11px] text-muted" title={hint}>ⓘ</span>
        {disabled && <span className="ml-auto rounded-full bg-muted/10 px-2 py-0.5 text-[10px] text-muted">not granted</span>}
      </div>
      {children}
    </Card>
  );
}

function NameCard({ disabled, busy, onSubmit }: { disabled: boolean; busy: boolean; onSubmit: (fd: FormData) => void }) {
  return (
    <ActionCard title="Name" hint="Changes the first and last name shown on her connected Telegram Business account. Requires the Change name permission." disabled={disabled}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }} className="flex flex-col gap-2">
        <fieldset disabled={disabled || busy} className="flex flex-col gap-2 disabled:opacity-50">
          <Input name="firstName" placeholder="First name" required maxLength={64} />
          <Input name="lastName" placeholder="Last name (optional)" maxLength={64} />
          <Button type="submit" size="sm">{busy ? "Saving…" : "Save name"}</Button>
        </fieldset>
      </form>
    </ActionCard>
  );
}

function UsernameCard({ disabled, busy, onSubmit }: { disabled: boolean; busy: boolean; onSubmit: (fd: FormData) => void }) {
  return (
    <ActionCard title="Username" hint="Changes her @username. Leave blank and save to remove it entirely. Requires the Change username permission." disabled={disabled}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }} className="flex flex-col gap-2">
        <fieldset disabled={disabled || busy} className="flex flex-col gap-2 disabled:opacity-50">
          <Input name="username" placeholder="username (no @)" maxLength={32} />
          <Button type="submit" size="sm">{busy ? "Saving…" : "Save username"}</Button>
        </fieldset>
      </form>
    </ActionCard>
  );
}

function BioCard({ disabled, busy, onSubmit }: { disabled: boolean; busy: boolean; onSubmit: (fd: FormData) => void }) {
  return (
    <ActionCard title="Bio" hint="Changes her Telegram bio, up to 140 characters. Leave blank and save to clear it. Requires the Change bio permission." disabled={disabled}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }} className="flex flex-col gap-2">
        <fieldset disabled={disabled || busy} className="flex flex-col gap-2 disabled:opacity-50">
          <textarea name="bio" placeholder="Bio" maxLength={140} rows={3} className={inputCls} />
          <Button type="submit" size="sm">{busy ? "Saving…" : "Save bio"}</Button>
        </fieldset>
      </form>
    </ActionCard>
  );
}

function PhotoCard({
  disabled,
  busy,
  onSet,
  onRemove,
}: {
  disabled: boolean;
  busy: boolean;
  onSet: (fd: FormData) => void;
  onRemove: () => void;
}) {
  return (
    <ActionCard title="Profile photo" hint="Uploads a fresh photo as her profile picture (Telegram doesn't allow reusing a file, always a new upload). Public makes it the always-visible photo even if her privacy settings hide the main one. Requires the Change profile photo permission." disabled={disabled}>
      <form onSubmit={(e) => { e.preventDefault(); onSet(new FormData(e.currentTarget)); }} className="flex flex-col gap-2">
        <fieldset disabled={disabled || busy} className="flex flex-col gap-2 disabled:opacity-50">
          <input type="file" name="file" accept="image/*" required className="text-xs" />
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" name="isPublic" value="true" />
            Set as public photo
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm">{busy ? "Uploading…" : "Set photo"}</Button>
            <Button type="button" variant="outline" size="sm" onClick={onRemove} disabled={disabled || busy}>
              Remove current
            </Button>
          </div>
        </fieldset>
      </form>
    </ActionCard>
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
    <ActionCard title="Post a story" hint="Posts a photo or video story on her behalf. Photo must be 1080x1920 JPEG, under 10MB. Video must be 720x1280, H.265 MPEG4, under 30MB and 60s. Requires the Post stories permission." disabled={disabled}>
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
          <Button type="submit" size="sm">{busy ? "Posting…" : "Post story"}</Button>
        </fieldset>
      </form>
    </ActionCard>
  );
}
