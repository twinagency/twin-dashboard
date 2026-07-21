import { supabaseAdmin } from "@/lib/supabase";
import { isMissingTableError, type FeedbackStatus } from "./shared";
import { StatusControl, ScreenshotLink } from "./TriageControls";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  type: "bug" | "suggestion";
  title: string;
  body: string | null;
  status: FeedbackStatus;
  severity: string | null;
  clone_id: string | null;
  screenshot_url: string | null;
  source: "operator" | "ai";
  created_at: string;
  updated_at: string;
  clones: { name: string } | null;
};

const STATUS_BADGE: Record<FeedbackStatus, string> = {
  new: "bg-accent/15 text-accent",
  reviewing: "bg-warn/15 text-warn",
  building: "bg-info/15 text-info",
  done: "bg-good/15 text-good",
};

const SEVERITY_BADGE: Record<string, string> = {
  low: "bg-muted/10 text-muted",
  medium: "bg-warn/15 text-warn",
  high: "bg-warn/25 text-warn",
  critical: "bg-crit/20 text-crit",
};

export default async function FeedbackPage() {
  let rows: Row[] | null = null;
  let missingTable = false;

  const { data, error } = await supabaseAdmin
    .from("feedback_items")
    .select("*, clones(name)")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    if (isMissingTableError(error)) missingTable = true;
    // Any other error → treat as empty list (page still renders).
  } else {
    rows = (data ?? []) as unknown as Row[];
  }

  const bugs = (rows ?? []).filter((r) => r.type === "bug");
  const suggestions = (rows ?? []).filter((r) => r.type === "suggestion");
  const openCount = (rows ?? []).filter((r) => r.status !== "done").length;

  return (
    <div className="text-ink">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Feedback</h1>
          <p className="mt-0.5 text-sm text-muted">
            Bug reports and feature suggestions{rows ? ` (${openCount} open)` : ""}.
          </p>
        </div>
        <Button nativeButton={false} render={<a href="/feedback/new" />}>+ New</Button>
      </div>

      {missingTable && (
        <div className="mb-4 rounded-lg border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
          The <code className="font-mono">feedback_items</code> table doesn&apos;t exist yet. Apply{" "}
          <code className="font-mono">db/migrations/026_feedback_items.sql</code> to enable this page.
        </div>
      )}

      <div className="grid gap-6">
        <Queue title="🐞 Bugs" rows={bugs} disabled={missingTable} />
        <Queue title="💡 Suggestions" rows={suggestions} disabled={missingTable} />
      </div>
    </div>
  );
}

function Queue({ title, rows, disabled }: { title: string; rows: Row[]; disabled: boolean }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">{title}</h2>
        <span className="text-xs text-muted">{rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted">
          {disabled ? "—" : "Nothing here yet."}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Clone</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className="align-top">
                <TableCell className="whitespace-normal">
                  <div className="font-medium">{r.title}</div>
                  {r.body && (
                    <div className="mt-0.5 max-w-md text-xs text-muted line-clamp-2">{r.body}</div>
                  )}
                  {r.screenshot_url && (
                    <div className="mt-1">
                      <ScreenshotLink pathOrUrl={r.screenshot_url} />
                    </div>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted">
                  {r.clones?.name ?? "—"}
                </TableCell>
                <TableCell>
                  {r.severity ? (
                    <Badge className={SEVERITY_BADGE[r.severity] ?? SEVERITY_BADGE.low}>{r.severity}</Badge>
                  ) : (
                    <span className="text-muted/60">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {r.source === "ai" ? (
                    <Badge className="bg-info/15 text-info">🤖 AI</Badge>
                  ) : (
                    <span className="text-xs text-muted">operator</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted">
                  {new Date(r.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge className={STATUS_BADGE[r.status]}>{r.status}</Badge>
                    <StatusControl id={r.id} status={r.status} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
