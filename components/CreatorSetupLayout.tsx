"use client";

import type { MouseEvent, ReactNode } from "react";
import { ArrowUpRight, FileText, Images } from "lucide-react";
import styles from "./CreatorSetupLayout.module.css";

export const CREATOR_SETUP_NAVIGATE_EVENT = "creator-setup:navigate";

type CreatorSetupLayoutProps = {
  brand: "moxy" | "flirt";
  logoSrc: string;
  activeSection: "questionnaire" | "content";
  applicationStatus?: string;
  children: ReactNode;
};

/** Both sections stay open. A mounted questionnaire can flush its draft first. */
function navigate(event: MouseEvent<HTMLAnchorElement>, href: string, current = false) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (current) return;
  const request = new CustomEvent(CREATOR_SETUP_NAVIGATE_EVENT, {
    cancelable: true,
    detail: { href },
  });
  if (window.dispatchEvent(request)) window.location.assign(href);
}

export default function CreatorSetupLayout({ brand, logoSrc, activeSection, applicationStatus, children }: CreatorSetupLayoutProps) {
  const brandName = brand === "moxy" ? "Moxy" : "FLIRT";
  return (
    <div className={styles.root} data-creator-setup-brand={brand} data-creator-onboarding-brand={brand}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <img src={logoSrc} alt={brandName} className={styles.logo} />
          <div className={styles.headerActions}>
            <a href="/creator" onClick={(event) => navigate(event, "/creator")} className={styles.dashboard} data-creator-setup-dashboard data-onboarding-dashboard data-onboarding-skip-to-dashboard data-onboarding-skip-all>
              Go to dashboard <ArrowUpRight size={16} aria-hidden="true" />
            </a>
            <form action="/creator-auth/logout" method="post"><button className={styles.signOut}>Sign out</button></form>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.intro}>
          <div>
            <p className={styles.eyebrow}>Creator setup</p>
            <h1>Make your AI feel like you.</h1>
            <p className={styles.subtitle}>Complete these sections in any order. You can come back whenever you like.</p>
          </div>
          {applicationStatus && <span className={styles.applicationStatus} data-onboarding-application-state={applicationStatus} aria-label={`Onboarding status: ${applicationStatus}`}>{applicationStatus}</span>}
        </div>

        <nav className={styles.tabs} aria-label="Creator setup sections">
          <a href="/creator/onboarding?step=questionnaire" className={`${styles.tab} ${activeSection === "questionnaire" ? styles.activeTab : ""}`}
            aria-current={activeSection === "questionnaire" ? "page" : undefined} data-creator-setup-tab="questionnaire"
            onClick={(event) => navigate(event, "/creator/onboarding?step=questionnaire", activeSection === "questionnaire")}>
            <FileText size={18} aria-hidden="true" /> About you
          </a>
          <a href="/creator/onboarding?step=content" className={`${styles.tab} ${activeSection === "content" ? styles.activeTab : ""}`}
            aria-current={activeSection === "content" ? "page" : undefined} data-creator-setup-tab="content"
            onClick={(event) => navigate(event, "/creator/onboarding?step=content", activeSection === "content")}>
            <Images size={18} aria-hidden="true" /> Your content
          </a>
        </nav>

        <div className={styles.content} data-onboarding-active-step={activeSection}>{children}</div>
        <footer className={styles.footer}>Your profile, your pace.</footer>
      </main>
    </div>
  );
}
