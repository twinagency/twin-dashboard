import { notFound } from "next/navigation";
import { Cable, LockKeyhole } from "lucide-react";
import ConnectionsRegistry from "@/components/crm/ConnectionsRegistry";
import { hybridCrmFoundationEnabled } from "@/lib/crm-foundation-feature";
import { readCrmFoundation } from "@/lib/crm-foundation-read";
import { getDashboardAccess } from "@/lib/dashboard-access";

export const dynamic = "force-dynamic";

export default async function CrmConnectionsPage() {
  if (!hybridCrmFoundationEnabled()) notFound();
  const access = await getDashboardAccess();
  const result = await readCrmFoundation();
  const canManage = !access;

  return (
    <div className="dashboard-page space-y-5">
      <header className="flex flex-col gap-3 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-accent-2"><Cable className="h-3.5 w-3.5" />CRM infrastructure</div>
          <h1 className="text-2xl font-bold text-ink">Connections</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">Provider health, identity bindings and recorded capabilities for every connected creator account.</p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-md border border-line bg-panel px-3 py-2 text-xs font-semibold text-muted sm:self-auto"><LockKeyhole className="h-3.5 w-3.5 text-accent" />{canManage ? "Controlled writes" : "Read only"}</div>
      </header>
      <ConnectionsRegistry result={result} canManage={canManage} />
    </div>
  );
}
