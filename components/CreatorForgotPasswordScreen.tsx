"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CreatorAuthFrame, {
  creatorAuthPaths,
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

export default function CreatorForgotPasswordScreen({ brand = "twin" }: { brand?: CreatorAuthBrand }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const tether = brand === "tether";
  const paths = creatorAuthPaths(brand);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    const redirectTo = `${window.location.origin}${paths.reset}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
    setStatus(error ? "error" : "sent");
  }

  return (
    <CreatorAuthFrame brand={brand} heroTitle="Recover your creator account." heroCopy={tether ? "Use the email attached to your Tether creator access." : undefined} eyebrow="Creator workspace" title="Reset password" description="Enter the email attached to your creator account.">
      {status === "sent" ? <div className="grid gap-4"><p className={tether ? "rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-50" : "rounded-lg border border-good/25 bg-good/10 p-3 text-sm text-ink"}>Check your email for the password reset link.</p><Link href={paths.login} className={tether ? `text-center text-sm ${tetherAuthLinkClass}` : "text-center text-sm font-medium text-accent-2 hover:underline"}>Back to sign in</Link></div> : <form onSubmit={submit} className={tether ? "space-y-5" : "grid gap-4"}><label className="block"><span className={tether ? "mb-2 block text-sm font-medium text-white/82" : "mb-1 block text-sm text-muted"}>Email address</span><Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required autoFocus className={tether ? tetherAuthInputClass : undefined} /></label>{status === "error" && <p role="alert" className={tether ? "rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100" : "text-sm text-crit"}>Could not send the reset email. Try again.</p>}{tether ? <button type="submit" className={tetherAuthButtonClass} disabled={status === "sending"}>{status === "sending" ? "Sending..." : "Send reset link"}</button> : <Button type="submit" className="w-full" disabled={status === "sending"}>{status === "sending" ? "Sending..." : "Send reset link"}</Button>}<Link href={paths.login} className={tether ? `block text-center text-sm ${tetherAuthLinkClass}` : "text-center text-sm text-muted hover:text-ink"}>Back to sign in</Link></form>}
    </CreatorAuthFrame>
  );
}
