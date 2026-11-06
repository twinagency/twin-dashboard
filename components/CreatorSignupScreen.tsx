import { getFlirtCreatorLocale } from "@/lib/flirt-creator-locale-server";
import { flirtCreatorCopy } from "@/lib/flirt-creator-locale";
import Link from "next/link";
import CreatorSignupForm from "@/components/CreatorSignupForm";
import { creatorInvitationMessage, type CreatorInvitationStatus } from "@/lib/creator-invitation-state";
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
import type { InviteAgency } from "@/lib/creator-invite-agency";
import { LINK_CREATOR_SIGNUP_ACTION, LINK_CREATOR_SIGNUP_STATUS } from "@/lib/link-creator-signup";
import { TETHER_CREATOR_SIGNUP_ACTION, TETHER_CREATOR_SIGNUP_STATUS } from "@/lib/tether-creator-signup";

function signupErrors(t: ReturnType<typeof flirtCreatorCopy>): Record<string, string> {
  return {
    invalid: t("Check your name, email and password. Passwords must be at least 8 characters.", "Confira seu nome, e-mail e senha. A senha deve ter pelo menos 8 caracteres."),
    agency_code: t("That agency code is invalid, expired or no longer available.", "Esse código da agência é inválido, expirou ou não está mais disponível."),
    exists: t("An account already exists for that email. Try signing in instead.", "Já existe uma conta com esse e-mail. Tente entrar."),
    failed: t("We couldn't create your account. Please try again.", "Não foi possível criar sua conta. Tente novamente."),
  };
}

export default async function CreatorSignupScreen({ searchParams, brand, initialAgencyCode, inviteAgency, invitationStatus }: { searchParams: Promise<{ error?: string; status?: string }>; brand: CreatorAuthBrand; initialAgencyCode?: string; inviteAgency?: InviteAgency | null; invitationStatus?: CreatorInvitationStatus }) {
  const { error, status } = await searchParams;
  const locale = await getFlirtCreatorLocale();
  const t = flirtCreatorCopy(locale);
  const errorCopy = signupErrors(t);
  const tether = brand === "tether";
  const link = brand === "link";
  // An agency invite link speaks for that agency. Presentation only: the code
  // itself is still validated and claimed by the signup route.
  const invited = brand === "twin" ? inviteAgency ?? null : null;
  // Tether's dark-on-black input/button styling is reused for any dark-brand
  // invite (Moxy today), rather than duplicating it, since both cases are the
  // same visual problem: white text needs to be legible on a black card.
  const darkForm = tether || !!invited?.dark;
  const paths = invited?.slug === "moxy" ? { ...creatorAuthPaths(brand), login: "/creator/moxy/login" } : creatorAuthPaths(brand);
  const invitationBlocked = invitationStatus && invitationStatus !== "valid";
  const directAgencySignup = tether || link;
  const signupAction = tether ? TETHER_CREATOR_SIGNUP_ACTION : link ? LINK_CREATOR_SIGNUP_ACTION : "/creator-auth/signup";
  const signupStatus = tether ? TETHER_CREATOR_SIGNUP_STATUS : link ? LINK_CREATOR_SIGNUP_STATUS : null;
  const authLinkClass = darkForm ? tetherAuthLinkClass : link ? linkAuthLinkClass : "font-medium text-accent-2 hover:underline";
  return (
    <CreatorAuthFrame
      brand={brand}
      locale={locale}
      agencyBrand={invited ? { name: invited.name, slug: invited.slug, logo: invited.logo, dark: invited.dark } : null}
      heroTitle={tether ? "Your creator workspace starts here." : link ? "Your LYNQ creator workspace starts here." : invited ? t(`Your ${invited.name} creator workspace starts here.`, `Seu estúdio na ${invited.name} começa aqui.`) : t("Build your FLIRT AI from one creator account.", "Crie sua IA na FLIRT com uma única conta de criadora.")}
      heroCopy={tether ? "Complete onboarding once, then access your Tether earnings, content and profile." : link ? "Complete onboarding once, then access your LYNQ earnings, content and profile." : invited ? t(`Complete onboarding once, then access your ${invited.name} earnings, content and profile.`, `Conclua o cadastro para acessar seus ganhos, conteúdo e perfil na ${invited.name}.`) : t("Start onboarding, upload your creator media and keep everything connected to your live FLIRT profile.", "Comece a configuração, envie seu conteúdo e vincule tudo ao seu perfil na FLIRT.")}
      eyebrow={t("Creator workspace", "Área da criadora")}
      title={tether ? "Join Tether" : link ? "Join LYNQ" : invited ? t(`Join ${invited.name}`, `Cadastre-se na ${invited.name}`) : t("Create account", "Criar conta")}
      description={tether ? "Create your account and your application will be connected directly to Tether for review." : link ? "Create your account and your application will be connected directly to LYNQ for review." : invited ? t(`Create your account and your application will be connected directly to ${invited.name} for review.`, `Crie sua conta. Seu cadastro será encaminhado à ${invited.name} para análise.`) : t("Agency code is optional. Leave it blank if you're joining FLIRT directly.", "O código da agência é opcional. Deixe em branco se estiver se cadastrando diretamente na FLIRT.")}
      footer={<span>{t("Already have an account?", "Já tem uma conta?")} <Link href={paths.login} className={authLinkClass}>{t("Sign in", "Entrar")}</Link></span>}
    >
      {invitationBlocked ? <div className="space-y-4"><p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm">{creatorInvitationMessage(invitationStatus, locale)}</p><form action="/creator/signup" method="get" className="grid gap-4"><label>{t("Invitation code", "Código do convite")}<Input name="code" defaultValue={initialAgencyCode} required autoCapitalize="characters" autoComplete="off" className={darkForm ? tetherAuthInputClass : undefined} /></label><Button type="submit">{t("Check invitation", "Verificar convite")}</Button></form></div> : directAgencySignup && status === signupStatus ? (
        <div className="space-y-5">
          <p className={tether ? "rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm leading-6 text-emerald-50" : "rounded-xl border border-good/25 bg-good/10 px-4 py-3 text-sm leading-6 text-ink"}>Check your email to confirm your address, then sign in to continue your {tether ? "Tether" : "LYNQ"} creator application.</p>
          <Link href={paths.login} className={`block text-center text-sm ${authLinkClass}`}>Go to creator sign in</Link>
        </div>
      ) : <CreatorSignupForm action={signupAction} enhanced={!directAgencySignup} className={darkForm ? "space-y-5" : "grid gap-4"}>
        {!directAgencySignup && <input type="hidden" name="portal" value="twin" />}
        <label className="block"><span className={darkForm ? "mb-2 block text-sm font-medium text-white/82" : "mb-1 block text-sm text-muted"}>{t("Creator name", "Nome de criadora")}</span><Input name="display_name" autoComplete="name" required autoFocus className={darkForm ? tetherAuthInputClass : undefined} /></label>
        <label className="block"><span className={darkForm ? "mb-2 block text-sm font-medium text-white/82" : "mb-1 block text-sm text-muted"}>{t("Email address", "E-mail")}</span><Input name="email" type="email" autoComplete="email" required className={darkForm ? tetherAuthInputClass : undefined} /></label>
        <label className="block"><span className={darkForm ? "mb-2 block text-sm font-medium text-white/82" : "mb-1 block text-sm text-muted"}>{t("Password", "Senha")}</span><Input name="password" type="password" minLength={8} autoComplete="new-password" required className={darkForm ? tetherAuthInputClass : undefined} /></label>
        {!directAgencySignup && (invited
          // Arrived on a valid invite: the code is theirs, not a field to fill in.
          ? <label className="block"><span className={darkForm ? "mb-2 block text-sm font-medium text-white/82" : "mb-1 block text-sm text-muted"}>{t(`${invited.name} invite code`, `Código de convite de ${invited.name}`)}</span><Input name="agency_code" defaultValue={initialAgencyCode} readOnly aria-readonly="true" className={darkForm ? tetherAuthInputClass + " opacity-70" : "bg-panel text-muted"} /></label>
          : <label className="block"><span className="mb-1 block text-sm text-muted">{t("Agency code", "Código da agência")} <span className="text-muted/70">{t("(optional)", "(opcional)")}</span></span><Input name="agency_code" defaultValue={initialAgencyCode} autoCapitalize="characters" autoComplete="off" placeholder={t("Enter code", "Digite o código")} /></label>)}
        {error && <p role="alert" className={darkForm ? "rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100" : "text-sm text-crit"}>{errorCopy[error] || creatorInvitationMessage(error.replace(/^invite_/, "") as CreatorInvitationStatus, locale) || errorCopy.failed}</p>}
        {darkForm ? <button type="submit" className={tetherAuthButtonClass}>{tether ? t("Create creator account", "Criar conta de criadora") : t("Create account", "Criar conta")}</button> : <Button type="submit" className="w-full">{link ? t("Create creator account", "Criar conta de criadora") : t("Create account", "Criar conta")}</Button>}
      </CreatorSignupForm>}
    </CreatorAuthFrame>
  );
}
