import type { Metadata } from "next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import TwinWordmark from "@/components/TwinWordmark";

export const metadata: Metadata = { title: "Sign in · Twin Console", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// Generic agency sign-in for agencies without a branded portal, styled like
// the Twin admin login (app/login/page.tsx). Posts to /agency/auth, which
// accepts any active agency membership; a bare username maps to
// <username>@dashboard.tgaiclone.xyz there.
export default async function AgencyLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1.12fr_0.88fr]">
      <section className="relative hidden overflow-hidden bg-[#06172f] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,43,85,0.08),rgba(6,23,47,0.5)),url('/brand/twin-deep-texture.png')] bg-cover bg-center" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_700px_at_14%_12%,rgba(120,182,223,0.34),transparent_66%)]" />
        <div className="relative z-10">
          <TwinWordmark inverse />
        </div>
        <div className="relative z-10 max-w-2xl pb-10">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.28em] text-white/60">Intelligence infrastructure</p>
          <h1 className="font-heading text-5xl font-semibold leading-[1.02] tracking-[-0.045em] xl:text-6xl">
            One console. Every connected system.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-white/68">
            Revenue, fans and conversations across every creator, in one place.
          </p>
        </div>
      </section>
      <section className="relative flex items-center justify-center overflow-hidden bg-bg px-5 py-12">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,23,47,0.08),rgba(255,255,255,0.34)),url('/brand/twin-blue-texture.png')] bg-cover bg-center" />
        <Card className="relative z-10 w-full max-w-md border-white/80 bg-white/88 shadow-[0_28px_70px_rgb(6_23_47/0.12)] backdrop-blur-xl">
          <CardHeader className="px-7 pt-7">
            <div className="mb-5 lg:hidden"><TwinWordmark /></div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-2">Twin Console</p>
            <h2 className="font-heading text-3xl font-semibold tracking-[-0.035em] text-ink">Partner sign in</h2>
            <p className="text-sm text-muted">Use your Twin username and password.</p>
          </CardHeader>
          <CardContent className="px-7 pb-7">
            {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Unable to sign in. Check your details.</p>}
            <form action="/agency/auth" method="post" className="space-y-4">
              <div>
                <label htmlFor="agency-email" className="mb-1 block text-sm text-muted">Username</label>
                <input id="agency-email" name="email" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-base text-ink" />
              </div>
              <div>
                <label htmlFor="agency-password" className="mb-1 block text-sm text-muted">Password</label>
                <input id="agency-password" name="password" type="password" autoComplete="current-password" required maxLength={256} className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-base text-ink" />
              </div>
              <button type="submit" className="w-full rounded-lg bg-[#06172f] px-4 py-3 text-sm font-semibold text-white">Sign in</button>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
