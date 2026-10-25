import { notFound } from "next/navigation";
import PreviewNotice from "@/components/onlyfans-preview/PreviewNotice";
import { SurfaceNote } from "@/components/onlyfans-preview/SurfaceNote";
import { ONLYFANS_CHANNEL } from "@/lib/channel-nav";

// The OnlyFans stages that are not built. Each one names its gate instead of
// rendering an empty screen or an inert control.
//
// These routes exist so the navigation model in `lib/channel-nav.ts` is
// complete and so a bookmarked section answers honestly rather than 404ing on a
// section the sidebar itself calls planned. Any other section is a real 404:
// the list below is the whole allow-list, read from the same definition the
// navigation uses.
//
// The route is dynamic like every other page here — the root layout reads
// `x-pathname` on each request — so there is nothing to pre-generate.
export default async function OnlyFansPlannedSection({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const item = ONLYFANS_CHANNEL.nav.find(
    (entry) => entry.availability === "planned" && entry.href === `/onlyfans/${section}`,
  );
  if (!item) notFound();

  return (
    <>
      <PreviewNotice />
      <SurfaceNote label={item.label} availability="planned" note={item.note} route={item.href} />
    </>
  );
}
