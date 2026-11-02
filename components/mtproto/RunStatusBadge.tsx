import type { RunStatus } from "@/lib/mtproto/types";
import { StatusPill } from "./kit";
import { RUN_STATUS_INFO } from "./view";

export default function RunStatusBadge({ status }: { status: RunStatus }) {
  const info = RUN_STATUS_INFO[status];
  return (
    <StatusPill tone={info.tone} dot title={info.hint}>
      {info.label}
    </StatusPill>
  );
}

/** Dry run = nothing is sent. LIVE = real messages. Never ambiguous. */
export function RunModeBadge({ dryRun }: { dryRun: boolean }) {
  return dryRun ? (
    <StatusPill tone="info" title="A rehearsal. Nothing is sent to any fan.">
      Dry run
    </StatusPill>
  ) : (
    <StatusPill solid title="Real messages go out to real fans.">
      LIVE
    </StatusPill>
  );
}
