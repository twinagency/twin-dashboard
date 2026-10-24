"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, BarChart3, Check, CheckCircle2, ChevronRight, CircleHelp, Clock3, Images, Link2, ShieldCheck, UserRound } from "lucide-react";
import type { CreatorStudioStatus } from "@/lib/creator-studio-model";
import type { CreatorPreparation } from "@/lib/creator-preparation-model";
import styles from "./MoxyCreatorOverview.module.css";

/** Application submission is authoritative. Optional intake counts never reopen a submitted setup. */
export default function MoxyCreatorOverview({ name, photoUrl, cloneId, status, contentHref, preparation, readOnly, children }: {
  name: string; photoUrl?: string; cloneId: string | null; status: CreatorStudioStatus; contentHref: string;
  preparation?: CreatorPreparation; readOnly: boolean; children?: ReactNode;
}) {
  const draft = !cloneId && status.phase === "draft";
  const needsAttention = status.phase === "changes" || status.phase === "withdrawn";
  const profileHref = cloneId ? "/creator/edit" : "/creator/onboarding?step=questionnaire";
  const photos = preparation?.content.photos, videos = preparation?.content.videos;
  const folders = preparation?.content.folders, pending = preparation?.content.pending;
  const answered = preparation?.profile.answered;
  const hasContent = (photos ?? 0) + (videos ?? 0) + (folders ?? 0) > 0;
  const contentKnown = photos != null && videos != null && folders != null;
  const contentText = !contentKnown ? "Your saved content details are unavailable." : hasContent
    ? [photos ? `${photos} ${photos === 1 ? "photo" : "photos"}` : "", videos ? `${videos} ${videos === 1 ? "video" : "videos"}` : "", folders ? `${folders} ${folders === 1 ? "folder link" : "folder links"}` : ""].filter(Boolean).join(" · ")
    : "No content added yet.";
  const submitted = ["submitted", "reviewing", "approved"].includes(status.phase);
  const confirmation = status.phase === "approved"
    ? { title: "Your profile is approved", detail: "Your Moxy team is preparing your account.", note: "There’s nothing else you need to do right now." }
    : status.phase === "reviewing"
    ? { title: "Your profile has been submitted", detail: "Your Moxy team is reviewing your details.", note: "There’s nothing else you need to do right now." }
    : { title: "Your profile has been submitted", detail: "Your details have been sent to your Moxy team for review.", note: "There’s nothing else you need to do right now." };
  const steps = [
    { title: "Profile", icon: UserRound, href: profileHref, copy: answered == null ? "Your saved profile details are unavailable." : answered > 0 ? `${answered} answers saved. You can update them anytime.` : "Add your personality and preferences.", saved: answered != null && answered > 0, known: answered != null },
    { title: "Content", icon: Images, href: contentHref, copy: hasContent ? contentText : "Upload photos, videos or a folder link.", saved: hasContent, known: contentKnown },
    { title: "Permissions", icon: ShieldCheck, href: "/creator/onboarding?review=1", copy: preparation?.consentSaved ? "Your consent is recorded." : "Review and confirm your consent.", saved: preparation?.consentSaved === true, known: preparation?.consentSaved != null },
  ];
  return <div className={styles.overview} data-creator-studio-home data-setup-phase={status.phase}>
    <header className={styles.heading}>
      <div><h1>{draft ? `Welcome, ${name.trim().split(/\s+/)[0] || "creator"}` : "Your overview"}</h1><p>{draft ? "Complete your creator setup." : "Your creator account, in one place."}</p></div>
      <span className={styles.status} data-phase={status.phase}><Clock3 size={15} aria-hidden="true" />{draft ? "Setup incomplete" : status.label}</span>
    </header>

    {!draft && <section className={styles.creatorHero} aria-label="Your creator profile">
      <div><p>YOUR CREATOR STUDIO</p><h2>{name}</h2><Link href={profileHref}>View profile<ArrowRight size={18} /></Link></div>
      {photoUrl ? <img src={photoUrl} alt={name} /> : <span className={styles.heroMonogram} aria-hidden="true">{name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("")}</span>}
    </section>}
    {draft ? <section className={styles.setup} aria-label="Creator setup" data-moxy-creator-setup>
      <div className={styles.setupHeading}><h2>Your setup</h2><p>Your saved progress, all in one place.</p></div>
      <div className={styles.steps}>{steps.map(({ title, icon: Icon, href, copy, saved, known }) => <Link key={title} href={href} className={styles.step} data-saved={saved}>
        <Icon size={22} aria-hidden="true" /><div><h3>{title}</h3><p>{copy}</p></div><span className={styles.stepStatus}>{saved ? "Saved" : known ? "Not started" : "Unavailable"}</span><ChevronRight size={18} aria-hidden="true" />
      </Link>)}</div>
      <div className={styles.setupFooter}><p>Return anytime to continue where you left off.</p><Link href="/creator/onboarding" className={styles.primaryButton} data-return-to-onboarding="true" data-finish-onboarding="true">Continue setup<ArrowRight size={17} /></Link></div>
    </section> : submitted && !cloneId ? <section className={styles.confirmation} aria-label="Application status" data-creator-clone-building="true" data-moxy-submission-confirmed>
      <div className={styles.confirmationHeading}><CheckCircle2 className={styles.confirmationIcon} size={48} strokeWidth={1.5} aria-hidden="true" /><div><h2>{confirmation.title}</h2><p>{confirmation.detail}</p><p>{confirmation.note}</p></div></div>
      <div className={styles.receipts}>
        <span data-recorded="true"><Check size={17} />Profile submitted</span>
        <span data-recorded={contentKnown && hasContent}><Images size={17} />{contentKnown ? hasContent ? "Content received" : "No content added" : "Content status unavailable"}</span>
        <span data-recorded={preparation?.consentSaved === true}><ShieldCheck size={17} />{preparation?.consentSaved === true ? "Permissions recorded" : preparation?.consentSaved === false ? "No permission recorded" : "Permission status unavailable"}</span>
      </div>
      {!!pending && <p className={styles.pending}>{pending} {pending === 1 ? "upload is" : "uploads are"} still being checked. Your application remains submitted.</p>}
    </section> : needsAttention ? <section className={styles.notice} aria-label="Application status">
      <h2>{status.label}</h2><p>{status.phase === "changes" ? "Your Moxy team has requested an update to your application. Check your account details for the next steps." : "Your application has been withdrawn. Contact your Moxy team if you would like to continue."}</p>
      <Link href="/creator/info">View account details<ArrowRight size={16} /></Link>
    </section> : cloneId ? <section className={styles.connection} aria-label="Creator connection status"><Link2 size={22} aria-hidden="true" /><div><h2>{status.phase === "paused" ? "Your AI is paused" : status.phase === "ready" ? "Your AI profile is ready" : "Your AI profile is connected"}</h2><p>{status.phase === "paused" ? "Your past performance is available below." : "Manage your connected profile and view your performance below."}</p></div><Link href="/creator/platforms">View platforms<ArrowRight size={16} /></Link></section> : null}

    {cloneId && children}

    {!draft && <div className={styles.accountCards}>
      <Link href={profileHref} className={styles.accountCard} data-creator-onboarding-access="true"><span className={styles.icon}><UserRound size={22} /></span><div><h2>Your profile</h2><p>{readOnly ? "View the details of your creator profile." : "Your saved personality and preferences."}</p></div><span className={styles.cardAction}>{readOnly ? "View my profile" : "View profile"}<ArrowRight size={17} /></span></Link>
      <Link href={contentHref} className={styles.accountCard} data-creator-content-access="true"><span className={styles.icon}><Images size={22} /></span><div><h2>Your content</h2><p>{cloneId ? "Your connected content library." : contentText}</p></div><span className={styles.cardAction}>{readOnly ? "View content" : "Manage content"}<ArrowRight size={17} /></span></Link>
    </div>}

    {!cloneId && !draft && <section className={styles.performancePending} aria-label="Performance overview"><span className={styles.icon}><BarChart3 size={23} /></span><div><h2>Performance overview</h2><p>Your earnings and activity will appear here once your account is connected.</p></div></section>}
    <div className={styles.support}><CircleHelp size={17} aria-hidden="true" /><span>Questions? <Link href="/creator/help">Contact your Moxy team</Link></span></div>
    <nav className={styles.quickLinks} aria-label="Account shortcuts"><Link href="/creator/platforms">Platforms</Link><Link href="/creator/earnings">Earnings</Link><Link href="/creator/payouts">Payouts</Link><Link href="/creator/info">Account details</Link></nav>
  </div>;
}
