"use client";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="m-4 rounded-lg border border-line bg-panel p-5 text-ink">
      <h2 className="text-lg font-semibold">This page could not be displayed.</h2>
      <p className="mt-2 text-sm text-muted">Try again, or reload to get the latest dashboard version.</p>
      <div className="mt-4 flex gap-3">
        <button type="button" className="rounded border border-line px-3 py-2" onClick={reset}>Try again</button>
        <button type="button" className="rounded border border-line px-3 py-2" onClick={() => window.location.reload()}>Reload dashboard</button>
      </div>
    </div>
  );
}
