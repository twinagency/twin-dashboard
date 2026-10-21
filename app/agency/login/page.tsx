import AgencyLoginForm from "./AgencyLoginForm";
import TwinWordmark from "@/components/TwinWordmark";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export const metadata = { title: "Agency sign in · Flirt" };

export default async function AgencyLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-bg px-5 py-12">
      <div aria-hidden="true" className="flirt-auth-texture absolute inset-0 bg-[linear-gradient(180deg,rgba(6,23,47,0.08),rgba(255,255,255,0.34)),url('/brand/twin-blue-texture.png')] bg-cover bg-center" />
      <Card className="relative z-10 w-full max-w-md border-white/80 bg-white/88 shadow-[0_28px_70px_rgb(6_23_47/0.12)] backdrop-blur-xl">
        <CardHeader className="px-7 pt-7">
          <div className="mb-5"><TwinWordmark /></div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-2">FLIRT Console</p>
          <h1 className="font-heading text-3xl font-semibold tracking-[-0.035em] text-ink">Agency sign in</h1>
          <p className="text-sm text-muted">Sign in to your agency workspace.</p>
        </CardHeader>
        <CardContent className="px-7 pb-7">
          <AgencyLoginForm error={!!error} />
        </CardContent>
      </Card>
    </main>
  );
}
