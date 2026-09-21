import { Badge } from "@/components/ui/badge";
import type { RunStatus } from "@/lib/mtproto/types";

const VARIANT: Record<RunStatus, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  queued: "secondary",
  running: "default",
  paused: "secondary",
  stopped: "destructive",
  done: "outline",
  failed: "destructive",
};

export default function RunStatusBadge({ status }: { status: RunStatus }) {
  return <Badge variant={VARIANT[status]}>{status}</Badge>;
}
