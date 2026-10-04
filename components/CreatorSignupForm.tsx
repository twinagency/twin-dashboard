"use client";
import { useRef, useState, type ReactNode } from "react";
import { invitationMessages, type CreatorInvitationStatus } from "@/lib/creator-invitation-state";

/** Generic/invited signup only. Specialized verification flows keep their own form action. */
export default function CreatorSignupForm({ action, className, children, enhanced }: { action: string; className: string; children: ReactNode; enhanced: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return <form ref={formRef} action={action} method="post" className={className} onSubmit={enhanced ? async event => {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true); setError("");
    try {
      const response = await fetch(action, { method: "POST", headers: { accept: "application/json" }, body: data });
      const result = await response.json();
      if (response.ok && result.next === "/creator/onboarding") { window.location.assign(result.next); return; }
      const messages: Record<string, string> = {
        invalid: "Check your name, email and password. Passwords must be at least 8 characters.",
        exists: "An account already exists for this email. Sign in to continue.",
        incomplete: "We couldn't confirm account setup. Try signing in; if that fails, contact your agency with the reference shown below.",
      };
      const invitation = String(result.error || "").replace(/^invite_/, "") as CreatorInvitationStatus;
      setError(messages[result.error] || invitationMessages[invitation] || "We couldn't create your account. Please try again.");
    } catch { setError("We couldn't confirm account setup. Try signing in before retrying. Your name and email are still here."); }
    finally {
      // Keep non-secret fields on a failed request. Never retain the password.
      const password = form.elements.namedItem("password");
      if (password instanceof HTMLInputElement) password.value = "";
      setPending(false);
    }
  } : undefined}>
    <fieldset disabled={pending} className={className}>{children}</fieldset>
    {pending && <p role="status" aria-live="polite">Creating your account…</p>}
    {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm">{error}</p>}
  </form>;
}
