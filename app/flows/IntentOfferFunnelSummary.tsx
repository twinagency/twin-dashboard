import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  countIntentExperimentAssignments,
  summarizeIntentOfferEvents,
  type IntentExperimentAssignmentRow,
  type IntentOfferEventRow,
  type IntentOfferVariant,
} from "@/lib/intent-offer-analytics";

type IntentOfferFunnelSummaryProps = {
  events: IntentOfferEventRow[];
  assignments: IntentExperimentAssignmentRow[];
  hasCreators: boolean;
  version: 2 | 3;
  unavailable?: boolean;
  assignmentsUnavailable?: boolean;
  truncated?: boolean;
  windowLabel: string;
};

function formatRate(value: number | null): string {
  if (value === null) return "N/A";
  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

function variantLabel(variant: IntentOfferVariant): string {
  if (variant === "v3") return "V3";
  return variant === "v2" ? "V2" : "Control";
}

function reasonLabel(reason: string): string {
  return reason.replaceAll("_", " ").replaceAll("-", " ");
}

export default function IntentOfferFunnelSummary({
  events,
  assignments,
  hasCreators,
  version,
  unavailable = false,
  assignmentsUnavailable = false,
  truncated = false,
  windowLabel,
}: IntentOfferFunnelSummaryProps) {
  const variants: IntentOfferVariant[] = version === 3 ? ["v3"] : ["v2", "control"];
  const summaries = variants.map((variant) =>
    summarizeIntentOfferEvents(events, variant),
  );

  return (
    <Card aria-label={`V${version} offer funnel`} className="mb-5 overflow-hidden border border-line p-0">
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">V{version} offer funnel</h2>
            <Badge variant="outline" className="border-accent/30 bg-accent/10 text-accent">
              {version === 3 ? "Creator cohort" : "50/50 fan split"}
            </Badge>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">
            {version === 3
              ? "Every fan of an enrolled V3 creator receives V3."
              : "Inside every V2 creator, each fan is assigned once to V2 or the existing Classic control and stays in that variant."}{" "}
            Attempted, blocked, actually delivered and purchased offers are recorded separately.
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-medium text-muted">{windowLabel}</span>
      </div>

      {!hasCreators ? (
        <div className="px-4 py-5 text-sm text-muted">No New System V{version} creators are enrolled.</div>
      ) : unavailable ? (
        <div className="px-4 py-5 text-sm text-muted">
          Offer-event analytics are temporarily unavailable. Creator flows continue running normally.
        </div>
      ) : events.length === 0 && assignments.length === 0 ? (
        <div className="px-4 py-5 text-sm text-muted">
          No V{version} offer events have been recorded in this enrollment window yet.
        </div>
      ) : (
        <>
          {events.length === 0 && (
            <div className="border-b border-line bg-elev px-4 py-2 text-xs text-muted">
              Fan assignments are live; no offer lifecycle events have been recorded in this window yet.
            </div>
          )}
          {truncated && (
            <div className="border-b border-line bg-warn/10 px-4 py-2 text-xs text-warn">
              This window exceeded the analytics row limit, so the figures below are lower bounds.
            </div>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fan variant</TableHead>
                  <TableHead className="text-right">Assigned fans</TableHead>
                  <TableHead className="text-right">Attempted</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Blocked</TableHead>
                  <TableHead className="text-right">Purchased</TableHead>
                  <TableHead className="text-right">Delivery rate</TableHead>
                  <TableHead className="text-right">Purchase rate</TableHead>
                  <TableHead className="text-right">Stars</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((summary) => (
                  <TableRow key={summary.variant}>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          summary.variant === "v2"
                            ? "border-accent/30 bg-accent/10 text-accent"
                            : "border-line bg-elev text-muted"
                        }
                      >
                        {variantLabel(summary.variant)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {version === 3 || assignmentsUnavailable
                        ? "N/A"
                        : countIntentExperimentAssignments(assignments, summary.variant).toLocaleString("en-AU")}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{summary.attempted.toLocaleString("en-AU")}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{summary.delivered.toLocaleString("en-AU")}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{summary.blocked.toLocaleString("en-AU")}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{summary.purchased.toLocaleString("en-AU")}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatRate(summary.deliveryRate)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatRate(summary.purchaseRate)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold tabular-nums text-good">
                      {summary.stars.toLocaleString("en-AU")}⭐
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t border-line px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Blocked reasons</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {summaries.flatMap((summary) =>
                summary.blockReasons.map((item) => (
                  <Badge key={`${summary.variant}:${item.reason}`} variant="secondary" className="font-normal text-muted">
                    {variantLabel(summary.variant)} · {reasonLabel(item.reason)} · {item.count.toLocaleString("en-AU")}
                  </Badge>
                )),
              )}
              {summaries.every((summary) => summary.blockReasons.length === 0) && (
                <span className="text-xs text-muted">No blocked offers recorded.</span>
              )}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Delivery rate = delivered ÷ attempted. Purchase rate = purchased ÷ delivered. Stars count purchased-offer Stars only.
              {assignmentsUnavailable ? " Fan assignment counts are temporarily unavailable." : ""}
            </p>
          </div>
        </>
      )}
    </Card>
  );
}
