import Link from "next/link";
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

const errorCopy: Record<string,string> = {
  invalid: "Check your name, email and password. Passwords must be at least 8 characters.",
  agency_code: "That agency code is invalid, expired or no longer available.",
  exists: "An account already exists for that email. Try signing in instead.",
  failed: "We couldn't create your account. Please try again.",
};

export default async function CreatorSignupScreen({ searchParams, brand, initialAgencyCode, inviteAgency }: { searchParams: Promise<{ error?: string; status?: string }>; brand: CreatorAuthBrand; initialAgencyCode?: string; inviteAgency?: InviteAgency | null }) {
  const { error, status } = await searchParams;
  const tether = brand === "tether";
  const link = brand === "link";
  // An agency invite link speaks for that agency. Presentation only: the code
  // itself is still validated and claimed by the signup route.
  const invited = brand === "twin" ? inviteAgency ?? null : null;
  // Tether's dark-on-black input/button styling is reused for any dark-brand
  // invite (Moxy today), rather than duplicating it, since both cases are the
  // same visual problem: white text needs to be legible on a black card.
  const darkForm = tether || !!invited?.dark;
  const paths = creatorAuthPaths(brand);
  const directAgencySignup = tether || link;
  const signupAction = tether ? TETHER_CREATOR_SIGNUP_ACTION : link ? LINK_CREATOR_SIGNUP_ACTION : "/creator-auth/signup";
  const signupStatus = tether ? TETHER_CREATOR_SIGNUP_STATUS : link ? LINK_CREATOR_SIGNUP_STATUS : null;
  const authLinkClass = darkForm ? tetherAuthLinkClass : link ? linkAuthLinkClass : "font-medium text-accent-2 hover:underline";
  return (
    <CreatorAuthFrame
      brand={brand}
      agencyBrand={invited ? { name: invited.name, slug: invited.slug, logo: invited.logo, dark: invited.dark } : null}
      heroTitle={tether ? "Your creator workspace starts here." : link ? "Your LYNQ creator workspace starts here." : invited ? `Your ${invited.name} creator workspace starts here.` : "Build your FLIRT AI from one creator account."}
      heroCopy={tether ? "Complete onboarding once, then access your Tether earnings, content and profile." : link ? "Complete onboarding once, then access your LYNQ earnings, content and profile." : invited ? `Complete onboarding once, then access your ${invited.name} earnings, content and profile.` : "Start onboarding, upload your creator media and keep everything connected to your live FLIRT profile."}
      eyebrow="Creator workspace"
      title={tether ? "Join Tether" : link ? "Join LYNQ" : invited ? `Join ${invited.name}` : "Create account"}
      description={tether ? "Create your account and your application will be connected directly to Tether for review." : link ? "Create your account and your application will be connected directly to LYNQ for review." : invited ? `Create your account and your application will be connected directly to ${invited.name} for review.` : "Agency code is optional. Leave it blank if you're joining FLIRT directly."}
      footer={<span>Already have an account? <Link href={paths.login} className={authLinkClass}>Sign in</Link></span>}
    >
      {directAgencySignup && status === signupStatus ? (
        <div className="space-y-5">
          <p className={tether ? "rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm leading-6 text-emerald-50" : "rounded-xl border border-good/25 bg-good/10 px-4 py-3 text-sm leading-6 text-ink"}>Check your email to confirm your address, then sign in to continue your {tether ? "Tether" : "LYNQ"} creator application.</p>
          <Link href={paths.login} className={`block text-center text-sm ${authLinkClass}`}>Go to creator sign in</Link>
        </div>
      ) : <form action={signupAction} method="post" className={darkForm ? "space-y-5" : "grid gap-4"}>
        {!directAgencySignup && <input type="hidden" name="portal" value="twin" />}
        <label className="block"><span className={darkForm ? "mb-2 block text-sm font-medium text-white/82" : "mb-1 block text-sm text-muted"}>Creator name</span><Input name="display_name" autoComplete="name" required autoFocus className={darkForm ? tetherAuthInputClass : undefined} /></label>
        <label className="block"><span className={darkForm ? "mb-2 block text-sm font-medium text-white/82" : "mb-1 block text-sm text-muted"}>Email address</span><Input name="email" type="email" autoComplete="email" required className={darkForm ? tetherAuthInputClass : undefined} /></label>
        <label className="block"><span className={darkForm ? "mb-2 block text-sm font-medium text-white/82" : "mb-1 block text-sm text-muted"}>Password</span><Input name="password" type="password" minLength={8} autoComplete="new-password" required className={darkForm ? tetherAuthInputClass : undefined} /></label>
        {!directAgencySignup && (invited
          // Arrived on a valid invite: the code is theirs, not a field to fill in.
          ? <label className="block"><span className={darkForm ? "mb-2 block text-sm font-medium text-white/82" : "mb-1 block text-sm text-muted"}>{invited.name} invite code</span><Input name="agency_code" defaultValue={initialAgencyCode} readOnly aria-readonly="true" className={darkForm ? tetherAuthInputClass + " opacity-70" : "bg-panel text-muted"} /></label>
          : <label className="block"><span className="mb-1 block text-sm text-muted">Agency code <span className="text-muted/70">(optional)</span></span><Input name="agency_code" defaultValue={initialAgencyCode} autoCapitalize="characters" autoComplete="off" placeholder="Enter code" /></label>)}
        {error && <p role="alert" className={darkForm ? "rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100" : "text-sm text-crit"}>{errorCopy[error] || errorCopy.failed}</p>}
        {darkForm ? <button type="submit" className={tetherAuthButtonClass}>{tether ? "Create creator account" : "Create account"}</button> : <Button type="submit" className="w-full">{link ? "Create creator account" : "Create account"}</Button>}
      </form>}
    </CreatorAuthFrame>
  );
}
