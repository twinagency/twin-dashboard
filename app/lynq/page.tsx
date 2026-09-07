import TwinWordmark from "@/components/TwinWordmark";
import LynqLoginForm from "./LoginForm";

export const metadata = { title: "Sign in · LYNQ" };

export default async function LynqLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="flex min-h-screen items-center justify-center bg-bg px-5 py-12">
    <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-lg">
      <div className="mb-8"><TwinWordmark agencyName="LYNQ" /></div>
      <h1 className="mb-6 text-2xl font-semibold text-ink">Sign in</h1>
      <LynqLoginForm initialError={!!error} />
    </div>
  </main>;
}
