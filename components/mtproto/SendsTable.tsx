import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SendRow } from "@/lib/mtproto/types";
import { sendFanLabel } from "@/lib/mtproto/sends";

const STATE_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  sent: "secondary",
  acked: "default",
  replied: "default",
  failed: "destructive",
  uncertain: "outline",
  cancelled: "outline",
  skipped: "outline",
};

// N2.4: every send with ts, fan, exact text, status, error, reply Y/N, reply
// latency, purchase Y/N + Stars. CSV export via a plain link (no client JS
// needed) to the route's own text/csv response.
export default function SendsTable({ runId, rows }: { runId: string; rows: SendRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sends</CardTitle>
        <CardDescription>Exact text sent, Telegram-acknowledged status (accepted, not proof of delivery or reading), reply and purchase attribution.</CardDescription>
        <CardAction>
          <Link href={`/mtproto-campaign/runs/${runId}/csv`}>
            <Button variant="outline" size="sm">
              Export CSV
            </Button>
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Nothing sent yet.</div>
        ) : (
          <div className="max-h-[32rem] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sent</TableHead>
                  <TableHead>Creator</TableHead>
                  <TableHead>Fan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Text</TableHead>
                  <TableHead>Reply</TableHead>
                  <TableHead>Bought</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.episodeId}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {r.sentAt ? new Date(r.sentAt).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell>{r.cloneName}</TableCell>
                    <TableCell className="font-mono text-xs">{sendFanLabel(r)}</TableCell>
                    <TableCell>
                      <Badge variant={STATE_VARIANT[r.state] ?? "outline"}>{r.state}</Badge>
                      {r.errorCode && <div className="mt-0.5 text-[11px] text-destructive">{r.errorCode}</div>}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs" title={r.text ?? undefined}>
                      {r.text ?? "—"}
                    </TableCell>
                    <TableCell>{r.repliedAt ? "Yes" : "No"}</TableCell>
                    <TableCell className={r.boughtStars ? "font-semibold text-good" : "text-muted-foreground"}>
                      {r.boughtStars ? `${r.boughtStars}⭐ (≤${r.boughtWithinHours}h)` : "No"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
