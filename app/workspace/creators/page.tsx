import { notFound } from "next/navigation";
import { Database, LockKeyhole } from "lucide-react";
import CreatorRegistry from "@/components/workspace/CreatorRegistry";
import { hybridCrmFoundationEnabled } from "@/lib/crm-foundation-feature";
import { readCrmFoundation } from "@/lib/crm-foundation-read";

export const dynamic = "force-dynamic";

export default async function WorkspaceCreatorsPage() {
  if (!hybridCrmFoundationEnabled()) notFound();
  const result = await readCrmFoundation();

  return (
    <div className="dashboard-page space-y-5">
      <header className="flex flex-col gap-3 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-accent-2">
            <Database className="h-3.5 w-3.5" />Workspace
          </div>
          <h1 className="text-2xl font-bold text-ink">Creator registry</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">One canonical creator record across Twin identities, agencies and connected channels.</p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-md border border-line bg-panel px-3 py-2 text-xs font-semibold text-muted sm:self-auto">
          <LockKeyhole className="h-3.5 w-3.5 text-accent" />Read only
        </div>
      </header>
      <CreatorRegistry result={result} />
    </div>
  );
}
