"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import TwinWordmark from "@/components/TwinWordmark";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const supabase = createClient(
  "https://aouaenqayfltoqrmpitg.supabase.co",
  "sb_publishable_GaunWyo_PKF82PDziCc9mQ_B9_3O16a",
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);

export default function CreatorResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setReady(!!data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setReady(!!session);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8 || password !== confirm) return setStatus("error");
    setStatus("saving");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return setStatus("error");
    await supabase.auth.signOut();
    setStatus("done");
  }

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative hidden overflow-hidden bg-[#06172f] p-12 text-white lg:flex lg:flex-col lg:justify-between"><div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,43,85,0.08),rgba(6,23,47,0.55)),url('/brand/twin-deep-texture.png')] bg-cover bg-center" /><div className="relative z-10"><TwinWordmark inverse /></div><div className="relative z-10 max-w-2xl pb-10"><p className="mb-6 text-xs font-semibold uppercase tracking-[0.28em] text-white/60">Twin Creator</p><h1 className="font-heading text-5xl font-semibold leading-[1.02] tracking-[-0.045em]">Choose a new password.</h1></div></section>
      <section className="relative flex items-center justify-center overflow-hidden bg-bg px-5 py-12"><div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,23,47,0.08),rgba(255,255,255,0.34)),url('/brand/twin-blue-texture.png')] bg-cover bg-center" /><Card className="relative z-10 w-full max-w-md border-white/80 bg-white/90 shadow-[0_28px_70px_rgb(6_23_47/0.12)] backdrop-blur-xl"><CardHeader className="px-7 pt-7"><div className="mb-5 lg:hidden"><TwinWordmark /></div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-2">Creator Portal</p><h2 className="font-heading text-3xl font-semibold tracking-[-0.035em] text-ink">New password</h2></CardHeader><CardContent className="px-7 pb-7">{status === "done" ? <div className="grid gap-4"><p className="rounded-lg border border-good/25 bg-good/10 p-3 text-sm text-ink">Password updated successfully.</p><Link href="/creator/login" className="text-center text-sm font-medium text-accent-2 hover:underline">Sign in</Link></div> : !ready ? <div className="grid gap-4"><p className="text-sm text-muted">Open this page from the password reset link in your email.</p><Link href="/creator/forgot-password" className="text-sm font-medium text-accent-2 hover:underline">Request a new reset link</Link></div> : <form onSubmit={submit} className="grid gap-4"><label className="block"><span className="mb-1 block text-sm text-muted">New password</span><Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" minLength={8} required /></label><label className="block"><span className="mb-1 block text-sm text-muted">Confirm password</span><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" autoComplete="new-password" minLength={8} required /></label>{status === "error" && <p className="text-sm text-crit">Passwords must match and be at least 8 characters.</p>}<Button type="submit" className="w-full" disabled={status === "saving"}>{status === "saving" ? "Updating…" : "Update password"}</Button></form>}</CardContent></Card></section>
    </div>
  );
}
