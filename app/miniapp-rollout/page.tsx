import Link from "next/link";
import { Card } from "@/components/ui/card";
import { fmtNum } from "@/lib/money";
import { fetchMiniAppRollout, type CloneRolloutRow } from "@/lib/miniapp-rollout-data";
import type { Chip, PriceStats } from "@/lib/miniapp-rollout";

export const dynamic = "force-dynamic";

const CHIP_CLS: Record<Chip, string> = {
  green: "bg-emerald-500/10 text-emerald-600",
  amber: "bg-amber-500/10 text-amber-600",
  red: "bg-rose-500/10 text-rose-600",
};

function Pill({ chip, children, title }: { chip: Chip; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${CHIP_CLS[chip]}`}>
      {children}
    </span>
  );
}

function priceLabel(stats: PriceStats): string {
  if (!stats) return "-";
  return `${fmtNum(stats.min)} / ${fmtNum(stats.avg)} / ${fmtNum(stats.max)}`;
}

export default async function MiniAppRolloutPage() {
  const rows = await fetchMiniAppRollout();
  const fullyOnCount = rows.filter((r) => r.fullyOn).length;

  return (
    <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Mini App rollout</h1>
        <p className="mt-1 text-sm text-muted">
          Turning on the new Mini App per creator. Reference setup is Alanna Pow.
          <span className="ml-1" title="Green means fully wired and live for fans. Amber means partly configured, human action still needed. Red means nothing set up yet.">ⓘ</span>
        </p>
      </div>

      <Card size="sm" className="w-fit gap-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Fully on</div>
        <div className="text-2xl font-semibold text-ink">{fullyOnCount} / {rows.length}</div>
        <div className="text-xs text-muted">Mini App live, TON priced, media and bundles ready</div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1300px] text-left text-xs">
            <thead className="text-muted">
              <tr>
                <th className="py-2 pr-3">Creator</th>
                <th className="px-2">Mini App</th>
                <th className="px-2">TON</th>
                <th className="px-2" title="Chat checkout is independent of Mini App catalogue readiness. Native chat keeps purchases in Telegram.">Chat checkout</th>
                <th className="px-2">Captions</th>
                <th className="px-2">Previews</th>
                <th className="px-2">Compressed</th>
                <th className="px-2">Oversize videos</th>
                <th className="px-2">Bundles</th>
                <th className="px-2">Photo stars (min/avg/max)</th>
                <th className="px-2">Video stars (min/avg/max)</th>
                <th className="px-2">Setup</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row: CloneRolloutRow) => (
                <tr key={row.clone.id} className={row.fullyOn ? "bg-emerald-500/5" : undefined}>
                  <td className="py-2 pr-3 font-medium text-ink">{row.clone.name}</td>
                  <td className="px-2"><Pill chip={row.rollout.miniApp.chip} title={row.rollout.miniApp.label}>{row.rollout.miniApp.label}</Pill></td>
                  <td className="px-2"><Pill chip={row.rollout.ton.chip} title={row.rollout.ton.label}>{row.rollout.ton.label}</Pill></td>
                  <td className="px-2"><Pill chip={row.rollout.sellViaMiniApp.chip}>{row.rollout.sellViaMiniApp.label}</Pill></td>
                  <td className="px-2">
                    <Pill chip={row.rollout.media.captionChip} title={`${row.mediaCounts.photo.captioned + row.mediaCounts.video.captioned} of ${row.mediaCounts.photo.total + row.mediaCounts.video.total} captioned`}>
                      {row.rollout.media.captionPct}%
                    </Pill>
                  </td>
                  <td className="px-2">
                    <Pill chip={row.rollout.media.previewChip} title={`${row.mediaCounts.photo.previewed + row.mediaCounts.video.previewed} of ${row.mediaCounts.photo.total + row.mediaCounts.video.total} have a stored preview`}>
                      {row.rollout.media.previewPct}%
                    </Pill>
                  </td>
                  <td className="px-2">
                    <Pill chip={row.rollout.media.compressedChip} title={`${row.mediaCounts.photo.compressed + row.mediaCounts.video.compressed} of ${row.mediaCounts.photo.total + row.mediaCounts.video.total} have an originals backup`}>
                      {row.rollout.media.compressedPct}%
                    </Pill>
                  </td>
                  <td className="px-2">
                    <Pill chip={row.rollout.media.oversizeChip} title="Videos over 20MB at their current storage path">
                      {row.rollout.media.oversizeVideos}
                    </Pill>
                  </td>
                  <td className="px-2">
                    <Pill chip={row.rollout.bundles.chip} title={`${row.rollout.bundles.enabledAllowedCount} enabled bundle(s) from allowed themes, ${row.rollout.bundles.invalidEnabledCount} failing validation`}>
                      {row.rollout.bundles.enabledAllowedCount}
                    </Pill>
                  </td>
                  <td className="px-2 text-ink">{priceLabel(row.photoPrices)}</td>
                  <td className="px-2 text-ink">{priceLabel(row.videoPrices)}</td>
                  <td className="px-2">
                    <Link href={`/clones/${row.clone.id}`} className="rounded-md border border-line px-2 py-1 text-[11px] font-medium text-muted hover:bg-muted/10">
                      Setup
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="py-6 text-sm text-muted">No active clones.</div>}
        </div>
      </Card>
    </main>
  );
}
