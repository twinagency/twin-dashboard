import PreviewNotice from "@/components/onlyfans-preview/PreviewNotice";
import { AllChannelsOutline } from "@/components/onlyfans-preview/SurfaceNote";

// All channels: the combined surface. It is the reason the channel switch
// exists, and it is deliberately not built — the earnings contract has to be
// real before a total on it would mean anything.
export default function OverviewPage() {
  return (
    <>
      <PreviewNotice />
      <AllChannelsOutline />
    </>
  );
}
