"use client";

import { useFlirtCreatorLocale } from "@/components/FlirtCreatorLocale";

import Link from "@/components/NavigationLink";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ArrowRight, ChevronRight, Home, Images, Sparkles, Wallet, CreditCard, CircleHelp, LogOut } from "lucide-react";
import TwinWordmark from "./TwinWordmark";
import { useCreatorCurrency } from "./useCreatorCurrency";
import { FlirtCreatorLanguageSwitch } from "./FlirtCreatorLocale";
import type { DisplayCurrency } from "@/lib/money";
import { creatorStudioStatusLabel, type CreatorStudioBrand, type CreatorStudioStatus } from "@/lib/creator-studio-model";
import styles from "./CreatorStudio.module.css";

export function StudioAvatar({ name, photoUrl }: { name: string; photoUrl?: string }) {
  return <span className={styles.avatar}>{photoUrl ? <img src={photoUrl} alt="" /> : name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</span>;
}

export default function CreatorStudioShell({ brand, creatorName, photoUrl, status, contentHref, children }: {
  brand: CreatorStudioBrand; creatorName: string; photoUrl?: string; status: CreatorStudioStatus; contentHref: string; children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, locale } = useFlirtCreatorLocale();
  const { currency, setCurrency, brlRate } = useCreatorCurrency();
  const items = [
    { href: "/creator", label: t("Home", "Início"), icon: Home },
    { href: contentHref, label: t("My Content", "Meu conteúdo"), icon: Images },
    { href: status.linked ? "/creator/edit" : "/creator/onboarding?step=questionnaire", label: t("My AI", "Minha IA"), icon: Sparkles },
    { href: "/creator/earnings", label: t("Earnings", "Ganhos"), icon: Wallet },
    { href: "/creator/payouts", label: t("Payouts", "Repasses"), icon: CreditCard },
    { href: "/creator/help", label: t("Help", "Ajuda"), icon: CircleHelp },
  ];
  // A creator who leaves Home open sees server-side linking and review updates automatically.
  useEffect(() => {
    if (pathname !== "/creator") return;
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [router, pathname]);
  const label = items.find(item => item.href.split("?")[0] === pathname)?.label || "My studio";
  const navigation = (mobile = false) => items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href.split("?")[0] ? "page" : undefined} className={styles.navLink} data-creator-content-access={href === contentHref ? "true" : undefined} data-creator-onboarding-access={Icon === Sparkles ? "true" : undefined}><Icon size={19} aria-hidden="true" /><span>{mobile && href === contentHref ? t("Content", "Conteúdo") : label}</span></Link>);
  return <div className={styles.root} data-creator-studio={brand} data-creator-workspace-shell="true">
    <a className={styles.skipLink} href="#creator-studio-main">{t("Skip to content", "Ir para o conteúdo")}</a>
    <aside className={styles.sidebar}>
      <Link className={styles.brand} href="/creator" aria-label={`${brand === "moxy" ? "Moxy" : "FLIRT"} home`}><TwinWordmark inverse agencyName={brand === "moxy" ? "Moxy" : "FLIRT"} /></Link>
      <p className={styles.brandCaption}>{t("Creator studio", "Estúdio da criadora")}</p>
      <p className={styles.navCaption}>{t("YOUR WORKSPACE", "SUA ÁREA")}</p>
      <nav className={styles.nav} aria-label={t("Creator navigation", "Navegação da criadora")}>{navigation()}</nav>
      <div className={styles.sidebarBottom}>
        <div className={styles.helpNote}><h2>{t("A little help, anytime.", "Precisa de ajuda?")}</h2><p>{t("Guidance for every step of your creator journey.", "Conte com a gente em cada etapa.")}</p><Link href="/creator/help">{t("Help & support", "Ajuda e suporte")} <ArrowRight size={15} /></Link></div>
        <div className={styles.sidebarProfile}><StudioAvatar name={creatorName} photoUrl={photoUrl} /><div><strong>{creatorName}</strong><small>{t("Creator account", "Conta da criadora")}</small></div><form action="/creator-auth/logout" method="post"><button aria-label={t("Sign out", "Sair")} title={t("Sign out", "Sair")}><LogOut size={17} /></button></form></div>
      </div>
    </aside>
    <div className={styles.workspace}>
      <header className={styles.topbar}>
        <div className={styles.breadcrumb}><span>{t("Your studio", "Seu estúdio")}</span><ChevronRight size={13} /><strong>{label}</strong></div>
        <Link className={styles.mobileBrand} href="/creator"><TwinWordmark agencyName={brand === "moxy" ? "Moxy" : "FLIRT"} /></Link>
        <div className={styles.topActions}>
          <FlirtCreatorLanguageSwitch />
          <span className={styles.status} data-phase={status.phase}><i />{creatorStudioStatusLabel(status, locale)}</span>
          <label className={styles.currency}><span className={styles.srOnly}>{t("Display currency", "Moeda de exibição")}</span><select value={currency} onChange={event => setCurrency(event.target.value as DisplayCurrency)}><option>AUD</option><option>USD</option>{locale === "pt-BR" && brlRate && <option>BRL</option>}</select></label>
          <form className={styles.mobileLogout} action="/creator-auth/logout" method="post"><button aria-label={t("Sign out", "Sair")}><LogOut size={17} /></button></form>
        </div>
      </header>
      <main id="creator-studio-main" className={styles.main} tabIndex={-1}>{children}<footer className={styles.footer}><span>{t("Made for you. Powered by", "Feito para você. Com a tecnologia da")} {brand === "moxy" ? "Moxy" : "Flirt"}.</span><span>{t("Your space to grow ♡", "Seu espaço para crescer ♡")}</span></footer></main>
    </div>
    <nav className={styles.mobileNav} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }} aria-label={t("Mobile creator navigation", "Navegação móvel da criadora")}>{navigation(true)}</nav>
  </div>;
}
