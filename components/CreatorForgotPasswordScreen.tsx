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

export default function CreatorForgotPasswordScreen({ brand, agencyBrand = null }: { brand: CreatorAuthBrand; agencyBrand?: { name: string; slug: string; logo: string | null; dark?: boolean } | null }) {
  const [next, setNext] = useState("/creator");
  useEffect(() => { setNext(safeCreatorNext(new URLSearchParams(window.location.search).get("next"))); }, []);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const tether = brand === "tether";
  // Moxy (dark agency brand) on its own host: same dark look as its sign-in page.
  const dark = tether || !!agencyBrand?.dark;
  const link = brand === "link";
  const paths = agencyBrand?.slug === "moxy" ? { ...creatorAuthPaths(brand), login: "/creator/moxy/login" } : creatorAuthPaths(brand);
  const authLinkClass = dark ? tetherAuthLinkClass : link ? linkAuthLinkClass : "font-medium text-accent-2 hover:underline";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    try {
      const redirectTo = `${window.location.origin}${creatorRecoveryPath(paths.reset, next)}`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
      setStatus(error ? "error" : "sent");
    } catch { setStatus("error"); }
  }

  return (
    <CreatorAuthFrame brand={brand} agencyBrand={agencyBrand} heroTitle="Recover your creator account." heroCopy={tether ? "Use the email attached to your Tether creator access." : link ? "Use the email attached to your LYNQ creator access." : undefined} eyebrow="Creator workspace" title="Reset password" description="Enter the email attached to your creator account.">
      {status === "sent" ? <div className="grid gap-4"><p className={dark ? "rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-50" : "rounded-lg border border-good/25 bg-good/10 p-3 text-sm text-ink"}>Check your email for the password reset link.</p><Link href={creatorRecoveryPath(paths.login, next)} className={`text-center text-sm ${authLinkClass}`}>Back to sign in</Link></div> : <form onSubmit={submit} className={dark ? "space-y-5" : "grid gap-4"}><label className="block"><span className={dark ? "mb-2 block text-sm font-medium text-white/82" : "mb-1 block text-sm text-muted"}>Email address</span><Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required autoFocus className={dark ? tetherAuthInputClass : undefined} /></label>{status === "error" && <p role="alert" className={dark ? "rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100" : "text-sm text-crit"}>Could not send the reset email. Try again.</p>}{dark ? <button type="submit" className={tetherAuthButtonClass} disabled={status === "sending"}>{status === "sending" ? "Sending..." : "Send reset link"}</button> : <Button type="submit" className="w-full" disabled={status === "sending"}>{status === "sending" ? "Sending..." : "Send reset link"}</Button>}<Link href={creatorRecoveryPath(paths.login, next)} className={dark ? `block text-center text-sm ${authLinkClass}` : `text-center text-sm ${link ? authLinkClass : "text-muted hover:text-ink"}`}>Back to sign in</Link></form>}
    </CreatorAuthFrame>
  );
}
