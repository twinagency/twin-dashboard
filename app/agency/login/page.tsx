import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in · Twin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// Generic agency sign-in for agencies without a branded portal. Posts to
// /agency/auth, which accepts any active agency membership.
export default async function AgencyLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-12 text-ink">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-7 shadow-sm">
        <h1 className="mb-6 text-2xl font-semibold">Sign in</h1>
        {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Unable to sign in. Check your details.</p>}
        <form action="/agency/auth" method="post" className="space-y-4">
          <div>
            <label htmlFor="agency-email" className="mb-1 block text-sm text-muted">Username or email</label>
            <input id="agency-email" name="email" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} className="w-full rounded-lg border border-line px-3 py-2.5 text-base" />
          </div>
          <div>
            <label htmlFor="agency-password" className="mb-1 block text-sm text-muted">Password</label>
            <input id="agency-password" name="password" type="password" autoComplete="current-password" required maxLength={256} className="w-full rounded-lg border border-line px-3 py-2.5 text-base" />
          </div>
          <button type="submit" className="w-full rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-white">Sign in</button>
        </form>
      </div>
    </main>
  );
}
