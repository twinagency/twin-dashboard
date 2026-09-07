import TwinWordmark from "@/components/TwinWordmark";

export const metadata = { title: "Sign in · LYNQ" };

export default async function AgencyLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="mx-auto flex min-h-screen max-w-md items-center p-6"><div className="w-full rounded-2xl border border-line bg-panel p-8 shadow-lg">
    <div className="mb-4"><TwinWordmark agencyName="LYNQ" /></div>
    <h1 className="mb-6 text-2xl font-semibold">Agency sign in</h1>
    {error && <p role="alert" className="mb-4 text-crit">Unable to sign in. Check your credentials and agency access.</p>}
    <form action="/agency/auth" method="post" className="space-y-4">
      <label className="block text-sm">Email<input name="email" type="email" autoComplete="username" required className="mt-2 w-full rounded-lg border border-line p-3" /></label>
      <label className="block text-sm">Password<input name="password" type="password" autoComplete="current-password" required className="mt-2 w-full rounded-lg border border-line p-3" /></label>
      <button className="w-full rounded-lg bg-accent p-3 font-semibold text-white">Sign in</button>
    </form>
    <a href="/login" className="mt-5 block text-center text-sm font-medium text-accent hover:underline">Admin sign in</a>
    </div></main>;
}
