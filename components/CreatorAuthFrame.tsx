import type { ReactNode } from "react";
import LoginShell from "@/app/lynq/LoginShell";
import TwinWordmark from "./TwinWordmark";
import { Card, CardContent, CardHeader } from "./ui/card";
import type { CreatorPortal } from "@/lib/creator-portal";

export default function CreatorAuthFrame({ portal, heading, description, children }: { portal: CreatorPortal; heading: string; description: string; children: ReactNode }) {
  if (portal === "link") return <LoginShell heading={heading} description={description} footer="Your content. Your identity. Your LYNQ workspace.">{children}</LoginShell>;
  return <div className="grid min-h-screen bg-white lg:grid-cols-[1.08fr_0.92fr]">
    <section className="relative hidden overflow-hidden bg-[#06172f] p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,43,85,0.08),rgba(6,23,47,0.55)),url('/brand/twin-deep-texture.png')] bg-cover bg-center" />
      <div className="relative z-10"><TwinWordmark inverse /></div>
      <div className="relative z-10 max-w-2xl pb-10"><p className="mb-6 text-xs font-semibold uppercase tracking-[0.28em] text-white/60">Twin Creator</p><h1 className="font-heading text-5xl font-semibold leading-[1.02] tracking-[-0.045em] xl:text-6xl">Your content. Your identity. One place.</h1><p className="mt-6 max-w-xl text-base leading-relaxed text-white/68">Manage your Twin onboarding, content storage and connected creator profile.</p></div>
    </section>
    <section className="relative flex items-center justify-center overflow-hidden bg-bg px-5 py-12">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,23,47,0.08),rgba(255,255,255,0.34)),url('/brand/twin-blue-texture.png')] bg-cover bg-center" />
      <Card className="relative z-10 w-full max-w-md border-white/80 bg-white/90 shadow-[0_28px_70px_rgb(6_23_47/0.12)] backdrop-blur-xl">
        <CardHeader className="px-7 pt-7"><div className="mb-5 lg:hidden"><TwinWordmark /></div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-2">Creator Portal</p><h2 className="font-heading text-3xl font-semibold tracking-[-0.035em] text-ink">{heading}</h2><p className="text-sm text-muted">{description}</p></CardHeader>
        <CardContent className="px-7 pb-7">{children}</CardContent>
      </Card>
    </section>
  </div>;
}
