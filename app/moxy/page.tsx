import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in · Moxy" };

export default async function MoxyLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const {error} = await searchParams;
  return <main className="moxy-login flex min-h-dvh items-center justify-center px-6 py-12">
    <div className="w-full max-w-sm">
      <img src="/moxy/logo.png" alt="Moxy, Los Angeles and Miami" width={1100} height={400} className="mx-auto mb-12 h-auto w-full" />
      <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-7 shadow-2xl sm:p-8">
        <h1 className="mb-7 text-2xl font-semibold tracking-tight text-white">Sign in</h1>
        <LoginForm initialError={!!error} />
      </div>
      {/* This is the operator/staff login (agency_memberships), never where a
          creator signs in or up. "Creator dashboard" here was mistaken for the
          creator entry point in practice; "Partner dashboard" matches how this
          portal is named everywhere else (see docs/moxy-portal.md). */}
      <p className="mt-8 text-center text-[10px] font-medium uppercase tracking-[0.25em] text-white/45">Partner dashboard</p>
    </div>
  </main>;
}
