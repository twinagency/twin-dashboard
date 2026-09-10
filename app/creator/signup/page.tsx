import Link from "next/link";
import CreatorAuthFrame from "@/components/CreatorAuthFrame";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getCreatorPortal } from "@/lib/creator-portal-server";
import { creatorPortalHref } from "@/lib/creator-portal";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ error?: string; portal?: string }> };
export async function generateMetadata({ searchParams }: Props) {
  const portal = await getCreatorPortal((await searchParams).portal);
  return { title: `Create creator account · ${portal === "link" ? "LYNQ" : "Twin"}` };
}
const errorCopy: Record<string, string> = {
  invalid: "Check your name, email and password. Passwords must be at least 8 characters.",
  agency_code: "That agency code is invalid, expired or no longer available.",
  exists: "An account already exists for that email. Try signing in instead.",
  failed: "We couldn't create your account. Please try again.",
};
export default async function CreatorSignupPage({ searchParams }: Props) {
  const { error, portal: requested } = await searchParams;
  const portal = await getCreatorPortal(requested);
  return <CreatorAuthFrame portal={portal} heading="Create account" description={portal === "link" ? "Create your LYNQ creator account. Use your agency invitation code to connect your account to its team." : "Agency code is optional. Leave it blank if you're joining Twin directly."}>
    <form action="/creator-auth/signup" method="post" className="grid gap-4">
      <input type="hidden" name="portal" value={portal} />
      <label className="block"><span className="mb-1 block text-sm text-muted">Creator name</span><Input name="display_name" autoComplete="name" required autoFocus /></label>
      <label className="block"><span className="mb-1 block text-sm text-muted">Email</span><Input name="email" type="email" autoComplete="email" required /></label>
      <label className="block"><span className="mb-1 block text-sm text-muted">Password</span><Input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
      <label className="block"><span className="mb-1 block text-sm text-muted">Agency code <span className="text-muted/70">(optional)</span></span><Input name="agency_code" autoCapitalize="characters" autoComplete="off" placeholder="Enter code" /></label>
      {error && <p role="alert" className="text-sm text-crit">{errorCopy[error] || errorCopy.failed}</p>}
      <Button type="submit" className="w-full">Create account</Button>
    </form>
    <p className="mt-5 text-center text-sm text-muted">Already have an account? <Link href={creatorPortalHref("/creator/login", portal)} className="font-medium text-accent hover:underline">Sign in</Link></p>
  </CreatorAuthFrame>;
}
