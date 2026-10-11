"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, CalendarDays, Camera, ChevronRight, Coins, FileText, Gift, Heart, LayoutGrid, Link2, LockKeyhole, MessageCircle, Network, Send, Settings2, SlidersHorizontal, UserRound } from "lucide-react";
import type { Clone } from "@/lib/types";
import type { CloneConfigState } from "./useCloneConfig";
import styles from "./CreatorStudio.module.css";

export const STUDIO_PAGES = {
  identity: { title: "Identity", subtitle: "The person behind every conversation.", panels: [["overview", "Overview"], ["profile", "Profile"], ["personality", "Personality"], ["life", "Life & routine"], ["socials", "Socials"], ["boundaries", "Boundaries"], ["words", "Her own words"]] },
  config: { title: "Configuration", subtitle: "How this creator responds, connects and delivers.", panels: [["overview", "Overview"], ["connection", "Connection"], ["capabilities", "Capabilities"], ["behaviour", "Behaviour"], ["delivery", "Delivery"], ["models", "Models"]] },
  money: { title: "Monetization", subtitle: "Shape the path from conversation to purchase.", panels: [["overview", "Overview"], ["messages", "Messages & paywall"], ["tips", "Tips"], ["after", "After purchase"]] },
} as const;
export type StudioTab = keyof typeof STUDIO_PAGES;
export function isStudioTab(tab: string): tab is StudioTab { return Object.hasOwn(STUDIO_PAGES, tab); }
export function resolveStudioPanel(tab: string, panel: string | null): string {
  return isStudioTab(tab) && STUDIO_PAGES[tab].panels.some(([key]) => key === panel) ? panel! : "overview";
}
const icons: Record<string, typeof LayoutGrid> = { overview: LayoutGrid, profile: UserRound, personality: MessageCircle, life: CalendarDays, socials: Link2, boundaries: LockKeyhole, words: FileText, connection: Network, capabilities: Camera, behaviour: SlidersHorizontal, delivery: Send, models: Settings2, messages: MessageCircle, tips: Coins, after: Gift };
export function StudioNavigation({ tab, panel, onChange }: { tab: StudioTab; panel: string; onChange: (panel: string) => void }) {
  return <nav className={styles.navigation} aria-label={`${STUDIO_PAGES[tab].title} sections`}>{STUDIO_PAGES[tab].panels.map(([key, label]) => { const Icon = icons[key]; return <button type="button" key={key} onClick={() => onChange(key)} aria-current={panel === key ? "page" : undefined}><Icon size={19} /><span>{label}</span></button>; })}</nav>;
}
export function StudioHeading({ icon = "overview", title, description }: { icon?: string; title: string; description?: string }) {
  const Icon = icons[icon] ?? Settings2;
  return <header className={styles.cardHeading}><span><Icon size={23} /></span><div><h3>{title}</h3>{description && <p>{description}</p>}</div></header>;
}
export function StudioLink({ panel, onChange, children }: { panel: string; onChange?: (panel: string) => void; children: ReactNode }) {
  return <button type="button" data-readonly-navigation className={styles.textLink} onClick={() => onChange?.(panel)}>{children}<ArrowRight size={14} /></button>;
}
export function IdentityLifeCard({ onChange }: { onChange?: (panel: string) => void }) {
  return <section className={styles.summaryCard} data-studio-identity="life-summary"><StudioHeading icon="life" title="Life & routine" description="Her day-to-day life, interests and content approach." /><div className={styles.linkRows}>{[["Daily rhythm", "When she’s online and how she spends her time.", CalendarDays], ["Life & pets", "Her life outside of content, hobbies and interests.", Heart], ["Content canon", "The content she creates and how she describes it.", Camera]].map(([title, copy, Icon]) => { const RowIcon = Icon as typeof Heart; return <button type="button" data-readonly-navigation key={String(title)} onClick={() => onChange?.("life")}><RowIcon size={20} /><span><b>{String(title)}</b><small>{String(copy)}</small></span><ChevronRight size={16} /></button>; })}</div></section>;
}
export function IdentityBoundaryLink({ onChange }: { onChange?: (panel: string) => void }) {
  return <div className={styles.boundaryStrip} data-studio-identity="boundary-summary"><LockKeyhole size={20} /><b>Boundaries & privacy</b><span>Name sharing, personal details and hard limits.</span><StudioLink panel="boundaries" onChange={onChange}>Review boundaries</StudioLink></div>;
}
export function ConfigurationMore({ onChange }: { onChange?: (panel: string) => void }) {
  return <div className={styles.configLinks}><button type="button" data-readonly-navigation onClick={() => onChange?.("delivery")}><Send size={21} /><span><b>Delivery & timing</b><small>Read receipts, pacing and response timing.</small></span><ChevronRight size={17} /></button><button type="button" data-readonly-navigation onClick={() => onChange?.("models")}><Settings2 size={21} /><span><b>Models & routing</b><small>Model assignments and configuration.</small></span><ChevronRight size={17} /></button></div>;
}

// This is a view of the mounted form, not a second set of submitted controls.
// Listening to ordinary input events also keeps uncontrolled price edits visible
// in the preview without changing the established save payload.
function useMoneyPreview(clone?: Partial<Clone>) {
  const initial = () => ({ starting: String(clone?.starting_credits ?? 50), size: String(clone?.credit_pack_size ?? 50), price: String(clone?.credit_pack_price_stars ?? 199), prime: String(clone?.paywall_prime_before ?? 3) });
  const [preview, setPreview] = useState(initial);
  useEffect(() => {
    const form = document.getElementById("creator-control-plane-form") as HTMLFormElement | null;
    if (!form) return;
    const refresh = () => {
      const value = (name: string, fallback: string) => (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? fallback;
      const defaults = initial();
      setPreview({ starting: value("starting_credits", defaults.starting), size: value("credit_pack_size", defaults.size), price: value("credit_pack_price_stars", defaults.price), prime: value("paywall_prime_before", defaults.prime) });
    };
    refresh(); form.addEventListener("input", refresh); form.addEventListener("change", refresh);
    return () => { form.removeEventListener("input", refresh); form.removeEventListener("change", refresh); };
  }, [clone?.id]);
  return preview;
}
export function MoneyJourney({ clone, cfg }: { clone?: Partial<Clone>; cfg: CloneConfigState }) {
  const preview = useMoneyPreview(clone);
  const steps = [
    [MessageCircle, "Free conversation", cfg.charge ? `${preview.starting} starting credits` : "Messages are free"],
    [FileText, "Warm-up", cfg.paywallPrimeEnabled ? `${preview.prime} messages before` : "Warm-up off"],
    [Coins, "Message pack", cfg.charge ? `${preview.size} messages · ${preview.price} Stars` : "Charging off"],
    [LockKeyhole, "Continue chatting", "After payment"],
  ] as const;
  return <div className={styles.journey} aria-label="Paywall journey preview">{steps.map(([Icon, title, detail], index) => <div className={styles.journeyStep} key={title}><span><Icon size={23} /></span><div><b>{title}</b><small>{detail}</small></div>{index < 3 && <ArrowRight className={styles.journeyArrow} size={21} />}</div>)}</div>;
}
export function PaywallPreview({ clone, cfg, onChange }: { clone?: Partial<Clone>; cfg: CloneConfigState; onChange?: (panel: string) => void }) {
  const preview = useMoneyPreview(clone);
  const name = clone?.stage_name || clone?.name || "Creator";
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "C";
  return <section className={styles.previewCard} data-studio-money="preview"><StudioHeading icon="messages" title="Fan preview" description="Preview of the default out-of-messages screen." /><div className={styles.chat}><header><span className={styles.avatar}>{initials}</span><div><b className="creator-name">{name}</b><small>Message preview</small></div></header><div className={styles.chatBody}><span className={styles.previewLabel}>{cfg.charge ? "Out-of-messages preview" : "Charging is off"}</span><div className={styles.chatBubble}>{cfg.paywallDefault}</div><div className={styles.packPreview}><span><Coins size={15} />{preview.size} messages · {preview.price} Stars</span><span className={styles.previewButton}>{cfg.paywallButton || "Continue"}</span></div></div><StudioLink panel="messages" onChange={onChange}>Edit message</StudioLink></div></section>;
}

