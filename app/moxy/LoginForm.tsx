"use client";
import { useState, type FormEvent } from "react";

export default function MoxyLoginForm({initialError = false}: {initialError?: boolean}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialError ? "Unable to sign in. Please check your email and password." : "");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const body = new FormData(event.currentTarget);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    setPending(true); setError("");
    try {
      const response = await fetch("/moxy/auth", {method:"POST", body, credentials:"same-origin", cache:"no-store", headers:{Accept:"application/json"}, signal:controller.signal});
      const result = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
      if (response.ok && result?.ok === true) { window.location.assign("/revenue"); return; }
      setError(result?.error === "credentials" ? "Email or password not accepted for Moxy. Please try again." : "Sign-in is temporarily unavailable. Please try again shortly.");
    } catch {
      setError("The sign-in request could not finish. Check your connection and try again.");
    } finally { clearTimeout(timeout); setPending(false); }
  }
  const inputClass = "mt-2 block w-full rounded-lg border border-white/20 bg-black/30 p-3 text-white outline-none focus:border-white/70 focus:ring-2 focus:ring-white/15 disabled:opacity-60";
  return <form action="/moxy/auth" method="post" onSubmit={submit} className="space-y-5" aria-busy={pending}>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    <label className="block text-sm font-medium text-white/80">Email<input name="email" type="email" autoComplete="username" required maxLength={254} disabled={pending} className={inputClass} /></label>
    <label className="block text-sm font-medium text-white/80">Password<input name="password" type="password" autoComplete="current-password" required maxLength={256} disabled={pending} className={inputClass} /></label>
    <button type="submit" disabled={pending} className="w-full rounded-lg bg-white p-3 font-semibold text-black transition hover:bg-white/90 disabled:opacity-60">{pending ? "Signing in…" : "Sign in"}</button>
  </form>;
}
