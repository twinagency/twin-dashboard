"use client";

import Link from "@/components/NavigationLink";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ArrowRight, ChevronRight, Home, Images, Sparkles, Wallet, CreditCard, CircleHelp, LogOut, UserRound, Link2 } from "lucide-react";
import TwinWordmark from "./TwinWordmark";
import { useCurrency } from "./CurrencyProvider";
import type { CreatorStudioBrand, CreatorStudioStatus } from "@/lib/creator-studio-model";
import styles from "./CreatorStudio.module.css";

export function StudioAvatar({ name, photoUrl }: { name: string; photoUrl?: string }) {
  return <span className={styles.avatar}>{photoUrl ? <img src={photoUrl} alt="" /> : name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</span>;
}

export default function CreatorStudioShell({ brand, creatorName, photoUrl, status, contentHref, children }: {
  brand: CreatorStudioBrand; creatorName: string; photoUrl?: string; status: CreatorStudioStatus; contentHref: string; children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const { currency, setCurrency } = useCurrency();
  const items = brand === "moxy" ? [
    { href: "/creator", label: "Home", icon: Home },
    { href: contentHref, label: "Content", icon: Images },
    { href: status.linked ? "/creator/edit" : "/creator/onboarding?step=questionnaire", label: "Profile", icon: UserRound },
    { href: "/creator/platforms", label: "Platforms", icon: Link2 },
    { href: "/creator/earnings", label: "Earnings", icon: Wallet },
    { href: "/creator/payouts", label: "Payouts", icon: CreditCard },
  ] : [
    { href: "/creator", label: "Home", icon: Home },
    { href: contentHref, label: "My Content", icon: Images },
    { href: status.linked ? "/creator/edit" : "/creator/onboarding?step=questionnaire", label: "My AI", icon: Sparkles },
    { href: "/creator/earnings", label: "Earnings", icon: Wallet },
    { href: "/creator/payouts", label: "Payouts", icon: CreditCard },
    { href: "/creator/help", label: "Help", icon: CircleHelp },
  ];
  // A creator who leaves Home open sees server-side linking and review updates automatically.
  useEffect(() => {
    if (pathname !== "/creator") return;
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [router, pathname]);
  const selected = (href: string) => {
    const [path, query] = href.split("?");
    if (path !== pathname) return path === "/creator/platforms" && pathname.startsWith("/creator/onlyfans/");
    return !query || new URLSearchParams(query).get("step") === (search.get("step") || "content");
  };
  const label = items.find(item => selected(item.href))?.label || (pathname === "/creator/info" ? "Account details" : pathname === "/creator/help" ? "Help & support" : "My studio");
  // App Router preserves layouts during client navigation. Setup owns its
  // focused header, so never keep a second dashboard shell around it.
  if (brand === "moxy" && pathname === "/creator/onboarding") return <>{children}</>;
  const navigation = (mobile = false) => (mobile && brand === "moxy" ? items.slice(0, 4) : items).map(({ href, label, icon: Icon }) => <Link key={label} href={href} aria-current={selected(href) ? "page" : undefined} className={styles.navLink} data-creator-content-access={label === "My Content" || label === "Content" ? "true" : undefined} data-creator-onboarding-access={label === "My AI" || label === "Profile" ? "true" : undefined}><Icon size={19} aria-hidden="true" /><span>{mobile && label === "My Content" ? "Content" : label}</span></Link>);
  return <div className={styles.root} data-creator-studio={brand} data-creator-workspace-shell="true">
    <a className={styles.skipLink} href="#creator-studio-main">Skip to content</a>
    <aside className={styles.sidebar}>
      <Link className={styles.brand} href="/creator" aria-label={`${brand === "moxy" ? "Moxy" : "FLIRT"} home`}><TwinWordmark inverse agencyName={brand === "moxy" ? "Moxy" : "FLIRT"} /></Link>
      <p className={styles.brandCaption}>Creator studio</p>
      <p className={styles.navCaption}>YOUR WORKSPACE</p>
      <nav className={styles.nav} aria-label="Creator navigation">{navigation()}</nav>
      <div className={styles.sidebarBottom}>
        {brand === "moxy" ? <Link className={styles.sidebarHelp} href="/creator/help"><CircleHelp size={18} />Help & support</Link> : <div className={styles.helpNote}><h2>A little help, anytime.</h2><p>Guidance for every step of your creator journey.</p><Link href="/creator/help">Help & support <ArrowRight size={15} /></Link></div>}
        <div className={styles.sidebarProfile}><StudioAvatar name={creatorName} photoUrl={photoUrl} /><div><strong>{creatorName}</strong><small>Creator account</small></div><form action="/creator-auth/logout" method="post"><button aria-label="Sign out" title="Sign out"><LogOut size={17} /></button></form></div>
      </div>
    </aside>
    <div className={styles.workspace}>
      <header className={styles.topbar}>
        <div className={styles.breadcrumb}><span>Your studio</span><ChevronRight size={13} /><strong>{label}</strong></div>
        <Link className={styles.mobileBrand} href="/creator"><TwinWordmark agencyName={brand === "moxy" ? "Moxy" : "FLIRT"} /></Link>
        <div className={styles.topActions}>
          <span className={styles.status} data-phase={status.phase}><i />{status.label}</span>
          <label className={styles.currency} hidden={brand === "moxy" && !["/creator/earnings", "/creator/payouts"].includes(pathname)}><span className={styles.srOnly}>Display currency</span><select value={currency} onChange={event => setCurrency(event.target.value as "AUD" | "USD")}><option>AUD</option><option>USD</option></select></label>
          {brand === "moxy" ? <details className={styles.accountMenu}><summary aria-label="Account menu"><StudioAvatar name={creatorName} photoUrl={photoUrl} /></summary><div><Link href="/creator/info">Account details</Link><Link href="/creator/earnings">Earnings</Link><Link href="/creator/payouts">Payouts</Link><Link href="/creator/help">Help & support</Link><form action="/creator-auth/logout" method="post"><button type="submit"><LogOut size={15} />Sign out</button></form></div></details> : <form className={styles.mobileLogout} action="/creator-auth/logout" method="post"><button aria-label="Sign out"><LogOut size={17} /></button></form>}
        </div>
      </header>
      <main id="creator-studio-main" className={styles.main} tabIndex={-1}>{children}<footer className={styles.footer}>{brand === "moxy" ? <span>Moxy Creator Studio</span> : <><span>Made for you. Powered by Flirt.</span><span>Your space to grow ♡</span></>}</footer></main>
    </div>
    <nav className={styles.mobileNav} style={{ gridTemplateColumns: `repeat(${brand === "moxy" ? 4 : items.length}, minmax(0, 1fr))` }} aria-label="Mobile creator navigation">{navigation(true)}</nav>
  </div>;
}
