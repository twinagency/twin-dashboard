import { notFound } from "next/navigation";
import PreviewNotice from "@/components/onlyfans-preview/PreviewNotice";
import { SurfaceNote } from "@/components/onlyfans-preview/SurfaceNote";
import { ONLYFANS_CHANNEL } from "@/lib/channel-nav";

// The OnlyFans stages that are not built. Each one names its gate instead of
// rendering an empty screen or an inert control.
export function generateStaticParams() {
  return ONLYFANS_CHANNEL.nav
    .filter((item) => item.availability === "planned")
    .map((item) => ({ section: item.href.replace("/onlyfans/", "") }));
}

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
