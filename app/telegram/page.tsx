import PreviewNotice from "@/components/onlyfans-preview/PreviewNotice";
import { SurfaceNote } from "@/components/onlyfans-preview/SurfaceNote";
import { requireChannel } from "@/lib/channel-scope";

// The Telegram channel is a workspace framing, not a second Fans screen.
//
// Telegram's combined fan list and chat thread already ships at /users, with
// its live feed, dossier column and campaign strip. Reproducing any of it here
// would create two Fans and Messages screens, which is the exact outcome the
// handover forbids, so this route points at the real one instead. The gate is
// the same server-side channel check every workspace route uses.
export default async function TelegramPage() {
  await requireChannel("telegram");
  return (
    <>
      <PreviewNotice />
      <SurfaceNote
        label="Fans and Messages"
        availability="existing"
        note="Telegram's combined fan list and chat thread already ships, with the live feed, the dossier column and the campaign strip that belong to it. This channel links there instead of rebuilding it."
        route="/users"
      />
    </>
  );
}
