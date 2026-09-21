import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SafetySnapshot } from "@/lib/mtproto/types";

// N2.7: sends today vs daily cap, FloodWait/PeerFlood count, last error,
// account health, days clean. Health is a simple traffic light: red if any
// FloodWait/PeerFlood today, amber if a restriction landed within 7 days,
// green otherwise — matches the plan's "green/amber/red" language exactly.
function health(s: SafetySnapshot): { label: string; cls: string } {
  if (s.paused && s.autoHalt) return { label: "red", cls: "bg-destructive/15 text-destructive" };
  if (s.floodWaitCount > 0) return { label: "red", cls: "bg-destructive/15 text-destructive" };
  if (s.daysCleanSinceRestriction != null && s.daysCleanSinceRestriction < 7) return { label: "amber", cls: "bg-warn/15 text-warn" };
  return { label: "green", cls: "bg-good/15 text-good" };
}

export default function SafetyPanel({ snapshots }: { snapshots: SafetySnapshot[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Safety</CardTitle>
        <CardDescription>Cap used today, FloodWait/PeerFlood count, connection and account health per creator.</CardDescription>
      </CardHeader>
      <CardContent>
        {snapshots.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No creators yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Creator</TableHead>
                <TableHead>Sent today</TableHead>
                <TableHead>FloodWait/PeerFlood today</TableHead>
                <TableHead>Days clean</TableHead>
                <TableHead>Connection</TableHead>
                <TableHead>Last error</TableHead>
                <TableHead>Health</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshots.map((s) => {
                const h = health(s);
                return (
                  <TableRow key={s.cloneId}>
                    <TableCell className="font-medium">{s.cloneName}</TableCell>
                    <TableCell className="tabular-nums">
                      {s.sentToday} / {s.dailyCap}
                    </TableCell>
                    <TableCell className={s.floodWaitCount > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}>
                      {s.floodWaitCount}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.daysCleanSinceRestriction ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={s.connectionStatus === "connected" ? "default" : "outline"}>{s.connectionStatus}</Badge>
                      {s.paused && s.autoHalt ? (
                        <div className="mt-1 max-w-[260px] space-y-0.5">
                          <span className="rounded bg-destructive px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">AUTO-HALTED</span>
                          <div className="text-xs font-semibold text-destructive">{s.autoHalt.label}</div>
                          {s.autoHalt.tripped && <div className="text-xs">{s.autoHalt.tripped}</div>}
                          {s.autoHalt.threshold && <div className="text-xs text-muted-foreground">{s.autoHalt.threshold}</div>}
                          {!s.autoHalt.eventFound && <div className="text-xs text-warn">halt numbers unavailable</div>}
                        </div>
                      ) : s.paused ? (
                        <div className="mt-1 text-xs text-muted-foreground">paused (manual){s.pausedReason ? `: ${s.pausedReason}` : ""}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground" title={s.lastError ?? undefined}>
                      {s.lastError ?? "—"}
                    </TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${h.cls}`}>{h.label}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
