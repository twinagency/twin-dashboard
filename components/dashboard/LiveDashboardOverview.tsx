"use client";

import { useRouter } from "next/navigation";
import { setCloneScope } from "@/app/actions/clone-scope";
import SharedOverview from "@/components/overview/SharedOverview";
import RevenueDashboard, { type FullData } from "@/components/RevenueDashboard";
import { LiveOverviewHero, LiveOverviewActivity, LiveOverviewRankings, type OverviewClone } from "./LiveOverview";
import styles from "./LiveOverview.module.css";

/** Presentation only: all reporting, refresh and scope logic stays in RevenueDashboard. */
export default function LiveDashboardOverview({ cloneId, clones, initialData, combined = false }: {
  cloneId?: string | null; clones: OverviewClone[]; initialData?: FullData | null; combined?: boolean;
}) {
  const router = useRouter();
  async function selectCreator(id: string | null) {
    await setCloneScope(id);
    // A creator report belongs to the scoped Telegram workspace, whose header
    // reads the same selection. The combined homepage always remains all creators.
    if (combined && id) router.push("/dashboard?workspace=telegram");
  }
  return <RevenueDashboard cloneId={cloneId} initialData={initialData} sharedOverview={{ component: SharedOverview, creators: clones, creatorsHref: "/clones", chatHref: "/users?workspace=telegram", brand: "twin", onSelectCreator: selectCreator }} overviewPresentation={{
    className: styles.page,
    header: windowLabel => <LiveOverviewHero clones={clones} cloneId={cloneId} windowLabel={windowLabel} />,
    activity: (data, money) => <LiveOverviewActivity data={data} cloneId={cloneId} money={money} />,
    rankings: (data, money, loading) => <LiveOverviewRankings data={data} cloneId={cloneId} money={money} loading={loading} />,
  }} />;
}
