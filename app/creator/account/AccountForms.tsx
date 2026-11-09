"use client";

import { useFlirtCreatorLocale } from "@/components/FlirtCreatorLocale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const messages = {
  password_saved: ["Password updated.", "Senha atualizada."],
  email_saved: ["Sign-in email updated.", "E-mail de login atualizado."],
  email_pending: ["Check your inboxes for confirmation links. Keep using your current email until the change is confirmed.", "Confira suas caixas de entrada para confirmar a alteração. Continue usando seu e-mail atual até a confirmação."],
  password_required: ["Enter your current password.", "Digite sua senha atual."],
  wrong_password: ["Your current password is incorrect.", "Sua senha atual está incorreta."],
  invalid_password: ["Choose a different password with at least 8 characters and enter it twice.", "Escolha uma senha diferente com pelo menos 8 caracteres e digite-a duas vezes."],
  invalid_email: ["Enter a valid email address.", "Digite um endereço de e-mail válido."],
  same_email: ["This is already your sign-in email.", "Este já é o seu e-mail de login."],
  email_unavailable: ["This email address is unavailable.", "Este endereço de e-mail não está disponível."],
  rate_limited: ["Too many attempts. Please try again in a few minutes.", "Muitas tentativas. Tente novamente em alguns minutos."],
  failed: ["We couldn't update your account. Please try again.", "Não foi possível atualizar sua conta. Tente novamente."],
} as const;

export default function AccountForms({ email, pendingEmail, status }: {
  email?: string;
  pendingEmail?: string;
  status?: string;
}) {
  const { t } = useFlirtCreatorLocale();
  const message = status && Object.prototype.hasOwnProperty.call(messages, status) ? messages[status as keyof typeof messages] : null;
  const success = status === "password_saved" || status === "email_saved" || status === "email_pending";
  const currentPasswordField = (
    <label className="grid gap-2 text-sm font-medium">
      {t("Current password", "Senha atual")}
      <Input name="currentPassword" type="password" autoComplete="current-password" maxLength={1024} required />
    </label>
  );

  return (
    <section className="mx-auto grid max-w-2xl gap-5">
      <h1 className="text-2xl font-semibold text-ink">{t("Account settings", "Configurações da conta")}</h1>
      {message && <p role={success ? "status" : "alert"} className="rounded-xl border border-line bg-panel p-3 text-sm text-ink">{t(message[0], message[1])}</p>}
      {!email ? <p role="alert" className="text-sm text-ink">{t("We couldn't load your sign-in details. Please refresh the page.", "Não foi possível carregar seus dados de login. Atualize a página.")}</p> : <>
        <Card className="p-5">
          <h2 className="mb-3 text-lg font-semibold">{t("Sign-in email", "E-mail de login")}</h2>
          <p className="mb-2 break-all text-sm">{email}</p>
          {pendingEmail && <p className="mb-3 break-all text-sm text-muted">{t("Awaiting confirmation", "Aguardando confirmação")}: {pendingEmail}</p>}
          <form action="/creator-auth/account" method="post" className="grid gap-4">
            <input type="hidden" name="change" value="email" />
            <label className="grid gap-2 text-sm font-medium">
              {t("New email", "Novo e-mail")}
              <Input name="email" type="email" autoComplete="email" maxLength={254} required />
            </label>
            {currentPasswordField}
            <Button type="submit" className="w-fit">{t("Change email", "Alterar e-mail")}</Button>
          </form>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-lg font-semibold">{t("Password", "Senha")}</h2>
          <form action="/creator-auth/account" method="post" className="grid gap-4">
            <input type="hidden" name="change" value="password" />
            <input type="hidden" name="username" autoComplete="username" value={email} />
            {currentPasswordField}
            <label className="grid gap-2 text-sm font-medium">
              {t("New password (at least 8 characters)", "Nova senha (pelo menos 8 caracteres)")}
              <Input name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              {t("Confirm new password", "Confirme a nova senha")}
              <Input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
            </label>
            <Button type="submit" className="w-fit">{t("Change password", "Alterar senha")}</Button>
          </form>
        </Card>
      </>}
    </section>
  );
}
