import Link from "next/link";
import { ArrowRight, Link2 } from "lucide-react";
import studio from "../CreatorStudio.module.css";
import styles from "./OnlyFansStudio.module.css";

/** The existing creator homepage owns the heading and card design. */
export function CreatorPlatformHeading({ title, description }: { title: string; description: string }) {
  return <header className={studio.heading} data-creator-platform-heading>
    <div><p className={studio.eyebrow}>YOUR STUDIO · ONLYFANS</p><h1>{title}</h1><p>{description}</p></div>
  </header>;
}

export function CreatorPlatformEmpty({ title, description, actionHref }: { title: string; description: string; actionHref?: string }) {
  return <section className={`${studio.welcome} ${styles.empty}`} data-creator-platform-empty>
    <span className={studio.iconTile}><Link2 size={20} aria-hidden="true" /></span>
    <h2>{title}</h2><p role="status">{description}</p>
    {actionHref ? <Link className={studio.primaryButton} href={actionHref}>Go to accounts <ArrowRight size={16} aria-hidden="true" /></Link> : null}
  </section>;
}
