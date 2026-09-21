"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setConnectionDailyCapAction, setConnectionPausedAction } from "@/app/mtproto-campaign/actions";
import type { AutoHaltInfo, CreatorLite, UserbotConnection } from "@/lib/mtproto/types";

type ConnRow = { creator: CreatorLite; connection: UserbotConnection; autoHalt: AutoHaltInfo | null; resumePhrase: string };

const STATUS_VARIANT: Record<UserbotConnection["status"], "default" | "secondary" | "outline" | "destructive"> = {
  connected: "default",
  connecting: "secondary",
  disconnected: "outline",
  revoked: "destructive",
  error: "destructive",
};

function Row({ row }: { row: ConnRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { creator, connection, autoHalt } = row;
  const [error, setError] = useState<string | null>(null);

  const togglePause = () => {
    const fd = new FormData();
    fd.set("cloneId", creator.id);
    fd.set("paused", String(!connection.paused));
    if (connection.paused && autoHalt) {
      // Server re-checks this phrase; the prompt is only where it is collected.
      const typed = window.prompt(
        `${creator.name} was AUTO-HALTED: ${autoHalt.label}${autoHalt.tripped ? ` (${autoHalt.tripped})` : ""}.\n\nType "${row.resumePhrase}" to resume.`,
      );
      if (!typed) return;
      fd.set("confirmText", typed);
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await setConnectionPausedAction(fd);
        if (!result.ok) setError(result.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed");
      }
      router.refresh();
    });
  };

  const editCap = () => {
    const next = window.prompt(`Daily cap for ${creator.name}`, String(connection.dailyCap));
    if (!next) return;
    const dailyCap = Number(next);
    if (!Number.isInteger(dailyCap) || dailyCap <= 0 || dailyCap > 100) {
      setError("Daily cap must be a whole number between 1 and 100");
      return;
    }
    const fd = new FormData();
    fd.set("cloneId", creator.id);
    fd.set("dailyCap", String(dailyCap));
    setError(null);
    startTransition(async () => {
      try {
        const result = await setConnectionDailyCapAction(fd);
        if (!result.ok) setError(result.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed");
      }
      router.refresh();
    });
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{creator.name}</TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[connection.status]}>{connection.status}</Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {connection.lastSeenAt ? new Date(connection.lastSeenAt).toLocaleString() : "never"}
      </TableCell>
      <TableCell className="tabular-nums">{connection.dailyCap}</TableCell>
      <TableCell>
        {connection.paused && autoHalt ? (
          <div className="max-w-[320px] space-y-0.5">
            <span className="rounded bg-destructive px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">AUTO-HALTED</span>
            <div className="text-sm font-semibold text-destructive">{autoHalt.label}</div>
            <div className="text-xs text-muted-foreground">{autoHalt.explanation}</div>
            {autoHalt.tripped ? <div className="text-xs font-medium">{autoHalt.tripped}</div> : <div className="text-xs text-warn">Halt numbers unavailable (no matching halt event found).</div>}
            {autoHalt.threshold && <div className="text-xs text-muted-foreground">{autoHalt.threshold}</div>}
            {autoHalt.haltedAt && <div className="text-xs text-muted-foreground">{new Date(autoHalt.haltedAt).toLocaleString()}</div>}
          </div>
        ) : connection.paused ? (
          <div>
            <Badge variant="destructive">paused (manual)</Badge>
            {connection.pausedReason && <div className="mt-0.5 text-xs text-muted-foreground">{connection.pausedReason}</div>}
          </div>
        ) : (
          <Badge variant="outline">active</Badge>
        )}
      </TableCell>
      <TableCell className="flex flex-wrap items-center gap-2">
        {error && <span className="text-xs text-destructive">{error}</span>}
        <Button size="sm" variant="outline" onClick={editCap} disabled={pending}>
          Edit cap
        </Button>
        <Button size="sm" variant={connection.paused ? "default" : "destructive"} onClick={togglePause} disabled={pending}>
          {connection.paused ? (autoHalt ? "Resume (type phrase)" : "Resume") : "Pause"}
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default function ConnectionsTable({ rows }: { rows: ConnRow[] }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Creator</TableHead>
              <TableHead>Session</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead>Daily cap</TableHead>
              <TableHead>Sending</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <Row key={r.creator.id} row={r} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
