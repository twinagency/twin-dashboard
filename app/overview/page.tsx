import PreviewNotice from "@/components/onlyfans-preview/PreviewNotice";
import { AllChannelsOutline } from "@/components/onlyfans-preview/SurfaceNote";
import { requireOperatorSurface } from "@/lib/channel-scope";

// All channels: the combined surface, and the reason the channel switch exists.
//
// It is deliberately not built. The earnings contract has to be real before a
// total on it would mean anything, and a combined total that silently added
// Telegram Stars to OnlyFans amounts is the specific mistake the handover
// forbids. So this is an outline with its own gate named, not a dashboard of
// zeroes.
export default async function OverviewPage() {
  await requireOperatorSurface();
  return (
    <>
      <PreviewNotice />
      <AllChannelsOutline />
    </>
  );
}
