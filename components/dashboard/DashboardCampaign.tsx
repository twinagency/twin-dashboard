"use client";
import { platformNames } from '../fans/model';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Megaphone } from "lucide-react";
import { buildLibrary, restoreLibrary, LIBRARY_STORAGE } from "../content-library/model";
import { emptyInbox, restoreInbox, INBOX_STORAGE } from "../inbox/model";
import { CAMPAIGN_STORAGE, campaignHref, restoreCampaigns, seedCampaigns } from "../campaigns/model";
import { emptyState } from "../fans/model";
import type { Fan, WorkspaceState } from "../fans/types";
import { portraitUrl } from "./portraits";
import styles from "./CreatorDashboard.module.css";

export default function DashboardCampaign({ fans, creatorId, workspace }: { fans: Fan[]; creatorId: string; workspace: WorkspaceState }) {
  const base = useMemo(() => buildLibrary(fans), [fans]);
  const seed = useMemo(() => seedCampaigns({ fans, ...base, workspace: emptyState(), inbox: emptyInbox() }), [fans, base]);
  const [store, setStore] = useState(seed);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    const read = () => {
      try {
        const items = restoreLibrary(localStorage.getItem(LIBRARY_STORAGE), base.items);
        const inbox = restoreInbox(localStorage.getItem(INBOX_STORAGE), fans);
        setStore(restoreCampaigns(localStorage.getItem(CAMPAIGN_STORAGE), seed, { fans, items, sales: base.sales, workspace, inbox }));
      } catch { setStore(seed); }
    };
    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, [fans, base, seed, workspace]);
  const campaigns = store.campaigns.filter(c => c.creatorId === creatorId);
  const campaign = campaigns.filter(c => c.status === "Scheduled").sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0]
    || campaigns.find(c => c.status === "Active") || campaigns.find(c => c.status === "Draft");
  return <section className={`${styles.panel} ${styles.campaignPanel}`} aria-label="Campaign spotlight">
    <div className={styles.panelHeading}><h2>{campaign?.status === "Scheduled" ? "Next campaign" : "Campaign spotlight"}</h2></div>
    <Link className={styles.campaignCover} href={campaignHref(creatorId, campaign?.id)}>
      {creatorId === "briana" && !imageFailed ? <img src={portraitUrl("portrait")} alt="Relaxed portrait of Brianna Redd" onError={() => setImageFailed(true)} loading="lazy" /> : <span className={styles.coverPlaceholder}><Megaphone size={36} /></span>}
      <span className={styles.campaignCaption}><strong>{campaign?.name || "Your next release"}</strong><small>{campaign ? `${campaign.status} · ${campaign.platforms.map(p => platformNames[p]).join(" + ")}` : "Plan a new campaign"}</small>{campaign?.status === "Scheduled" && <small>{new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" }).format(new Date(campaign.scheduledAt))} AEST</small>}</span>
    </Link>
    <Link className={styles.campaignButton} href={campaignHref(creatorId, campaign?.id)}>{campaign ? "Open campaign" : "Explore campaigns"}<ArrowRight size={16} /></Link>
  </section>;
}
