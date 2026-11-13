"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Info } from "@/components/clone/fields";

// READ-ONLY restoration of the old Business account panel (app/business,
// deleted this session). Shows what's connected and her profile photo, the
// bit that was specifically missed. Deliberately drops every editing feature
// the old page had (name/username/bio/photo/story mutations) — this only
// ever calls GET /api/business-connection, which itself only ever calls
// Telegram's getBusinessConnection. No form, no submit button, no action prop
// anywhere in this file.

type Rights = Record<string, boolean>;
type CloneInfo = { id: string; name: string; slug: string };
type Status =
  | { loading: true }
  | { loading: false; connected: false; unavailable?: boolean; error: string; clone: CloneInfo | null }
  | {
      loading: false;
      connected: true;
      clone: CloneInfo;
      isEnabled: boolean;
      businessConnectionId: string;
      rights: Rights;
      account: { id: number | null; firstName: string | null; lastName: string | null; username: string | null };
    };

const RIGHT_LABEL: Record<string, string> = {
  can_reply: "Can reply",
  can_read_messages: "Can read messages",
  can_delete_sent_messages: "Can delete sent messages",
  can_delete_all_messages: "Can delete all messages",
  can_edit_name: "Can edit name",
  can_edit_bio: "Can edit bio",
  can_edit_profile_photo: "Can edit profile photo",
  can_edit_username: "Can edit username",
  can_view_gifts_and_stars: "Can view gifts & Stars",
  can_convert_gifts_to_stars: "Can convert gifts to Stars",
  can_transfer_and_upgrade_gifts: "Can transfer/upgrade gifts",
  can_transfer_stars: "Can transfer Stars",
  can_manage_stories: "Can post stories",
};

function RightBadge({ granted, label }: { granted: boolean; label: string }) {
  return (
    <span
      className={
        "rounded-full px-2 py-0.5 text-[10px] font-medium " +
        (granted ? "bg-good/15 text-good" : "bg-muted/10 text-muted")
      }
    >
      {granted ? "✓" : "✕"} {label}
    </span>
  );
}

// Real Telegram profile photo, same /api/avatar endpoint fans already use
// (getUserProfilePhotos → getFile → stream, cached). Works for any Telegram
// user id including the connected business account's, so no new endpoint is
// needed just for the photo. Falls back to initials if she has none or
// privacy-blocks it. Plain <img>, so the global "blur all media" toggle
// (html.blur-media img) still applies untouched.
function BizPhoto({ cloneId, telegramId, name }: { cloneId: string; telegramId: number | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("") || "?";
  if (failed || telegramId == null) {
    return (
      <span className="creator-name flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted/20 text-lg font-semibold text-muted">
        {initials}
      </span>
    );
  }
  return (
    <img
      src={`/api/avatar?clone=${encodeURIComponent(cloneId)}&tg=${telegramId}`}
      alt=""
      onError={() => setFailed(true)}
      className="h-14 w-14 shrink-0 rounded-full object-cover"
    />
  );
}

export default function BusinessConnectionCard({ cloneId }: { cloneId: string }) {
  const [status, setStatus] = useState<Status>({ loading: true });

  useEffect(() => {
    let cancelled = false;
    setStatus({ loading: true });
    fetch(`/api/business-connection?cloneId=${encodeURIComponent(cloneId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setStatus({ loading: false, ...d });
      })
      .catch((e) => {
        if (!cancelled) setStatus({ loading: false, connected: false, error: e instanceof Error ? e.message : String(e), clone: null });
      });
    return () => {
      cancelled = true;
    };
  }, [cloneId]);

  if (status.loading) {
    return (
      <Card className="p-4 text-sm text-muted">Loading business connection…</Card>
    );
  }

  if (!status.connected) {
    return (
      <Card className="p-4">
        <div className="mb-1 flex items-center gap-1.5">
          <span className="text-sm font-semibold">Business account</span>
          <Info text="Her connected Telegram Business account, if any. Shows here as soon as she connects this bot as her chatbot and it receives at least one message through it." />
        </div>
        {status.clone && <div className="creator-name mb-1 text-xs text-muted">{status.clone.name} / {status.clone.slug}</div>}
        <div className="text-sm text-warn">{status.unavailable ? "Could not check the connection, status unknown." : "Not connected."} {status.error}</div>
      </Card>
    );
  }

  const { clone, isEnabled, rights, account } = status;
  const fullName = [account.firstName, account.lastName].filter(Boolean).join(" ") || "(no name)";

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <span className="text-sm font-semibold">Business account</span>
        <Info text="Read-only view of the Telegram Business account connected to this bot: who it belongs to, her profile photo, and what she's granted the bot permission to do. Nothing here can change her account, that's Telegram-side only." />
        <span
          className={
            "ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium " +
            (isEnabled ? "bg-good/15 text-good" : "bg-crit/15 text-crit")
          }
        >
          {isEnabled ? "Connection active" : "Connection disabled"}
        </span>
      </div>

      <div className="mb-3 flex items-center gap-3">
        <BizPhoto cloneId={cloneId} telegramId={account.id} name={fullName} />
        <div className="min-w-0 flex-1">
          <div className="creator-name truncate text-sm font-semibold">{fullName}</div>
          <div className="truncate text-xs text-muted">
            {/* The @handle identifies the creator exactly as well as the real
                name blurred above it, so privacy mode has to take both or it
                takes neither. The numeric id is not a name, so it stays. */}
            <span className="creator-name">
              {account.username ? `@${account.username}` : "no username"}
            </span>
            {account.id != null ? ` · id ${account.id}` : ""}
          </div>
          <div className="creator-name truncate text-xs text-muted">
            {clone.name} <span className="text-muted/70">/ {clone.slug}</span>
          </div>
        </div>
      </div>

      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-xs font-semibold text-muted">Granted rights</span>
        <Info text="What she's allowed this bot to do with her Business account, granted or revoked entirely on her side (Telegram Settings > Telegram Business > Chatbots > Permissions). Informational only, this panel has no controls that use any of them." />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(RIGHT_LABEL).map(([field, label]) => (
          <RightBadge key={field} granted={!!rights[field]} label={label} />
        ))}
      </div>
    </Card>
  );
}
