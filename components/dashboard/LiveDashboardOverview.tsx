"use client";

import RevenueDashboard, { type FullData } from "@/components/RevenueDashboard";
import { LiveOverviewHero, LiveOverviewActivity, LiveOverviewRankings, type OverviewClone } from "./LiveOverview";
import styles from "./LiveOverview.module.css";

/** Presentation only: all reporting, refresh and scope logic stays in RevenueDashboard. */
export default function LiveDashboardOverview({ cloneId, clones, initialData }: {
  cloneId?: string | null; clones: OverviewClone[]; initialData?: FullData | null;
}) {
  return <RevenueDashboard cloneId={cloneId} initialData={initialData} sharedOverview={{ creators: clones, creatorsHref: "/clones", chatHref: "/users?workspace=telegram", brand: "twin" }} overviewPresentation={{
    className: styles.page,
    header: windowLabel => <LiveOverviewHero clones={clones} cloneId={cloneId} windowLabel={windowLabel} />,
    activity: (data, money) => <LiveOverviewActivity data={data} cloneId={cloneId} money={money} />,
    rankings: (data, money, loading) => <LiveOverviewRankings data={data} cloneId={cloneId} money={money} loading={loading} />,
  }} />;
}
