"use client";

import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { safeCreatorNext } from "@/lib/creator-routing";

const errors: Record<string, string> = {
  consent_missing: "Enter your legal name and confirm consent before saving.",
  application_locked: "This application can no longer be changed. Your entries have been kept here.",
  file_removal_pending: "Finish removing your pending file in Saved content, then submit again.",
  not_ready: "Finish the required steps before submitting. Your saved information has not been lost.",
  questionnaire_conflict: "Your application changed in another window. Refresh to review the latest saved information.",
};

/** Keep entries visible when a native onboarding action cannot be confirmed. */
export default function CreatorOnboardingActionForm({ children, className, pendingLabel, successStatuses, loginPath }: {
  children: ReactNode;
  className?: string;
  pendingLabel: string;
  successStatuses: string[];
  loginPath: string;
}) {
  const busy = useRef(false);
  const dirty = useRef(false);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!busy.current && !dirty.current) return;
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState(false);
  const [signIn, setSignIn] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const body = new FormData(form); // Capture before disabling the fields.
    busy.current = true;
    setPending(true);
    setError("");
    setSignIn("");
    setPendingRemoval(false);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(form.action, { method: "POST", body, signal: controller.signal });
      const destination = new URL(response.url, window.location.origin);
      if (response.status === 401 || destination.pathname.endsWith("/login")) {
        setError("Your session expired. Sign in again to continue; this action has not been confirmed.");
        setSignIn(`${loginPath}?next=${encodeURIComponent(safeCreatorNext(window.location.pathname + window.location.search))}`);
        return;
      }
      const status = destination.searchParams.get("status") || "";
      if (response.ok && destination.origin === window.location.origin &&
          ((destination.pathname === "/creator/onboarding" && successStatuses.includes(status)) ||
           (destination.pathname === "/creator" && successStatuses.includes("submitted")))) {
        dirty.current = false;
        busy.current = false;
        window.location.assign(destination.href);
        return;
      }
      setPendingRemoval(status === "file_removal_pending");
      setError(errors[status] || "We could not confirm the save. Your entries are still here. Please try again.");
    } catch {
      setError("The connection was interrupted. Your entries are still here. Please try again.");
    } finally {
      clearTimeout(timeout);
      busy.current = false;
      setPending(false);
    }
  }

  return <form action="/creator-auth/onboarding" method="post" onSubmit={submit} onInput={() => { dirty.current = true; }} onChange={() => { dirty.current = true; }} aria-busy={pending}>
    <fieldset disabled={pending} className={className}>{children}</fieldset>
    {pending && <p role="status" className="mt-3 text-sm text-muted">{pendingLabel}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}{pendingRemoval && <> <a href="/creator/onboarding?step=content" className="font-semibold underline">Open Saved content</a></>}{signIn && <> <a href={signIn} className="font-semibold underline">Sign in and return</a></>}</p>}
  </form>;
}
