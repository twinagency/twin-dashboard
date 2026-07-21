"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { updateFeedbackStatus, screenshotSignedUrl } from "./actions";
import { STATUSES, type FeedbackStatus } from "./shared";

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  building: "Building",
  done: "Done",
};

// Inline status dropdown — advances an item through the workflow via a server action.
export function StatusControl({ id, status }: { id: string; status: FeedbackStatus }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function change(next: FeedbackStatus) {
    if (next === status) return;
    startTransition(async () => {
      await updateFeedbackStatus(id, next);
      router.refresh();
    });
  }

  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) => change(e.target.value as FeedbackStatus)}
      className="rounded-md border border-line bg-panel px-2 py-1 text-xs text-ink outline-none disabled:opacity-50"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

// Screenshot link — resolves a short-lived signed URL on click (private bucket).
export function ScreenshotLink({ pathOrUrl }: { pathOrUrl: string }) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState(false);

  function open() {
    setErr(false);
    startTransition(async () => {
      const url = await screenshotSignedUrl(pathOrUrl);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else setErr(true);
    });
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={pending}
      className="text-xs text-accent underline-offset-2 hover:underline disabled:opacity-50"
    >
      {pending ? "opening…" : err ? "unavailable" : "screenshot"}
    </button>
  );
}
