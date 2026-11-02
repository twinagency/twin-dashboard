export const metadata = { title: "Reset password · LYNQ" };
export const dynamic = "force-dynamic";

export default async function LynqResetPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string; done?: string }> }) {
  const { token = "", error, done } = await searchParams;
  return <main className="flex min-h-screen items-center justify-center bg-bg px-5 py-12">
    <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-lg">
      <div className="mb-7 text-2xl font-bold tracking-tight text-ink">LYNQ</div>
      <h1 className="mb-3 text-2xl font-semibold text-ink">Reset password</h1>
      <p className="mb-6 text-sm text-muted">Set a new password for the LYNQ dashboard account.</p>
      {error && <p className="mb-5 text-sm text-crit">The reset link is invalid, expired, or the password could not be changed.</p>}
      {done ? <div className="space-y-4"><p className="text-sm font-medium text-good">Password changed successfully.</p><a href="/link" className="block w-full rounded-lg bg-accent p-3 text-center font-semibold text-white">Go to sign in</a></div> : <form action="/link/reset/auth" method="post" className="space-y-5">
        <input type="hidden" name="token" value={token} />
        <label className="block text-sm font-medium text-ink">New password
          <input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={256} className="mt-2 w-full rounded-lg border border-line bg-white p-3" />
        </label>
        <button type="submit" className="w-full rounded-lg bg-accent p-3 font-semibold text-white">Change password</button>
      </form>}
    </div>
  </main>;
}
