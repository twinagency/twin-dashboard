"use client";

import { useContext, type MouseEvent, type ReactNode } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { CreatorUploadActivity } from "./CreatorContentUploadProvider";
import { navigateCreatorSetup } from "@/lib/creator-setup-navigation";
import { ArrowUpRight, MoreHorizontal } from "lucide-react";
import styles from "./CreatorSetupLayout.module.css";

export const CREATOR_SETUP_NAVIGATE_EVENT = "creator-setup:navigate";
type CreatorSetupLayoutProps = {
  brand: "moxy" | "flirt" | "twin";
  logoSrc: string;
  activeSection: "questionnaire" | "content";
  applicationStatus?: string;
  children: ReactNode;
};
function navigate(event: MouseEvent<HTMLAnchorElement>, href: string, current = false, push?: (href: string) => void) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  event.currentTarget.closest("header")?.querySelector("details[open]")?.removeAttribute("open");
  if (!current) navigateCreatorSetup(href, push);
}
export default function CreatorSetupLayout({ brand, logoSrc, activeSection, applicationStatus, children }: CreatorSetupLayoutProps) {
  const router = useContext(AppRouterContext);
  const brandName = brand === "moxy" ? "Moxy AI" : brand === "twin" ? "Twin" : "FLIRT";
  return <div className={styles.root} data-creator-setup-brand={brand} data-creator-onboarding-brand={brand} data-creator-setup-section={activeSection}>
    <header className={styles.header}>
      <div className={styles.headerInner}>
        {brand === "twin" ? <span className={styles.twinWordmark} aria-label="Twin Technologies"><strong>Twin</strong><span>TECHNOLOGIES</span></span> : <img src={logoSrc} alt={brandName} className={styles.logo} />}
        <span className={styles.headerTitle}>Creator setup</span>
        <details className={styles.menu} onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.removeAttribute("open"); event.currentTarget.querySelector("summary")?.focus(); } }}>
          <summary aria-label="Setup menu"><MoreHorizontal size={24} /></summary>
          <div className={styles.menuPanel}>
            {applicationStatus && <span className={styles.applicationStatus} data-onboarding-application-state={applicationStatus} aria-label={`Onboarding status: ${applicationStatus}`}>{applicationStatus}</span>}
            <nav aria-label="Creator setup options">
              <a href="/creator/onboarding?step=content&review=1#creator-setup-submit" onClick={event => navigate(event, "/creator/onboarding?step=content&review=1#creator-setup-submit", false, router?.push)}>Review and finish</a>
            </nav>
            <a href="/creator" onClick={event => navigate(event, "/creator", false, router?.push)} data-creator-setup-dashboard data-onboarding-dashboard data-onboarding-skip-to-dashboard data-onboarding-skip-all>{activeSection === "questionnaire" ? "Save & exit" : "Go to dashboard"}<ArrowUpRight size={15} /></a>
            <form action="/creator-auth/logout" method="post"><button>Sign out</button></form>
          </div>
        </details>
      </div>
      <nav className={styles.steps} aria-label="Creator setup sections">
        <a href="/creator/onboarding?step=content" data-creator-setup-tab="content" aria-current={activeSection === "content" ? "step" : undefined} onClick={event => navigate(event, "/creator/onboarding?step=content", false, router?.push)}><span className={styles.stepNumber} aria-hidden="true">1</span>Content</a>
        <a href="/creator/onboarding?step=questionnaire" data-creator-setup-tab="questionnaire" aria-current={activeSection === "questionnaire" ? "step" : undefined} onClick={event => navigate(event, "/creator/onboarding?step=questionnaire", false, router?.push)}><span className={styles.stepNumber} aria-hidden="true">2</span>Questionnaire</a>
      </nav>
    </header>
    <main className={styles.main}>
      <div className={styles.content} data-onboarding-active-step={activeSection}>{activeSection === "questionnaire" && <CreatorUploadActivity />}{children}</div>
    </main>
  </div>;
}
