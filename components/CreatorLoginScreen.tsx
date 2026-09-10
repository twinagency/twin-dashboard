import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { safeCreatorNext } from "@/lib/creator-routing";
import CreatorAuthFrame, {
  creatorAuthPaths,
  linkAuthLinkClass,
  tetherAuthButtonClass,
  tetherAuthInputClass,
  tetherAuthLinkClass,
  type CreatorAuthBrand,
} from "@/components/CreatorAuthFrame";

export default async function CreatorLoginScreen({ searchParams, brand }: { searchParams: Promise<{ next?: string; error?: string }>; brand: CreatorAuthBrand }) {
  const { next, error } = await searchParams;
  const safeNext = safeCreatorNext(next);
  const tether = brand === "tether";
  const link = brand === "link";
  const paths = creatorAuthPaths(brand);
  const authLinkClass = tether ? tetherAuthLinkClass : link ? linkAuthLinkClass : "font-medium text-accent-2 hover:underline";
  return (
    <CreatorAuthFrame
      brand={brand}
      heroTitle={tether ? "Your voice, cloned. Always online." : link ? "Your content. Your identity. Your LYNQ workspace." : "Your content. Your identity. One place."}
      heroCopy={tether ? "Creator earnings, content and account activity in one private workspace." : link ? "Creator earnings, content and account activity in one private LYNQ workspace." : "Manage your Twin onboarding, content storage and connected creator profile."}
      eyebrow="Creator workspace"
      title={tether ? "Sign in to Tether" : link ? "Sign in to LYNQ" : "Sign in"}
      description={tether ? "Private creator access. Agency operator access remains separate." : link ? "Access your LYNQ creator account." : "Access your Twin creator account."}
      footer={<span>New here? <Link href={paths.signup} className={authLinkClass}>Create creator account</Link></span>}
    >
      <form action="/creator-auth/login" method="post" className={tether ? "space-y-5" : "grid gap-4"}>
        <input type="hidden" name="next" value={safeNext} />
        <input type="hidden" name="portal" value={brand} />
        <label className="block"><span className={tether ? "mb-2 block text-sm font-medium text-white/82" : "mb-1 block text-sm text-muted"}>Email address</span><Input name="email" type="email" autoComplete="email" required autoFocus className={tether ? tetherAuthInputClass : undefined} /></label>
        <label className="block"><span className={tether ? "mb-2 flex items-center justify-between gap-3 text-sm font-medium text-white/82" : "mb-1 flex items-center justify-between gap-3 text-sm text-muted"}><span>Password</span><Link href={paths.forgot} className={authLinkClass}>Forgot password?</Link></span><Input name="password" type="password" autoComplete="current-password" required className={tether ? tetherAuthInputClass : undefined} /></label>
        {error && <p role="alert" className={tether ? "rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100" : "text-sm text-crit"}>Unable to sign in. Check your details and try again.</p>}
        {tether ? <button type="submit" className={tetherAuthButtonClass}>Sign in</button> : <Button type="submit" className="w-full">Sign in</Button>}
      </form>
    </CreatorAuthFrame>
  );
}
