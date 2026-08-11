import LoginForm from "./LoginForm";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import TwinWordmark from "@/components/TwinWordmark";

export const metadata = {
  title: "Sign in · Twin Console",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1.12fr_0.88fr]">
      <section className="relative hidden overflow-hidden bg-[#06172f] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,43,85,0.08),rgba(6,23,47,0.5)),url('/brand/twin-deep-texture.png')] bg-cover bg-center" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_700px_at_14%_12%,rgba(120,182,223,0.34),transparent_66%)]" />
        <div className="relative z-10">
          <TwinWordmark inverse />
        </div>
        <div className="relative z-10 max-w-2xl pb-10">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.28em] text-white/60">Intelligence infrastructure</p>
          <h1 className="font-heading text-5xl font-semibold leading-[1.02] tracking-[-0.045em] xl:text-6xl">
            One console. Every connected system.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-white/68">
            Operate identity, conversations, revenue and automation through the Twin intelligence platform.
          </p>
        </div>
      </section>
      <section className="relative flex items-center justify-center overflow-hidden bg-bg px-5 py-12">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,23,47,0.08),rgba(255,255,255,0.34)),url('/brand/twin-blue-texture.png')] bg-cover bg-center" />
        <Card className="relative z-10 w-full max-w-md border-white/80 bg-white/88 shadow-[0_28px_70px_rgb(6_23_47/0.12)] backdrop-blur-xl">
          <CardHeader className="px-7 pt-7">
            <div className="mb-5 lg:hidden"><TwinWordmark /></div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-2">Twin Console</p>
            <h2 className="font-heading text-3xl font-semibold tracking-[-0.035em] text-ink">Welcome back.</h2>
            <p className="text-sm text-muted">Sign in to continue to operations.</p>
          </CardHeader>
          <CardContent className="px-7 pb-7">
            <LoginForm next={next && next.startsWith("/") ? next : "/"} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
