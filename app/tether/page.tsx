import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in · Tether",
  description: "Tether agency workspace",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function TetherLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-5 py-12 text-black">
      <div className="w-full max-w-md">
        <div className="mb-10">
          <div className="text-3xl font-semibold tracking-tight">Tether.</div>
          <p className="mt-2 text-sm text-neutral-500">Your voice, always online.</p>
        </div>
        <div className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-[0_20px_70px_rgba(0,0,0,0.08)]">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">Agency workspace</p>
          <h1 className="mb-2 text-2xl font-semibold tracking-tight">Sign in to Tether</h1>
          <p className="mb-7 text-sm leading-6 text-neutral-500">Creator revenue, fan activity and performance in one place.</p>
          {error && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Unable to sign in. Check your details and that your Tether access is active.</p>}
          <form action="/tether/auth" method="post" className="space-y-5">
            <div>
              <label htmlFor="tether-email" className="mb-2 block text-sm font-medium">Email address</label>
              <input id="tether-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-base outline-none transition focus:border-black focus-visible:ring-2 focus-visible:ring-black/10" />
            </div>
            <div>
              <label htmlFor="tether-password" className="mb-2 block text-sm font-medium">Password</label>
              <input id="tether-password" name="password" type="password" autoComplete="current-password" required maxLength={256} className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-base outline-none transition focus:border-black focus-visible:ring-2 focus-visible:ring-black/10" />
            </div>
            <button type="submit" className="w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2">Sign in</button>
          </form>
          <p className="mt-6 text-xs leading-5 text-neutral-400">Private access for the Tether team.</p>
        </div>
      </div>
    </main>
  );
}
