import TwinWordmark from "@/components/TwinWordmark";

export const metadata = { title: "Sign in · LYNQ" };

export default async function LynqLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="flex min-h-screen items-center justify-center bg-bg px-5 py-12">
    <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-lg">
      <div className="mb-8"><TwinWordmark agencyName="LYNQ" /></div>
      <h1 className="mb-6 text-2xl font-semibold text-ink">Sign in</h1>
      {error && <p role="alert" className="mb-4 text-sm text-crit">Unable to sign in. Please check your password and try again.</p>}
      <form action="/lynq/auth" method="post" className="space-y-5">
        <label className="block text-sm font-medium text-ink">Password
          <input name="password" type="password" autoComplete="current-password" required maxLength={256} className="mt-2 w-full rounded-lg border border-line bg-white p-3" />
        </label>
        <button type="submit" className="w-full rounded-lg bg-accent p-3 font-semibold text-white">Sign in</button>
      </form>
    </div>
  </main>;
}
