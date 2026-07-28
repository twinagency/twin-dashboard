import { getCloneScope } from "@/lib/clone-scope";
import { getPerformanceData, type DowRow, type ModeBucket } from "@/lib/performance-data";
import { fmtNum } from "@/lib/money";
import { Info } from "@/components/clone/fields";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

// Behavioral analytics: classic vs smart, day-of-week timing, and the shape of
// a conversation before a fan's first payment. Read only, no writes, no
// migration. See lib/performance-data.ts for the queries and small-sample
// handling. This is a pre-cutover TEST database with very little traffic, so
// every stat here ships next to its raw N; a lone fan never gets dressed up
// as a percentage.

function pct(v: number | null): string {
  return v == null ? "N/A" : `${Math.round(v * 100)}%`;
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return `${Math.max(0, Math.round(minutes * 60))}s`;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 48) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.round(hours / 24)}d`;
}

// A labeled bar row. Value always printed as text, never color-alone, same
// convention as the rest of the dashboard's simple charts.
function BarRow({ label, value, max, suffix = "" }: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
}) {
  const share = max > 0 ? value / max : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-mono font-semibold tabular-nums text-ink">
          {fmtNum(value)}
          {suffix}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/10">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${value > 0 ? Math.min(100, Math.max(3, share * 100)) : 0}%` }}
        />
      </div>
    </div>
  );
}

export default async function PerformancePage() {
  const cloneId = await getCloneScope();
  const data = await getPerformanceData(cloneId);

  return (
    <div className="text-ink">
      <h1 className="mb-1 text-2xl font-semibold">Performance</h1>
      <p className="mb-5 max-w-2xl text-sm text-muted">
        How the fleet actually behaves: classic vs smart mode, day-of-week timing, and what a
        conversation looks like before a fan pays. This is a pre-cutover test database with very
        little traffic, so every rate here is shown next to its raw count.
      </p>

      {/* ── Cut 1: classic vs smart ─────────────────────────────────────────── */}
      <Card className="mb-6 p-5">
        <div className="mb-4 flex items-center gap-1.5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Classic vs smart</h2>
          <Info text="Always computed across the whole fleet (not the clone picked above) since this is a mode comparison, not a per-clone view. A clone runs classic (sorter) or smart (agent) per its ai_mode setting." />
        </div>

        {!data.fleetHasSmartClone && (
          <div className="mb-4 rounded-lg border border-line bg-muted/5 px-3 py-2 text-xs text-muted">
            No clone in this fleet currently runs smart mode, so there is nothing to compare classic
            against yet. The table below still shows classic's real numbers; the smart row will fill
            in once a clone is switched to smart.
          </div>
        )}

        <ModeTable buckets={data.modeComparison} />
      </Card>

      {/* ── Cut 2: day of week ──────────────────────────────────────────────── */}
      <Card className="mb-6 p-5">
        <div className="mb-1 flex items-center gap-1.5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Day of week</h2>
          <Info text="Message volume, active fans and purchases bucketed by the day of week they happened, plus which day fans made their FIRST purchase on (when they convert). Scoped to the clone picked in the header switcher, or the whole fleet on All clones." />
        </div>
        <p className="mb-4 text-xs text-muted/80">
          {data.scopedCloneName ? `Scoped to ${data.scopedCloneName}.` : "All clones."}
        </p>
        {!data.dowHasAnyData ? (
          <EmptyNote text="No messages or purchases recorded yet for this scope." />
        ) : (
          <DayOfWeekCharts rows={data.dayOfWeek} />
        )}
      </Card>

      {/* ── Cut 3: pre-purchase pattern ─────────────────────────────────────── */}
      <Card className="p-5">
        <div className="mb-1 flex items-center gap-1.5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Pre-purchase pattern</h2>
          <Info text="For every fan with a purchase on record, what the conversation looked like beforehand: how many messages she and he exchanged, how long since first contact, and whether she'd already sent a photo or video. Discount usage isn't included below, see the note." />
        </div>
        <p className="mb-4 text-xs text-muted/80">
          {data.scopedCloneName ? `Scoped to ${data.scopedCloneName}.` : "All clones."}
        </p>

        {data.prePurchase.anomalousExcluded > 0 && (
          <div className="mb-4 rounded-lg border border-line bg-muted/5 px-3 py-2 text-xs text-muted">
            {data.prePurchase.anomalousExcluded} purchase{data.prePurchase.anomalousExcluded > 1 ? "s" : ""}{" "}
            excluded: the recorded purchase timestamp predates the fan&apos;s recorded first-contact
            date, which this test database has (seeded/replayed data out of order), not a real
            sub-zero conversion time. Showing it would be dishonest, so it&apos;s left out rather than
            reported as a fast conversion.
          </div>
        )}

        {data.prePurchase.validCount === 0 ? (
          <EmptyNote text="No fan currently has a purchase with a trustworthy pre-purchase conversation to measure (either nobody has purchased yet, or the only purchase on record is the anomaly noted above)." />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <MiniStat label="Purchasers measured" value={fmtNum(data.prePurchase.validCount)} />
              <MiniStat
                label="Avg messages before"
                value={data.prePurchase.avgMessagesBefore != null ? fmtNum(data.prePurchase.avgMessagesBefore) : "N/A"}
              />
              <MiniStat
                label="Avg time to purchase"
                value={data.prePurchase.avgElapsedMinutes != null ? formatDuration(data.prePurchase.avgElapsedMinutes) : "N/A"}
              />
              <MiniStat
                label="Media sent first"
                value={`${data.prePurchase.mediaFirstCount}/${data.prePurchase.validCount} (${pct(data.prePurchase.mediaFirstPct)})`}
              />
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fan</TableHead>
                  <TableHead>Clone</TableHead>
                  <TableHead className="text-right">Messages before</TableHead>
                  <TableHead className="text-right">Time to purchase</TableHead>
                  <TableHead className="text-right">Media sent first</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.prePurchase.rows.map((r) => (
                  <TableRow key={`${r.cloneName}-${r.telegramId}`}>
                    <TableCell className="font-mono text-xs">{r.telegramId}</TableCell>
                    <TableCell>{r.cloneName}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{fmtNum(r.messagesBefore)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatDuration(r.elapsedMinutes)}</TableCell>
                    <TableCell className="text-right">
                      {r.mediaFirst ? <Badge variant="secondary">Yes</Badge> : <Badge variant="outline">No</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}

        <div className="mt-4 flex items-start gap-1.5 text-[11px] text-muted/80">
          <Info text="Whether a discount was offered isn't stored per-purchase anywhere in this database. A pending discount lives on the fan's users row and is cleared (overwritten) the moment it's used, so there's no historical record to join back to a specific purchase. Rather than guess, this cut is left out." />
          <span>Discount involvement: not tracked in stored data, left out rather than estimated.</span>
        </div>
      </Card>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <div className="flex h-24 items-center justify-center text-center text-xs text-muted">{text}</div>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-3">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-0.5 font-mono text-base font-semibold tabular-nums text-ink">{value}</div>
    </div>
  );
}

function ModeTable({ buckets }: { buckets: ModeBucket[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Mode</TableHead>
          <TableHead className="text-right">Clones</TableHead>
          <TableHead className="text-right">Fans</TableHead>
          <TableHead className="text-right">Converted</TableHead>
          <TableHead className="text-right">Revenue</TableHead>
          <TableHead className="text-right">Revenue / fan</TableHead>
          <TableHead className="text-right">Msgs / fan</TableHead>
          <TableHead className="text-right">Retained</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {buckets.map((b) => (
          <TableRow key={b.key}>
            <TableCell className="font-medium">{b.label}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">{fmtNum(b.cloneCount)}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">{fmtNum(b.fans)}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {b.fans > 0 ? `${b.purchasers}/${b.fans} (${pct(b.conversionPct)})` : "N/A"}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums text-good">{fmtNum(b.revenueStars)} ⭐</TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {b.revenuePerFan != null ? `${(Math.round(b.revenuePerFan * 10) / 10).toLocaleString()} ⭐` : "N/A"}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {b.avgMessagesPerFan != null ? (Math.round(b.avgMessagesPerFan * 10) / 10).toLocaleString() : "N/A"}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {b.fans > 0 ? `${b.retainedFans}/${b.fans} (${pct(b.retentionPct)})` : "N/A"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DayOfWeekCharts({ rows }: { rows: DowRow[] }) {
  const maxMessages = Math.max(1, ...rows.map((r) => r.messages));
  const maxRevenue = Math.max(1, ...rows.map((r) => r.revenueStars));
  const maxFirstPurchases = Math.max(1, ...rows.map((r) => r.firstPurchases));
  const totalFirstPurchases = rows.reduce((s, r) => s + r.firstPurchases, 0);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div>
        <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Messages sent
          <Info text="Fan (human) messages, bucketed by weekday they were sent." />
        </div>
        <div className="space-y-2.5">
          {rows.map((r) => (
            <BarRow key={r.dow} label={`${r.label} · ${r.activeFans} fan${r.activeFans === 1 ? "" : "s"}`} value={r.messages} max={maxMessages} />
          ))}
        </div>
      </div>
      <div>
        <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Revenue
          <Info text="Stars charged, bucketed by weekday paid." />
        </div>
        <div className="space-y-2.5">
          {rows.map((r) => (
            <BarRow key={r.dow} label={r.label} value={r.revenueStars} max={maxRevenue} suffix=" ⭐" />
          ))}
        </div>
      </div>
      <div>
        <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          First purchases
          <Info text="Each fan's very first purchase, counted once, on the weekday it happened. This is the 'when fans convert' cut. With this little data most days will show 0." />
        </div>
        {totalFirstPurchases === 0 ? (
          <EmptyNote text="No fan has converted yet in this scope." />
        ) : (
          <div className="space-y-2.5">
            {rows.map((r) => (
              <BarRow key={r.dow} label={r.label} value={r.firstPurchases} max={maxFirstPurchases} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
