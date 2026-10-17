import PreviewNotice from "@/components/onlyfans-preview/PreviewNotice";
import { SurfaceNote } from "@/components/onlyfans-preview/SurfaceNote";

// The Telegram channel points at the Fans and Messages screen that already
// ships. It is not reproduced here: a second copy of that workflow is the exact
// outcome the handover forbids.
export default function TelegramPage() {
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
