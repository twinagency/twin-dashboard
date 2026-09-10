import type { Metadata } from "next";
import TwinWordmark from "@/components/TwinWordmark";
import { TETHER_PORTAL } from "@/lib/partner-portals";

export const metadata: Metadata = {
  title: "Sign in · Tether",
  description: "Tether agency workspace",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function TetherLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-5 py-12">
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-lg">
        <div className="mb-8"><TwinWordmark agencyName={TETHER_PORTAL.name} /></div>
        <p className="mb-2 text-xs font-medium tracking-wider text-muted">Agency workspace</p>
        <h1 className="mb-2 text-2xl font-semibold text-ink">Sign in to Tether</h1>
        <p className="mb-7 text-sm leading-6 text-muted">Manage your creators, earnings and reports in one place.</p>
        {error && <p role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Unable to sign in. Check your details and that your Tether access is active.</p>}
        <form action="/tether/auth" method="post" className="space-y-5">
          <div>
            <label htmlFor="tether-email" className="mb-2 block text-sm font-medium text-ink">Email address</label>
            <input id="tether-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} className="w-full rounded-lg border border-line bg-white px-3 py-3 text-base text-ink outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2" />
          </div>
          <div>
            <label htmlFor="tether-password" className="mb-2 block text-sm font-medium text-ink">Password</label>
            <input id="tether-password" name="password" type="password" autoComplete="current-password" required maxLength={256} className="w-full rounded-lg border border-line bg-white px-3 py-3 text-base text-ink outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2" />
          </div>
          <button type="submit" className="w-full rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2">Sign in</button>
        </form>
        <p className="mt-6 text-xs leading-5 text-muted">Private access for the Tether team. Your account must be enabled by the workspace owner.</p>
      </div>
    </main>
  );
}
