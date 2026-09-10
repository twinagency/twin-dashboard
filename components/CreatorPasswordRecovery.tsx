"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import CreatorAuthFrame from "./CreatorAuthFrame";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { creatorPortalHref, type CreatorPortal } from "@/lib/creator-portal";

let client: ReturnType<typeof createClient> | undefined;
function authClient() {
  return client ??= createClient("https://aouaenqayfltoqrmpitg.supabase.co", "sb_publishable_GaunWyo_PKF82PDziCc9mQ_B9_3O16a", { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
}
export default function CreatorPasswordRecovery({ portal, mode }: { portal: CreatorPortal; mode: "forgot" | "reset" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (mode !== "reset") return;
    let active = true;
    const auth = authClient().auth;
    auth.getSession().then(({ data }) => { if (active) setReady(!!data.session); }).catch(() => { if (active) setReady(false); });
    const { data } = auth.onAuthStateChange((_event, session) => { if (active) setReady(!!session); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [mode]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (mode === "reset" && (password.length < 8 || password !== confirm)) { setError("Passwords must match and be at least 8 characters."); return; }
    setBusy(true);
    try {
      const auth = authClient().auth;
      if (mode === "forgot") {
        const redirectTo = window.location.origin + creatorPortalHref("/creator/reset-password", portal);
        const result = await auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
        if (result.error) throw new Error("Could not send the reset email. Try again.");
      } else {
        if (!ready) throw new Error("Open the password reset link from your email first.");
        const result = await auth.updateUser({ password });
        if (result.error) throw new Error("Could not update the password. Request a fresh reset link and try again.");
        await auth.signOut();
      }
      setDone(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The request failed. Please try again."); }
    finally { setBusy(false); }
  }
  const login = creatorPortalHref("/creator/login", portal);
  return <CreatorAuthFrame portal={portal} heading={mode === "forgot" ? "Reset password" : "New password"} description={mode === "forgot" ? "Enter the email attached to your creator account." : "Choose a new password for your creator account."}>
    {done ? <div className="grid gap-4"><p role="status" className="rounded-lg border border-good/25 bg-good/10 p-3 text-sm text-ink">{mode === "forgot" ? "Check your email for the password reset link." : "Password updated successfully."}</p><Link href={login} className="text-center text-sm font-medium text-accent hover:underline">Back to sign in</Link></div> : mode === "reset" && !ready ? <div className="grid gap-4"><p className="text-sm text-muted">Open this page from the password reset link in your email.</p><Link href={creatorPortalHref("/creator/forgot-password", portal)} className="text-sm font-medium text-accent hover:underline">Request a new reset link</Link></div> : <form onSubmit={submit} className="grid gap-4">
      {mode === "forgot" ? <label className="block"><span className="mb-1 block text-sm text-muted">Email</span><Input name="email" value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="email" required autoFocus /></label> : <><label className="block"><span className="mb-1 block text-sm text-muted">New password</span><Input value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete="new-password" minLength={8} required /></label><label className="block"><span className="mb-1 block text-sm text-muted">Confirm password</span><Input value={confirm} onChange={e => setConfirm(e.target.value)} type="password" autoComplete="new-password" minLength={8} required /></label></>}
      {error && <p role="alert" className="text-sm text-crit">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : mode === "forgot" ? "Send reset link" : "Update password"}</Button>
      <Link href={login} className="text-center text-sm text-muted hover:text-ink">Back to sign in</Link>
    </form>}
  </CreatorAuthFrame>;
}
