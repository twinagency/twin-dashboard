import TwinWordmark from "@/components/TwinWordmark";
import PortalLoginForm from "@/app/lynq/LoginForm";
import { JESS_KATE_PORTAL } from "@/lib/partner-portals";

export const metadata = { title: "Sign in · Ava" };
export const dynamic = "force-dynamic";
export default async function JessKateLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="flex min-h-screen items-center justify-center bg-bg px-5 py-12">
    <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-lg">
      <div className="mb-8"><TwinWordmark agencyName={JESS_KATE_PORTAL.name} /></div>
      <h1 className="mb-6 text-2xl font-semibold text-ink">Sign in</h1>
      <PortalLoginForm action="/jess-and-kate-ai/auth" initialError={!!error} />
    </div>
  </main>;
}
