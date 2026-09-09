"use client";

import { useState, type FormEvent } from "react";

export default function LynqLoginForm({ initialError = false, action = "/lynq/auth" }: { initialError?: boolean; action?: "/lynq/auth" | "/link/auth" | "/jess-and-kate-ai/auth" }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialError ? "Unable to sign in. Please check your password and try again." : "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const body = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(action, {
        method: "POST", body, credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json" }, signal: controller.signal,
      });
      const result = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
      if (response.ok && result?.ok === true) {
        window.location.assign("/revenue");
        return;
      }
      setError(result?.error === "credentials"
        ? "That password wasn’t accepted. Please try again."
        : "Sign-in is temporarily unavailable. Please try again shortly.");
    } catch {
      setError("The sign-in request couldn’t finish. Please check your connection and try again.");
    } finally {
      clearTimeout(timeout);
      setPending(false);
    }
  }

  return <form action={action} method="post" onSubmit={submit} className="space-y-5" aria-busy={pending}>
    {error && <p role="alert" className="text-sm text-crit">{error}</p>}
    <label className="block text-sm font-medium text-ink">Password
      <input name="password" type="password" autoComplete="current-password" required maxLength={256} disabled={pending} className="mt-2 w-full rounded-lg border border-line bg-white p-3" />
    </label>
    <button type="submit" disabled={pending} className="w-full rounded-lg bg-accent p-3 font-semibold text-white disabled:opacity-60">{pending ? "Signing in…" : "Sign in"}</button>
  </form>;
}
