"use client";

import { useFlirtCreatorLocale } from "@/components/FlirtCreatorLocale";
import { useRef, useState, type ReactNode } from "react";
import { creatorInvitationMessage, type CreatorInvitationStatus } from "@/lib/creator-invitation-state";

/** Generic/invited signup only. Specialized verification flows keep their own form action. */
export default function CreatorSignupForm({ action, className, children, enhanced }: { action: string; className: string; children: ReactNode; enhanced: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const { t, locale } = useFlirtCreatorLocale();
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
        invalid: t("Check your name, email and password. Passwords must be at least 8 characters.", "Confira seu nome, e-mail e senha. A senha deve ter pelo menos 8 caracteres."),
        exists: t("An account already exists for this email. Sign in to continue.", "Já existe uma conta com esse e-mail. Entre para continuar."),
        incomplete: t("We couldn't confirm account setup. Try signing in; if that fails, contact your agency for help completing setup.", "Não foi possível confirmar a criação da sua conta. Tente entrar. Se não conseguir, peça ajuda à sua agência."),
      };
      const invitation = String(result.error || "").replace(/^invite_/, "") as CreatorInvitationStatus;
      setError(messages[result.error] || creatorInvitationMessage(invitation, locale) || t("We couldn't create your account. Please try again.", "Não foi possível criar sua conta. Tente novamente."));
    } catch { setError(t("We couldn't confirm account setup. Try signing in before retrying. Your name and email are still here.", "Não foi possível confirmar a criação da sua conta. Tente entrar antes de repetir o cadastro. Seu nome e e-mail continuam preenchidos.")); }
    finally {
      // Keep non-secret fields on a failed request. Never retain the password.
      const password = form.elements.namedItem("password");
      if (password instanceof HTMLInputElement) password.value = "";
      setPending(false);
    }
  } : undefined}>
    <fieldset disabled={pending} className={className}>{children}</fieldset>
    {pending && <p role="status" aria-live="polite">{t("Creating your account…", "Criando sua conta…")}</p>}
    {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm">{error}</p>}
  </form>;
}
