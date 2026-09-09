import Link from "next/link";
import TwinWordmark from "@/components/TwinWordmark";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Create creator account · Twin" };
export const dynamic = "force-dynamic";

const errorCopy: Record<string,string> = {
  invalid: "Check your name, email and password. Passwords must be at least 8 characters.",
  agency_code: "That agency code is invalid, expired or no longer available.",
  exists: "An account already exists for that email. Try signing in instead.",
  failed: "We couldn't create your account. Please try again.",
};

export default async function CreatorSignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative hidden overflow-hidden bg-[#06172f] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,43,85,0.08),rgba(6,23,47,0.55)),url('/brand/twin-deep-texture.png')] bg-cover bg-center" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_700px_at_14%_12%,rgba(120,182,223,0.34),transparent_66%)]" />
        <div className="relative z-10"><TwinWordmark inverse /></div>
        <div className="relative z-10 max-w-2xl pb-10">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.28em] text-white/60">Twin Creator</p>
          <h1 className="font-heading text-5xl font-semibold leading-[1.02] tracking-[-0.045em] xl:text-6xl">Build your Twin from one creator account.</h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-white/68">Start onboarding, upload your creator media and keep everything connected to your live Twin profile.</p>
        </div>
      </section>
      <section className="relative flex items-center justify-center overflow-hidden bg-bg px-5 py-12">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,23,47,0.08),rgba(255,255,255,0.34)),url('/brand/twin-blue-texture.png')] bg-cover bg-center" />
        <Card className="relative z-10 w-full max-w-md border-white/80 bg-white/90 shadow-[0_28px_70px_rgb(6_23_47/0.12)] backdrop-blur-xl">
          <CardHeader className="px-7 pt-7">
            <div className="mb-5 lg:hidden"><TwinWordmark /></div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-2">Creator Portal</p>
            <h2 className="font-heading text-3xl font-semibold tracking-[-0.035em] text-ink">Create account</h2>
            <p className="text-sm text-muted">Agency code is optional. Leave it blank if you're joining Twin directly.</p>
          </CardHeader>
          <CardContent className="px-7 pb-7">
            <form action="/creator-auth/signup" method="post" className="grid gap-4">
              <label className="block"><span className="mb-1 block text-sm text-muted">Creator name</span><Input name="display_name" autoComplete="name" required autoFocus /></label>
              <label className="block"><span className="mb-1 block text-sm text-muted">Email</span><Input name="email" type="email" autoComplete="email" required /></label>
              <label className="block"><span className="mb-1 block text-sm text-muted">Password</span><Input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
              <label className="block"><span className="mb-1 block text-sm text-muted">Agency code <span className="text-muted/70">(optional)</span></span><Input name="agency_code" autoCapitalize="characters" autoComplete="off" placeholder="Enter code" /></label>
              {error && <p className="text-sm text-crit">{errorCopy[error] || errorCopy.failed}</p>}
              <Button type="submit" className="w-full">Create account</Button>
            </form>
            <p className="mt-5 text-center text-sm text-muted">Already have an account? <Link href="/creator/login" className="font-medium text-accent-2 hover:underline">Sign in</Link></p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
