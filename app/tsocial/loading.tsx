import TSocialTabs from "./TSocialTabs";

export default function TSocialLoading() {
  return (
    <main className="dashboard-page flex flex-col gap-6" aria-busy="true">
      <TSocialTabs active="overview" />
      <div role="status" className="rounded-2xl border border-line bg-panel p-6 text-sm text-muted">
        Loading T-Social activity...
      </div>
    </main>
  );
}
