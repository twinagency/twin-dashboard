"use client";

import { FlirtCreatorLanguageSwitch, useFlirtCreatorLocale } from "@/components/FlirtCreatorLocale";

import { useContext, type MouseEvent, type ReactNode } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { CreatorUploadActivity } from "./CreatorContentUploadProvider";
import { navigateCreatorSetup } from "@/lib/creator-setup-navigation";
import { ArrowUpRight, MoreHorizontal, Images, Heart, UserRound, LockKeyhole } from "lucide-react";
import styles from "./CreatorSetupLayout.module.css";

export const CREATOR_SETUP_NAVIGATE_EVENT = "creator-setup:navigate";
type CreatorSetupLayoutProps = {
  brand: "moxy" | "flirt" | "twin";
  logoSrc: string;
  activeSection: "questionnaire" | "content" | "choice" | "onlyfans";
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
  const { t } = useFlirtCreatorLocale();
  const brandName = brand === "moxy" ? "Moxy AI" : brand === "twin" ? "Twin" : "FLIRT";
  return <div className={styles.root} data-creator-setup-brand={brand} data-creator-onboarding-brand={brand} data-creator-setup-section={activeSection} data-studio-setup={brand !== "twin" ? "true" : undefined}>
    {brand !== "twin" && <aside className={styles.editorial}>
      <a href="/creator" onClick={event => navigate(event, "/creator", false, router?.push)} aria-label={t(`${brandName} creator home`, `Início do estúdio ${brandName}`)}><img src={logoSrc} alt={brandName} /></a>
      <div className={styles.editorialBody}><p className={styles.editorialEyebrow}>{t("YOUR CREATOR ERA", "SUA JORNADA COMO CRIADORA")}</p><h1>{t("More connection.", "Mais conexão.")}<br />{t("More possibility.", "Mais possibilidades.")}<br /><em>{t("More you.", "Mais a sua cara.")}</em></h1><p>{t("Bring your content and personality together in a space that’s entirely yours.", "Reúna seu conteúdo e sua personalidade em um espaço só seu.")}</p><ul><li><UserRound size={18} />{t("An AI with your personality", "Uma IA com a sua personalidade")}</li><li><Images size={18} />{t("Your content, all in one place", "Seu conteúdo em um só lugar")}</li><li><Heart size={18} />{t("A team here to help you grow", "Uma equipe para ajudar você a crescer")}</li></ul></div>
      <p className={styles.editorialFooter}><LockKeyhole size={14} />{t("Your content stays yours.", "Seu conteúdo continua sendo seu.")}</p>
    </aside>}
    <header className={styles.header}>
      <div className={styles.headerInner}>
        {brand === "twin" ? <span className={styles.twinWordmark} aria-label="Twin Technologies"><strong>Twin</strong><span>TECHNOLOGIES</span></span> : <img src={logoSrc} alt={brandName} className={styles.logo} />}
        <span className={styles.headerTitle}>{brand === "twin" ? "Creator setup" : t("Your creator studio", "Seu estúdio")}</span>
        {brand !== "twin" && <a className={styles.saveExit} href="/creator" onClick={event => navigate(event, "/creator", false, router?.push)}>{t("Save & exit", "Salvar e sair")} <ArrowUpRight size={15} /></a>}
        <FlirtCreatorLanguageSwitch />
        <details className={styles.menu} onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.removeAttribute("open"); event.currentTarget.querySelector("summary")?.focus(); } }}>
          <summary aria-label={t("Setup menu", "Menu de configuração")}><MoreHorizontal size={24} /></summary>
          <div className={styles.menuPanel}>
            {applicationStatus && <span className={styles.applicationStatus} data-onboarding-application-state={applicationStatus} aria-label={t(`Onboarding status: ${applicationStatus}`, `Status do cadastro: ${applicationStatus}`)}>{applicationStatus}</span>}
            <nav aria-label={t("Creator setup options", "Opções de configuração")}>
              <a href="/creator/onboarding?step=content&review=1#creator-setup-submit" onClick={event => navigate(event, "/creator/onboarding?step=content&review=1#creator-setup-submit", false, router?.push)}>{t("Review and finish", "Revisar e concluir")}</a>
            </nav>
            <a href="/creator" onClick={event => navigate(event, "/creator", false, router?.push)} data-creator-setup-dashboard data-onboarding-dashboard data-onboarding-skip-to-dashboard data-onboarding-skip-all>{activeSection === "questionnaire" ? t("Save & exit", "Salvar e sair") : t("Go to dashboard", "Ir para o painel")}<ArrowUpRight size={15} /></a>
            <form action="/creator-auth/logout" method="post"><button>{t("Sign out", "Sair")}</button></form>
          </div>
        </details>
      </div>
      {(activeSection === "content" || activeSection === "questionnaire") && <nav className={styles.steps} aria-label={t("Creator setup sections", "Etapas da configuração")}>
        <a href="/creator/onboarding?step=content" data-creator-setup-tab="content" aria-current={activeSection === "content" ? "step" : undefined} onClick={event => navigate(event, "/creator/onboarding?step=content", false, router?.push)}><span className={styles.stepNumber} aria-hidden="true">1</span>{t("Content", "Conteúdo")}</a>
        <a href="/creator/onboarding?step=questionnaire" data-creator-setup-tab="questionnaire" aria-current={activeSection === "questionnaire" ? "step" : undefined} onClick={event => navigate(event, "/creator/onboarding?step=questionnaire", false, router?.push)}><span className={styles.stepNumber} aria-hidden="true">2</span>{t("Questionnaire", "Questionário")}</a>
      </nav>}
    </header>
    <main className={styles.main}>
      <div className={styles.content} data-onboarding-active-step={activeSection}>{activeSection === "questionnaire" && <CreatorUploadActivity />}{children}</div>
    </main>
  </div>;
}

