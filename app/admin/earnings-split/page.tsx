import { getDashboardAccess } from "@/lib/dashboard-access";
import { notFound } from "next/navigation";
import { listCuts } from "@/lib/platform-cut";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import CutRowForm from "./CutRowForm";

export const dynamic = "force-dynamic";

interface CutRow {
  kind: "agency" | "clone";
  id: string;
  name: string;
  cutPct: number | null;
  usdPerStar: number | null;
}

export default async function EarningsSplitPage() {
  const access = await getDashboardAccess();

  // Only admins can access this page
  if (access !== null) {
    notFound();
  }

  let cuts: CutRow[] = [];
  try {
    const result = await listCuts();
    cuts = result || [];
  } catch (error) {
    console.error("Error loading cuts:", error);
    cuts = [];
  }

  const agencies = cuts.filter((c) => c.kind === "agency");
  const clones = cuts.filter((c) => c.kind === "clone");

  return (
    <div className="dashboard-page flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold text-ink">Earnings split</h1>
        <p className="mt-2 text-sm text-muted">
          One cut % and one $ per star per login. Each login uses only its own row: an agency login sees every creator it is assigned at gross minus ITS cut, a creator login sees its own earnings minus ITS cut. Rows never combine. $ per star blank = default 0.013 (allowed 0.001 to 0.090). Admins always see gross. Takes effect immediately.
        </p>
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold text-ink">Agency logins</h2>
        <div className="rounded-lg border border-line bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Current cut</TableHead>
                <TableHead>New cut</TableHead>
                <TableHead>$ per star</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agencies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted">
                    No agencies found
                  </TableCell>
                </TableRow>
              ) : (
                agencies.map((row) => <CutRowForm key={`${row.kind}-${row.id}`} row={row} />)
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold text-ink">Creator logins</h2>
        <div className="rounded-lg border border-line bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Current cut</TableHead>
                <TableHead>New cut</TableHead>
                <TableHead>$ per star</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clones.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted">
                    No creators found
                  </TableCell>
                </TableRow>
              ) : (
                clones.map((row) => <CutRowForm key={`${row.kind}-${row.id}`} row={row} />)
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
