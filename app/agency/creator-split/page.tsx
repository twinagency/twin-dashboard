import { getDashboardAccess } from "@/lib/dashboard-access";
import { agencyCanManage } from "@/lib/agency-management-policy";
import { notFound } from "next/navigation";
import { listAgencyCreatorCuts } from "@/lib/platform-cut";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import AgencyCreatorCutRowForm from "./AgencyCreatorCutRowForm";

export const dynamic = "force-dynamic";

interface CreatorCutRow {
  cloneId: string;
  name: string;
  cutPct: number | null;
}

export default async function AgencyCreatorSplitPage() {
  const access = await getDashboardAccess();

  // Only agencies that can manage
  if (!access || !("id" in access) || !agencyCanManage(access)) {
    notFound();
  }

  const agencyId = access.id;

  let cuts: CreatorCutRow[] = [];
  try {
    const result = await listAgencyCreatorCuts(agencyId);
    cuts = result || [];
  } catch (error) {
    console.error("Error loading creator cuts:", error);
    cuts = [];
  }

  return (
    <div className="dashboard-page flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold text-ink">Creator earnings split</h1>
        <p className="mt-2 text-sm text-muted">
          Your cut from each creator. The creator sees earnings after our platform fee and your cut.
        </p>
      </div>

      <div>
        <div className="rounded-lg border border-line bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Creator</TableHead>
                <TableHead>Current cut</TableHead>
                <TableHead>New cut</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cuts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted">
                    No creators found
                  </TableCell>
                </TableRow>
              ) : (
                cuts.map((row) => <AgencyCreatorCutRowForm key={row.cloneId} row={row} />)
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
