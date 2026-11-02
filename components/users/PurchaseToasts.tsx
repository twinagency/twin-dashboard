"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { onLive, type LiveEvent } from "@/lib/live-bus";

type Toast = Extract<LiveEvent, { t: "purchase" }>;

const LIFETIME_MS = 12_000;
// More than this on screen and they cover the fan list. A burst during a
// campaign send is the normal case, not the exception, so the stack is capped
// and the oldest falls off rather than growing without limit.
const MAX_ON_SCREEN = 4;

const ITEM_LABEL: Record<string, { emoji: string; label: string }> = {
  photo: { emoji: "📷", label: "a photo" },
  video: { emoji: "🎥", label: "a video" },
  bundle: { emoji: "🎁", label: "a bundle" },
  media: { emoji: "📷", label: "media" },
  tip: { emoji: "💸", label: "a tip" },
  credits: { emoji: "💳", label: "credits" },
  subscription: { emoji: "⭐", label: "a subscription" },
  other: { emoji: "🧾", label: "something" },
};

// Mounted once by /users. Fan names are deliberately NOT tagged .creator-name:
// privacy mode hides the CREATOR from someone over the operator's shoulder, and
// he still has to tell his fans apart. Same call as the Fans list itself.
export default function PurchaseToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    return onLive((event) => {
      if (event.t !== "purchase") return;
      setToasts((prev) => {
        // The server only sends a charge once, but a reconnect replays the
        // cursor from the moment the stream opened, so dedupe on the charge id.
        if (prev.some((p) => p.id === event.id)) return prev;
        return [...prev, event].slice(-MAX_ON_SCREEN);
      });
      const id = event.id;
      setTimeout(() => setToasts((prev) => prev.filter((p) => p.id !== id)), LIFETIME_MS);
    });
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => {
        const item = ITEM_LABEL[(t.item ?? "other").toLowerCase()] ?? ITEM_LABEL.other;
        return (
          <Link
            key={t.id}
            href={`/users?fan=${t.fanId}`}
            onClick={() => setToasts((prev) => prev.filter((p) => p.id !== t.id))}
            className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-good/40 bg-bg p-3 shadow-lg transition animate-in fade-in-0 slide-in-from-bottom-2 hover:border-good"
          >
            <span className="text-lg leading-none">{item.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{t.fanName}</span>
              <span className="block truncate text-[11px] text-muted">bought {item.label}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-mono text-sm font-semibold tabular-nums text-good">+{t.stars}★</span>
              <span className="block font-mono text-[10px] tabular-nums text-muted">{t.lifetimeStars}★ total</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
