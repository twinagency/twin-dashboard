"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { creatorRecoveryPath } from "@/lib/creator-recovery";
import { safeCreatorNext } from "@/lib/creator-routing";
import { createClient } from "@supabase/supabase-js";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CreatorAuthFrame, {
  creatorAuthPaths,
  linkAuthLinkClass,
  tetherAuthButtonClass,
  tetherAuthInputClass,
  tetherAuthLinkClass,
  type CreatorAuthBrand,
} from "@/components/CreatorAuthFrame";

const supabase = createClient(
  "https://aouaenqayfltoqrmpitg.supabase.co",
  "sb_publishable_GaunWyo_PKF82PDziCc9mQ_B9_3O16a",
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);

export default function CreatorResetPasswordScreen({ brand, agencyBrand = null }: { brand: CreatorAuthBrand; agencyBrand?: { name: string; slug: string; logo: string | null; dark?: boolean } | null }) {
  const [next, setNext] = useState("/creator");
  const [errorMessage, setErrorMessage] = useState("");
  useEffect(() => { setNext(safeCreatorNext(new URLSearchParams(window.location.search).get("next"))); }, []);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const tether = brand === "tether";
  // Moxy (dark agency brand) on its own host: same dark look as its sign-in page.
  const dark = tether || !!agencyBrand?.dark;
  const link = brand === "link";
  const paths = agencyBrand?.slug === "moxy" ? { ...creatorAuthPaths(brand), login: "/creator/moxy/login" } : creatorAuthPaths(brand);
  const authLinkClass = dark ? tetherAuthLinkClass : link ? linkAuthLinkClass : "font-medium text-accent-2 hover:underline";

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setReady(!!data.session);
    }).catch(() => { if (active) setReady(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setReady(!!session);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "saving") return;
    if (password.length < 8 || password !== confirm) {
      setErrorMessage("Passwords must match and be at least 8 characters.");
      setStatus("error");
      return;
    }
    setStatus("saving");
    setErrorMessage("");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorMessage("The new password could not be saved. Try again, or request a new reset link if this one has expired.");
        setStatus("error");
        return;
      }
      setPassword(""); setConfirm("");
      // Also clear the separate HttpOnly dashboard session; a stale browser
      // session must not prevent this server logout after a successful reset.
      await supabase.auth.signOut().catch(() => undefined);
      window.location.replace(creatorRecoveryPath("/creator-auth/logout", next));
    } catch {
      setErrorMessage("The connection was interrupted. Try again to confirm the password update.");
      setStatus("error");
    }
  }

  return (
    <CreatorAuthFrame brand={brand} agencyBrand={agencyBrand} heroTitle="Choose a new password." heroCopy={tether ? "Return securely to your Tether creator workspace." : link ? "Return securely to your LYNQ creator workspace." : undefined} eyebrow="Creator workspace" title="New password">
      {status === "done" ? <div className="grid gap-4"><p className={dark ? "rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-50" : "rounded-lg border border-good/25 bg-good/10 p-3 text-sm text-ink"}>Password updated successfully.</p><Link href={creatorRecoveryPath(paths.login, next)} className={`text-center text-sm ${authLinkClass}`}>Sign in</Link></div> : !ready ? <div className="grid gap-4"><p className={dark ? "text-sm text-white/55" : "text-sm text-muted"}>Open this page from the password reset link in your email.</p><Link href={creatorRecoveryPath(paths.forgot, next)} className={dark ? authLinkClass : `text-sm ${authLinkClass}`}>Request a new reset link</Link></div> : <form onSubmit={submit} className={dark ? "space-y-5" : "grid gap-4"}><label className="block"><span className={dark ? "mb-2 block text-sm font-medium text-white/82" : "mb-1 block text-sm text-muted"}>New password</span><Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" minLength={8} required className={dark ? tetherAuthInputClass : undefined} /></label><label className="block"><span className={dark ? "mb-2 block text-sm font-medium text-white/82" : "mb-1 block text-sm text-muted"}>Confirm password</span><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" autoComplete="new-password" minLength={8} required className={dark ? tetherAuthInputClass : undefined} /></label>{status === "error" && <p role="alert" className={dark ? "rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100" : "text-sm text-crit"}>{errorMessage}</p>}{dark ? <button type="submit" className={tetherAuthButtonClass} disabled={status === "saving"}>{status === "saving" ? "Updating..." : "Update password"}</button> : <Button type="submit" className="w-full" disabled={status === "saving"}>{status === "saving" ? "Updating..." : "Update password"}</Button>}</form>}
    </CreatorAuthFrame>
  );
}
