"use client";

import { useFlirtCreatorLocale } from "@/components/FlirtCreatorLocale";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { creatorRecoveryPath } from "@/lib/creator-recovery";
import { safeCreatorNext } from "@/lib/creator-routing";
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
  const [next, setNext] = useState("/creator");
  const { t, locale } = useFlirtCreatorLocale();
  const [errorMessage, setErrorMessage] = useState("");
  useEffect(() => { setNext(safeCreatorNext(new URLSearchParams(window.location.search).get("next"))); }, []);
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
    if (status === "saving") return;
    if (password.length < 8 || password !== confirm) {
      setErrorMessage(t("Passwords must match and be at least 8 characters.", "As senhas devem ser iguais e ter pelo menos 8 caracteres."));
      setStatus("error");
      return;
    }
    setStatus("saving");
    setErrorMessage("");
    try {
      const supabase = creatorBrowserAuth(authConfig);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorMessage(t("The new password could not be saved. Try again, or request a new reset link if this one has expired.", "Não foi possível salvar a nova senha. Tente novamente ou solicite um novo link se este tiver expirado."));
        setStatus("error");
        return;
      }
      setPassword(""); setConfirm("");
      // Also clear the separate HttpOnly dashboard session; a stale browser
      // session must not prevent this server logout after a successful reset.
      await supabase.auth.signOut().catch(() => undefined);
      window.location.replace(creatorRecoveryPath("/creator-auth/logout", next));
    } catch {
      setErrorMessage(t("The connection was interrupted. Try again to confirm the password update.", "A conexão foi interrompida. Tente novamente para confirmar a atualização da senha."));
      setStatus("error");
    }
  }

  return (
    <CreatorAuthFrame brand={brand} locale={locale} heroTitle={t("Choose a new password.", "Escolha uma nova senha.")} heroCopy={tether ? "Return securely to your Tether creator workspace." : link ? "Return securely to your LYNQ creator workspace." : undefined} eyebrow={t("Creator workspace", "Área da criadora")} title={t("New password", "Nova senha")}>
      {status === "done" ? <div className="grid gap-4"><p className={tether ? "rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-50" : "rounded-lg border border-good/25 bg-good/10 p-3 text-sm text-ink"}>{t("Password updated successfully.", "Senha atualizada com sucesso.")}</p><Link href={creatorRecoveryPath(paths.login, next)} className={`text-center text-sm ${authLinkClass}`}>{t("Sign in", "Entrar")}</Link></div> : !ready ? <div className="grid gap-4"><p className={tether ? "text-sm text-white/55" : "text-sm text-muted"}>{t("Open this page from the password reset link in your email.", "Abra esta página pelo link de redefinição de senha enviado ao seu e-mail.")}</p><Link href={creatorRecoveryPath(paths.forgot, next)} className={tether ? authLinkClass : `text-sm ${authLinkClass}`}>{t("Request a new reset link", "Solicitar um novo link de redefinição")}</Link></div> : <form onSubmit={submit} className={tether ? "space-y-5" : "grid gap-4"}><label className="block"><span className={tether ? "mb-2 block text-sm font-medium text-white/82" : "mb-1 block text-sm text-muted"}>{t("New password", "Nova senha")}</span><Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" minLength={8} required className={tether ? tetherAuthInputClass : undefined} /></label><label className="block"><span className={tether ? "mb-2 block text-sm font-medium text-white/82" : "mb-1 block text-sm text-muted"}>{t("Confirm password", "Confirme a nova senha")}</span><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" autoComplete="new-password" minLength={8} required className={tether ? tetherAuthInputClass : undefined} /></label>{status === "error" && <p role="alert" className={tether ? "rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100" : "text-sm text-crit"}>{errorMessage}</p>}{tether ? <button type="submit" className={tetherAuthButtonClass} disabled={status === "saving"}>{status === "saving" ? t("Updating...", "Atualizando…") : t("Update password", "Atualizar senha")}</button> : <Button type="submit" className="w-full" disabled={status === "saving"}>{status === "saving" ? t("Updating...", "Atualizando…") : t("Update password", "Atualizar senha")}</Button>}</form>}
    </CreatorAuthFrame>
  );
}
