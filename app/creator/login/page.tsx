import Link from "next/link";
import CreatorAuthFrame from "@/components/CreatorAuthFrame";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { safeCreatorNext } from "@/lib/creator-routing";
import { getCreatorPortal } from "@/lib/creator-portal-server";
import { creatorPortalHref } from "@/lib/creator-portal";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ next?: string; error?: string; portal?: string }> };
export async function generateMetadata({ searchParams }: Props) {
  const portal = await getCreatorPortal((await searchParams).portal);
  return { title: `Creator sign in · ${portal === "link" ? "LYNQ" : "Twin"}` };
}
export default async function CreatorLoginPage({ searchParams }: Props) {
  const { next, error, portal: requested } = await searchParams;
  const portal = await getCreatorPortal(requested);
  const brand = portal === "link" ? "LYNQ" : "Twin";
  return <CreatorAuthFrame portal={portal} heading="Sign in" description={`Access your ${brand} creator account.`}>
    <form action="/creator-auth/login" method="post" className="grid gap-4">
      <input type="hidden" name="next" value={safeCreatorNext(next)} />
      <input type="hidden" name="portal" value={portal} />
      <label className="block"><span className="mb-1 block text-sm text-muted">Email</span><Input name="email" type="email" autoComplete="email" required autoFocus /></label>
      <label className="block"><span className="mb-1 flex items-center justify-between gap-3 text-sm text-muted"><span>Password</span><Link href={creatorPortalHref("/creator/forgot-password", portal)} className="font-medium text-accent hover:underline">Forgot password?</Link></span><Input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p role="alert" className="text-sm text-crit">Unable to sign in. Use the email and password for your creator account, not the agency login.</p>}
      <Button type="submit" className="w-full">Sign in</Button>
    </form>
    <p className="mt-5 text-center text-sm text-muted">New to {brand}? <Link href={creatorPortalHref("/creator/signup", portal)} className="font-medium text-accent hover:underline">Create creator account</Link></p>
  </CreatorAuthFrame>;
}
