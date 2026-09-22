import { Suspense } from "react";
import { Info } from "@/components/clone/fields";
import MtprotoNav from "@/components/mtproto/MtprotoNav";
import SafetyStrip from "@/components/mtproto/SafetyStrip";
import { Skeleton } from "@/components/mtproto/kit";

// One shell for every MTProto Campaign screen: title, the three-tab strip and
// the SAFETY strip (with the big red Stop) always at the top. The strip
// streams in on its own so the page underneath is never held up by it.
export default function MtprotoCampaignLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard-page pb-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-heading text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-3xl">
          MTProto Campaign
          <Info text="Win back silent fans by messaging them from each creator's own Telegram account. Nothing here sends by itself: a person starts every run, and going live needs a typed confirmation." />
        </h1>
        <MtprotoNav />
      </div>
      <Suspense fallback={<Skeleton className="mb-5 h-[92px] w-full rounded-2xl" />}>
        <SafetyStrip />
      </Suspense>
      {children}
    </div>
  );
}
