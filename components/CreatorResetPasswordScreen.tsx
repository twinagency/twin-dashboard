"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { creatorBrowserAuth, type CreatorPublicAuth } from "@/lib/creator-browser-auth";
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

export default function CreatorResetPasswordScreen({ brand, authConfig }: { brand: CreatorAuthBrand; authConfig: CreatorPublicAuth }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const tether = brand === "tether";
  const link = brand === "link";
  const paths = creatorAuthPaths(brand);
  const authLinkClass = tether ? tetherAuthLinkClass : link ? linkAuthLinkClass : "font-medium text-accent-2 hover:underline";

  useEffect(() => {
    let supabase;
    try { supabase = creatorBrowserAuth(authConfig); } catch { return; }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setReady(!!data.session);
    }).catch(() => { if (active) setReady(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setReady(!!session);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [authConfig]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8 || password !== confirm) return setStatus("error");
    setStatus("saving");
    try {
      const supabase = creatorBrowserAuth(authConfig);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return setStatus("error");
      await supabase.auth.signOut();
      // The dashboard uses a separate HttpOnly creator cookie. Finish through
      // the server logout route so a successful password reset clears it too,
      // then returns to the verified creator brand's sign-in page.
      window.location.replace("/creator-auth/logout");
    } catch { setStatus("error"); }
  }

  return (
    <CreatorAuthFrame brand={brand} heroTitle="Choose a new password." heroCopy={tether ? "Return securely to your Tether creator workspace." : link ? "Return securely to your LYNQ creator workspace." : undefined} eyebrow="Creator workspace" title="New password">
      {status === "done" ? <div className="grid gap-4"><p className={tether ? "rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-50" : "rounded-lg border border-good/25 bg-good/10 p-3 text-sm text-ink"}>Password updated successfully.</p><Link href={paths.login} className={`text-center text-sm ${authLinkClass}`}>Sign in</Link></div> : !ready ? <div className="grid gap-4"><p className={tether ? "text-sm text-white/55" : "text-sm text-muted"}>Open this page from the password reset link in your email.</p><Link href={paths.forgot} className={tether ? authLinkClass : `text-sm ${authLinkClass}`}>Request a new reset link</Link></div> : <form onSubmit={submit} className={tether ? "space-y-5" : "grid gap-4"}><label className="block"><span className={tether ? "mb-2 block text-sm font-medium text-white/82" : "mb-1 block text-sm text-muted"}>New password</span><Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" minLength={8} required className={tether ? tetherAuthInputClass : undefined} /></label><label className="block"><span className={tether ? "mb-2 block text-sm font-medium text-white/82" : "mb-1 block text-sm text-muted"}>Confirm password</span><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" autoComplete="new-password" minLength={8} required className={tether ? tetherAuthInputClass : undefined} /></label>{status === "error" && <p role="alert" className={tether ? "rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100" : "text-sm text-crit"}>Passwords must match and be at least 8 characters.</p>}{tether ? <button type="submit" className={tetherAuthButtonClass} disabled={status === "saving"}>{status === "saving" ? "Updating..." : "Update password"}</button> : <Button type="submit" className="w-full" disabled={status === "saving"}>{status === "saving" ? "Updating..." : "Update password"}</Button>}</form>}
    </CreatorAuthFrame>
  );
}
