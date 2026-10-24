import type { ReactNode } from "react";
import IntelligenceCoreIcon from "@/components/IntelligenceCoreIcon";
import TwinWordmark from "@/components/TwinWordmark";
import LynqLoginShell from "@/app/lynq/LoginShell";

export type CreatorAuthBrand = "link" | "twin" | "tether";

export const creatorAuthPaths = (brand: CreatorAuthBrand) => {
  const base = brand === "twin" ? "/creator" : `/creator/${brand}`;
  return {
    login: `${base}/login`,
    signup: `${base}/signup`,
    forgot: `${base}/forgot-password`,
    reset: `${base}/reset-password`,
  };
};

export default function CreatorAuthFrame({
  brand,
  heroTitle,
  heroCopy,
  eyebrow,
  title,
  description,
  children,
  footer,
  agencyBrand,
}: {
  brand: CreatorAuthBrand;
  heroTitle: string;
  heroCopy?: string;
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  // Present when the visitor arrived on an agency invite link, so the page
  // carries that agency's name and artwork instead of Twin's.
  agencyBrand?: { name: string; slug: string; logo: string | null; dark?: boolean } | null;
}) {
  // A dark-brand agency invite gets that agency's actual look (same shape as
  // its own /<slug> sign-in screen), not Twin's light two-panel layout with a
  // logo swapped in. Only reachable via brand === "twin" today.
  if (agencyBrand?.slug === "moxy") return <main data-creator-auth-brand="moxy" className="moxy-auth">
    <aside className="moxy-auth-brand">
      {agencyBrand.logo && <img src={agencyBrand.logo} alt="Moxy" />}
      <div><p>YOUR CREATOR STUDIO</p><h2>Your world.<br />A little closer.</h2><span>Your content, your personality, your next chapter.</span></div>
      <small>Moxy Creator Studio</small>
    </aside>
    <section className="moxy-auth-content"><div><p className="moxy-auth-eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="moxy-auth-description">{description}</p>}{children}{footer && <footer>{footer}</footer>}</div></section>
  </main>;
  if (agencyBrand?.dark) {
    return (
      // data-creator-auth-brand carries the agency's own slug (not "twin"), so
      // its dark-input CSS in globals.css stays scoped to this agency and never
      // leaks onto the plain Twin creator pages the same class name appears on.
      <main data-creator-auth-brand={agencyBrand.slug} className="flex min-h-dvh items-center justify-center bg-black px-6 py-12">
        <div className="w-full max-w-sm">
          {agencyBrand.logo
            ? <img src={agencyBrand.logo} alt={agencyBrand.name} className="mx-auto mb-12 h-auto w-full" />
            : <p className="mb-12 text-center text-3xl font-semibold text-white">{agencyBrand.name}</p>}
          <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-7 shadow-2xl sm:p-8">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/50">{eyebrow}</p>
            <h1 className="mb-2 text-2xl font-semibold tracking-tight text-white">{title}</h1>
            {description ? <p className="mb-6 text-sm leading-6 text-white/60">{description}</p> : null}
            {children}
          </div>
          {footer ? <div className="mt-6 text-center text-sm text-white/60">{footer}</div> : null}
          <p className="mt-8 text-center text-[10px] font-medium uppercase tracking-[0.25em] text-white/45">Creator workspace</p>
        </div>
      </main>
    );
  }
  if (brand === "link") {
    return (
      <LynqLoginShell
        creatorAuth
        eyebrow="LYNQ creator workspace"
        heading={title}
        description={description ?? heroCopy}
        footer={heroTitle}
      >
        {children}
        {footer ? <div className="mt-7 border-t border-[#e6e2ed] pt-5 text-center text-sm text-[#656575]">{footer}</div> : null}
      </LynqLoginShell>
    );
  }

  if (brand === "tether") {
    return (
      <main
        data-creator-auth-brand="tether"
        className="relative flex min-h-screen overflow-hidden bg-[#06080c] px-5 py-12 text-white"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(56,189,248,0.13),transparent_30%),radial-gradient(circle_at_82%_78%,rgba(37,99,235,0.08),transparent_32%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:48px_48px]" />

        <div className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-center lg:justify-between lg:gap-20">
          <section className="hidden max-w-lg lg:block">
            <div className="mb-8 inline-flex items-center gap-5">
              <div className="relative grid h-24 w-24 place-items-center">
                <div className="absolute inset-2 rounded-full bg-sky-400/15 blur-2xl" />
                <IntelligenceCoreIcon size={82} />
              </div>
              <div>
                <div className="text-4xl font-semibold tracking-[-0.045em]">Tether.</div>
                <div className="mt-1 text-xs font-bold uppercase tracking-[0.22em] text-sky-300">AI Intelligence Core</div>
              </div>
            </div>
            <h1 className="max-w-md text-5xl font-semibold leading-[1.03] tracking-[-0.055em] text-white">{heroTitle}</h1>
            {heroCopy ? <p className="mt-6 max-w-md text-base leading-7 text-white/55">{heroCopy}</p> : null}
            <div className="mt-10 flex items-center gap-2 text-xs font-medium text-white/35">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-300 shadow-[0_0_12px_rgba(125,211,252,0.8)]" />
              Tether creator workspace
            </div>
          </section>

          <section className="w-full max-w-md">
            <div className="mb-9 flex items-center gap-4 lg:hidden">
              <div className="relative grid h-16 w-16 place-items-center">
                <div className="absolute inset-2 rounded-full bg-sky-400/15 blur-xl" />
                <IntelligenceCoreIcon size={58} />
              </div>
              <div>
                <div className="text-3xl font-semibold tracking-[-0.045em]">Tether.</div>
                <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-sky-300">AI Intelligence Core</p>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-7 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-9">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-300/80">{eyebrow}</p>
              <h2 className="mb-2 text-3xl font-semibold tracking-[-0.04em]">{title}</h2>
              {description ? <p className="mb-8 text-sm leading-6 text-white/48">{description}</p> : null}
              {children}
              {footer ? <div className="mt-7 border-t border-white/8 pt-5 text-sm text-white/48">{footer}</div> : null}
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative hidden overflow-hidden bg-[#06172f] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,43,85,0.08),rgba(6,23,47,0.55)),url('/brand/twin-deep-texture.png')] bg-cover bg-center" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_700px_at_14%_12%,rgba(120,182,223,0.34),transparent_66%)]" />
        <div className="relative z-10">{agencyBrand
          ? (agencyBrand.logo
            ? <img src={agencyBrand.logo} alt={agencyBrand.name} className="h-auto w-56 max-w-full" />
            : <span className="font-heading text-3xl font-semibold tracking-[-0.03em] text-white">{agencyBrand.name}</span>)
          : <TwinWordmark inverse />}</div>
        <div className="relative z-10 max-w-2xl pb-10">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.28em] text-white/60">{agencyBrand ? `${agencyBrand.name} Creator` : "Twin Creator"}</p>
          <h1 className="font-heading text-5xl font-semibold leading-[1.02] tracking-[-0.045em] xl:text-6xl">{heroTitle}</h1>
          {heroCopy ? <p className="mt-6 max-w-xl text-base leading-relaxed text-white/68">{heroCopy}</p> : null}
        </div>
      </section>
      <section className="relative flex items-center justify-center overflow-hidden bg-bg px-5 py-12">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,23,47,0.08),rgba(255,255,255,0.34)),url('/brand/twin-blue-texture.png')] bg-cover bg-center" />
        <div className="relative z-10 w-full max-w-md rounded-xl border border-white/80 bg-white/90 px-7 pb-7 pt-7 shadow-[0_28px_70px_rgb(6_23_47/0.12)] backdrop-blur-xl">
          {/* Light card: the agency's name in ink, since a white-on-dark logo would vanish here. */}
          <div className="mb-5 lg:hidden">{agencyBrand ? <span className="font-heading text-2xl font-semibold tracking-[-0.03em] text-ink">{agencyBrand.name}</span> : <TwinWordmark />}</div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-2">{eyebrow}</p>
          <h2 className="font-heading text-3xl font-semibold tracking-[-0.035em] text-ink">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
          <div className="mt-6">{children}</div>
          {footer ? <div className="mt-5 text-center text-sm text-muted">{footer}</div> : null}
        </div>
      </section>
    </div>
  );
}

export const tetherAuthInputClass = "tether-auth-input w-full rounded-xl border border-white/20 bg-white px-3.5 py-3 text-base text-[#080a0e] caret-[#080a0e] shadow-[0_1px_0_rgba(255,255,255,0.08),0_8px_24px_rgba(0,0,0,0.14)] outline-none transition placeholder:text-[#667085] hover:border-white/35 focus:border-sky-300 focus:bg-white focus-visible:ring-2 focus-visible:ring-sky-300/25";
export const tetherAuthButtonClass = "w-full rounded-xl bg-white px-4 py-3.5 text-sm font-semibold text-[#080a0e] shadow-[0_8px_30px_rgba(255,255,255,0.08)] transition hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090b0f] disabled:cursor-not-allowed disabled:opacity-60";
export const tetherAuthLinkClass = "font-medium text-sky-300 hover:text-sky-200 hover:underline";
export const linkAuthLinkClass = "font-medium text-[#293bea] hover:text-[#202fb7] hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#293bea]/30";
