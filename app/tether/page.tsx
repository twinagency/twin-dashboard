import type { Metadata } from "next";
import IntelligenceCoreIcon from "@/components/IntelligenceCoreIcon";

export const metadata: Metadata = {
  title: "Sign in · Tether",
  description: "Tether agency workspace",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function TetherLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="relative flex min-h-screen overflow-hidden bg-[#06080c] px-5 py-12 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(56,189,248,0.13),transparent_30%),radial-gradient(circle_at_82%_78%,rgba(37,99,235,0.08),transparent_32%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-center lg:justify-between lg:gap-20">
        <section className="hidden max-w-lg lg:block">
          <div className="mb-8 inline-flex items-center gap-5">
            <div className="relative grid h-24 w-24 place-items-center">
              <div className="absolute inset-2 rounded-full bg-sky-400/15 blur-2xl" />
              <IntelligenceCoreIcon size={82} />
            </div>
            <div>
              <div className="text-4xl font-semibold tracking-[-0.045em]">Tether.</div>
              <div className="mt-1 text-xs font-bold uppercase tracking-[0.22em] text-sky-300">AI Intelligence Core</div>
            </div>
          </div>
          <h1 className="max-w-md text-5xl font-semibold leading-[1.03] tracking-[-0.055em] text-white">Your voice, cloned. Always online.</h1>
          <p className="mt-6 max-w-md text-base leading-7 text-white/55">Creator revenue, fan activity, conversations and AI operations in one private workspace.</p>
          <div className="mt-10 flex items-center gap-2 text-xs font-medium text-white/35"><span className="h-1.5 w-1.5 rounded-full bg-sky-300 shadow-[0_0_12px_rgba(125,211,252,0.8)]" /> Tether operator console</div>
        </section>

        <section className="w-full max-w-md">
          <div className="mb-9 flex items-center gap-4 lg:hidden">
            <div className="relative grid h-16 w-16 place-items-center">
              <div className="absolute inset-2 rounded-full bg-sky-400/15 blur-xl" />
              <IntelligenceCoreIcon size={58} />
            </div>
            <div>
              <div className="text-3xl font-semibold tracking-[-0.045em]">Tether.</div>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-sky-300">AI Intelligence Core</p>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-7 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-9">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-300/80">Agency workspace</p>
            <h2 className="mb-2 text-3xl font-semibold tracking-[-0.04em]">Sign in to Tether</h2>
            <p className="mb-8 text-sm leading-6 text-white/48">Private management access for the Tether team.</p>

            {error && <p role="alert" className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">Unable to sign in. Check your details and that your Tether access is active.</p>}

            <form action="/tether/auth" method="post" className="space-y-5">
              <div>
                <label htmlFor="tether-email" className="mb-2 block text-sm font-medium text-white/82">Email address</label>
                <input id="tether-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} className="w-full rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 text-base text-white outline-none transition placeholder:text-white/25 focus:border-sky-300/60 focus-visible:ring-2 focus-visible:ring-sky-300/15" />
              </div>
              <div>
                <label htmlFor="tether-password" className="mb-2 block text-sm font-medium text-white/82">Password</label>
                <input id="tether-password" name="password" type="password" autoComplete="current-password" required maxLength={256} className="w-full rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 text-base text-white outline-none transition focus:border-sky-300/60 focus-visible:ring-2 focus-visible:ring-sky-300/15" />
              </div>
              <button type="submit" className="w-full rounded-xl bg-white px-4 py-3.5 text-sm font-semibold text-[#080a0e] shadow-[0_8px_30px_rgba(255,255,255,0.08)] transition hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090b0f]">Sign in</button>
            </form>

            <div className="mt-7 flex items-center justify-between border-t border-white/8 pt-5 text-[11px] text-white/28">
              <span>Tether AI</span>
              <span>Secure operator access</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
