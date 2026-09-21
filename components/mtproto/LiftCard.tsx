import { Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LiftReport } from "@/lib/mtproto/types";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

// N2.2 / N3: contacted vs hold-out, same window, side by side at 24h/72h/7d.
// This is the "did it actually work" number. Money here is OBSERVED/
// INCREMENTAL, never claimed as net profit — see the header note.
export default function LiftCard({ reports }: { reports: LiftReport[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lift vs hold-out</CardTitle>
        <CardDescription>
          A purchase counts here only if the fan replied to our send AND bought within the window shown. Stars are OBSERVED for the
          contacted group in that window, not net profit — splits and costs still apply.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Window</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Fans</TableHead>
              <TableHead>Reply rate</TableHead>
              <TableHead>Buyer rate</TableHead>
              <TableHead>⭐ / fan</TableHead>
              <TableHead>⭐ total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((r) => (
              <Fragment key={r.windowHours}>
                <TableRow key={`${r.windowHours}-c`}>
                  <TableCell rowSpan={2} className="align-top font-medium">
                    {r.windowHours}h
                  </TableCell>
                  <TableCell>Contacted</TableCell>
                  <TableCell className="tabular-nums">{r.contacted.fans}</TableCell>
                  <TableCell className="tabular-nums">{pct(r.contacted.replyRate)}</TableCell>
                  <TableCell className="tabular-nums">{pct(r.contacted.buyerRate)}</TableCell>
                  <TableCell className="tabular-nums text-good">{r.contacted.starsPerFan.toFixed(1)}</TableCell>
                  <TableCell className="tabular-nums text-good">{r.contacted.stars}</TableCell>
                </TableRow>
                <TableRow key={`${r.windowHours}-h`}>
                  <TableCell className="text-muted-foreground">Hold-out</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{r.holdout.fans}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">—</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{pct(r.holdout.buyerRate)}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{r.holdout.starsPerFan.toFixed(1)}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{r.holdout.stars}</TableCell>
                </TableRow>
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
