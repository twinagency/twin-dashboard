"use client";

import { useContext, type MouseEvent, type ReactNode } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { CreatorUploadActivity } from "./CreatorContentUploadProvider";
import { navigateCreatorSetup } from "@/lib/creator-setup-navigation";
import { ArrowUpRight, FileText, Images } from "lucide-react";
import styles from "./CreatorSetupLayout.module.css";

export const CREATOR_SETUP_NAVIGATE_EVENT = "creator-setup:navigate";

type CreatorSetupLayoutProps = {
  brand: "moxy" | "flirt" | "twin";
  logoSrc: string;
  activeSection: "questionnaire" | "content";
  applicationStatus?: string;
  children: ReactNode;
};

/** Both sections stay open. A mounted questionnaire can flush its draft first. */
function navigate(event: MouseEvent<HTMLAnchorElement>, href: string, current = false, push?: (href: string) => void) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (current) return;
  navigateCreatorSetup(href, push);
}

export default function CreatorSetupLayout({ brand, logoSrc, activeSection, applicationStatus, children }: CreatorSetupLayoutProps) {
  const router = useContext(AppRouterContext);
  const brandName = brand === "moxy" ? "Moxy" : brand === "twin" ? "Twin" : "FLIRT";
  return (
    <div className={styles.root} data-creator-setup-brand={brand} data-creator-onboarding-brand={brand} data-creator-setup-section={activeSection}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          {brand === "twin" ? <span className={styles.twinWordmark} aria-label="Twin Technologies"><strong>Twin</strong><span>TECHNOLOGIES</span></span> : <img src={logoSrc} alt={brandName} className={styles.logo} />}
          <div className={styles.headerActions}>
            <a href="/creator" onClick={(event) => navigate(event, "/creator", false, router?.push)} className={styles.dashboard} data-creator-setup-dashboard data-onboarding-dashboard data-onboarding-skip-to-dashboard data-onboarding-skip-all>
              {activeSection === "questionnaire" ? "Save & exit" : "Go to dashboard"} <ArrowUpRight size={16} aria-hidden="true" />
            </a>
            <form action="/creator-auth/logout" method="post"><button className={styles.signOut}>Sign out</button></form>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.intro}>
          <div>
            {brand !== "moxy" && <p className={styles.eyebrow}>Creator setup</p>}
            <h1>{activeSection === "content" ? "Let’s set up your AI." : brand === "moxy" ? "Make it yours." : "Make your AI feel like you."}</h1>
            <p className={styles.subtitle}>{activeSection === "content" ? "Add your photos and videos, then tell us about yourself while they upload." : "Your answers help us make your AI feel like you."}</p>
          </div>
          {applicationStatus && <span className={styles.applicationStatus} data-onboarding-application-state={applicationStatus} aria-label={`Onboarding status: ${applicationStatus}`}>{applicationStatus}</span>}
        </div>

        <nav className={styles.tabs} aria-label="Creator setup sections">
          <a href="/creator/onboarding?step=content" className={`${styles.tab} ${activeSection === "content" ? styles.activeTab : ""}`}
            aria-current={activeSection === "content" ? "page" : undefined} data-creator-setup-tab="content"
            onClick={(event) => navigate(event, "/creator/onboarding?step=content", activeSection === "content", router?.push)}>
            {brand !== "moxy" && <Images size={18} aria-hidden="true" />} {brand === "moxy" ? "Content" : "Your content"}
          </a>
          <a href="/creator/onboarding?step=questionnaire" className={`${styles.tab} ${activeSection === "questionnaire" ? styles.activeTab : ""}`}
            aria-current={activeSection === "questionnaire" ? "page" : undefined} data-creator-setup-tab="questionnaire"
            onClick={(event) => navigate(event, "/creator/onboarding?step=questionnaire", activeSection === "questionnaire", router?.push)}>
            {brand !== "moxy" && <FileText size={18} aria-hidden="true" />} Questionnaire
          </a>
        </nav>

        <div className={styles.content} data-onboarding-active-step={activeSection}>{activeSection === "questionnaire" && <CreatorUploadActivity />}{children}</div>
        <footer className={styles.footer}>Your profile, your pace.</footer>
      </main>
    </div>
  );
}



