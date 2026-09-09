import Link from "next/link";
import TwinWordmark from "@/components/TwinWordmark";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { safeCreatorNext } from "@/lib/creator-routing";

export const metadata = { title: "Creator sign in · Twin" };
export const dynamic = "force-dynamic";

export default async function CreatorLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const safeNext = safeCreatorNext(next);
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative hidden overflow-hidden bg-[#06172f] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,43,85,0.08),rgba(6,23,47,0.55)),url('/brand/twin-deep-texture.png')] bg-cover bg-center" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_700px_at_14%_12%,rgba(120,182,223,0.34),transparent_66%)]" />
        <div className="relative z-10"><TwinWordmark inverse /></div>
        <div className="relative z-10 max-w-2xl pb-10">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.28em] text-white/60">Twin Creator</p>
          <h1 className="font-heading text-5xl font-semibold leading-[1.02] tracking-[-0.045em] xl:text-6xl">Your content. Your identity. One place.</h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-white/68">Manage your Twin onboarding, content storage and connected creator profile.</p>
        </div>
      </section>
      <section className="relative flex items-center justify-center overflow-hidden bg-bg px-5 py-12">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,23,47,0.08),rgba(255,255,255,0.34)),url('/brand/twin-blue-texture.png')] bg-cover bg-center" />
        <Card className="relative z-10 w-full max-w-md border-white/80 bg-white/90 shadow-[0_28px_70px_rgb(6_23_47/0.12)] backdrop-blur-xl">
          <CardHeader className="px-7 pt-7">
            <div className="mb-5 lg:hidden"><TwinWordmark /></div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-2">Creator Portal</p>
            <h2 className="font-heading text-3xl font-semibold tracking-[-0.035em] text-ink">Sign in</h2>
            <p className="text-sm text-muted">Access your Twin creator account.</p>
          </CardHeader>
          <CardContent className="px-7 pb-7">
            <form action="/creator-auth/login" method="post" className="grid gap-4">
              <input type="hidden" name="next" value={safeNext} />
              <label className="block"><span className="mb-1 block text-sm text-muted">Email</span><Input name="email" type="email" autoComplete="email" required autoFocus /></label>
              <label className="block"><span className="mb-1 flex items-center justify-between gap-3 text-sm text-muted"><span>Password</span><Link href="/creator/forgot-password" className="font-medium text-accent-2 hover:underline">Forgot password?</Link></span><Input name="password" type="password" autoComplete="current-password" required /></label>
              {error && <p className="text-sm text-crit">Unable to sign in. Check your details and try again.</p>}
              <Button type="submit" className="w-full">Sign in</Button>
            </form>
            <p className="mt-5 text-center text-sm text-muted">New to Twin? <Link href="/creator/signup" className="font-medium text-accent-2 hover:underline">Create creator account</Link></p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
