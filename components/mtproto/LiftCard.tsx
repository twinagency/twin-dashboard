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
          Buyer rate and Stars per fan compare contacted fans (real, acked sends) with the hold-out over the SAME window length, each
          measured from that fan&apos;s own send time (hold-out: when they would have been contacted), same rule for both groups, paid
          orders only, and only fans whose window has finished. &quot;Replied + bought&quot; is the stricter attribution rule for contacted fans.
          Stars are OBSERVED, not net profit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {reports.some((r) => r.partial) && (
          <div className="mb-2 rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-xs text-warn">
            The purchase read was cut short: every figure here is a lower bound.
          </div>
        )}
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
              <TableHead>Replied + bought</TableHead>
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
                  <TableCell className="tabular-nums">
                    {r.contacted.attributedBuyers} fans / {r.contacted.attributedStars}⭐
                  </TableCell>
                </TableRow>
                <TableRow key={`${r.windowHours}-h`}>
                  <TableCell className="text-muted-foreground">Hold-out</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{r.holdout.fans}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">—</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{pct(r.holdout.buyerRate)}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{r.holdout.starsPerFan.toFixed(1)}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{r.holdout.stars}</TableCell>
                  <TableCell className="text-muted-foreground">—</TableCell>
                </TableRow>
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
