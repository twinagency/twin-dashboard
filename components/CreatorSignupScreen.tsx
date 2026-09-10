import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CreatorAuthFrame, { creatorAuthPaths, tetherAuthButtonClass, tetherAuthInputClass, tetherAuthLinkClass, type CreatorAuthBrand } from "@/components/CreatorAuthFrame";
const errorCopy: Record<string,string> = {
  invalid: "Check your name, email and password. Passwords must be at least 8 characters.",
  agency_code: "That agency code is invalid, expired or no longer available.",
  exists: "An account already exists for that email. Try signing in instead.",
  failed: "We couldn't create your account. Please try again.",
};
export default async function CreatorSignupScreen({ searchParams, brand = "twin" }: { searchParams: Promise<{ error?: string }>; brand?: CreatorAuthBrand }) {
  const { error } = await searchParams;
  const tether = brand === "tether", link = brand === "link";
  const paths = creatorAuthPaths(brand);
  return <CreatorAuthFrame brand={brand}
    heroTitle={link || tether ? "Your creator workspace starts here." : "Build your Twin from one creator account."}
    heroCopy={link ? "Create your LYNQ account, complete onboarding and open your own creator dashboard." : tether ? "Complete onboarding once, then access your Tether earnings, content and profile." : "Start onboarding, upload your creator media and keep everything connected to your live Twin profile."}
    eyebrow="Creator workspace" title={link ? "Join LYNQ as a creator" : tether ? "Join Tether" : "Create account"}
    description={link ? "Start with your account details. Next, complete your creator onboarding." : tether ? "Use the Tether creator invitation code supplied by your agency." : "Agency code is optional. Leave it blank if you're joining Twin directly."}
    footer={<span>Already have an account? <Link href={paths.login} className={tether ? tetherAuthLinkClass : "font-medium text-accent-2 hover:underline"}>Sign in</Link></span>}>
    <form action="/creator-auth/signup" method="post" className={tether ? "space-y-5" : "grid gap-4"}>
      <input type="hidden" name="portal" value={brand} />
      <label className="block"><span className={tether ? "mb-2 block text-sm font-medium text-white/82" : "mb-1 block text-sm text-muted"}>Creator name</span><Input name="display_name" autoComplete="name" required autoFocus className={tether ? tetherAuthInputClass : undefined} /></label>
      <label className="block"><span className={tether ? "mb-2 block text-sm font-medium text-white/82" : "mb-1 block text-sm text-muted"}>Email address</span><Input name="email" type="email" autoComplete="email" required className={tether ? tetherAuthInputClass : undefined} /></label>
      <label className="block"><span className={tether ? "mb-2 block text-sm font-medium text-white/82" : "mb-1 block text-sm text-muted"}>Password</span><Input name="password" type="password" minLength={8} autoComplete="new-password" required className={tether ? tetherAuthInputClass : undefined} /></label>
      {!link && <label className="block"><span className={tether ? "mb-2 block text-sm font-medium text-white/82" : "mb-1 block text-sm text-muted"}>Agency code <span className={tether ? "text-white/45" : "text-muted/70"}>{tether ? "(required)" : "(optional)"}</span></span><Input name="agency_code" autoCapitalize="characters" autoComplete="off" placeholder="Enter code" required={tether} className={tether ? tetherAuthInputClass : undefined} /></label>}
      {error && <p role="alert" className={tether ? "rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100" : "text-sm text-crit"}>{errorCopy[error] || errorCopy.failed}</p>}
      {tether ? <button type="submit" className={tetherAuthButtonClass}>Create creator account</button> : <Button type="submit" className="w-full">{link ? "Create creator account" : "Create account"}</Button>}
    </form>
  </CreatorAuthFrame>;
}
