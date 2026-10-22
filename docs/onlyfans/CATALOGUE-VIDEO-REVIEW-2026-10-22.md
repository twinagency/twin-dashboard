# Four legacy video sources awaiting review

Recorded diagnosis: 22 October 2026. This is a review record, not a new live probe.
The last deployment audit checked 1,313 sources: 1,309 passed and four failed.
The source diagnosis reported missing MP4 `moov` metadata. Changing an encoder
whitelist cannot recreate that missing metadata reliably.

| Video ID | Recorded condition | Next action |
| --- | --- | --- |
| 939f5799-692e-4feb-ab88-ec75e0fbcf56 | Invalid source, missing metadata | Obtain a playable original; prepare replacement |
| a55c1149-7f81-43e2-9b4a-9d523dfe35fb | Invalid source, missing metadata | Obtain a playable original; prepare replacement |
| b5a18847-7c8a-43ee-8200-86b1c957436e | Invalid source, missing metadata | Obtain a playable original; prepare replacement |
| e0ea6098-1628-4365-b276-d559f3a1cbbd | Invalid source, missing metadata | Obtain a playable original; prepare replacement |

## Replacement route

1. Confirm the current video ID, creator ownership, storage object and any
   purchases or bundles that reference it. Do not infer current state from this list.
2. Keep the original object and a snapshot of the row before any write.
3. Validate a replacement locally with `ffprobe`, then validate a full decode
   and the five-second blurred derivative with the existing encoder.
4. Preserve the existing video identity and purchase associations. A replacement
   must invalidate only that video's derivative cache. Prepare a guarded change
   with rollback after confirming the current schema and storage layout.
5. Recheck that video, then the complete discovered catalogue. Report remaining
   failures explicitly. Do not skip these IDs to make deployment look successful.

## If an original cannot be recovered

Prepare a separate withdrawal proposal that lists affected bundles, offers and
past buyers. Withdrawing from new sales must retain purchase records and provide
an agreed route for existing buyers. Do not delete a row or storage object as a
shortcut. No withdrawal, deletion, replacement or purchase change has been made.

The existing catalogue preview already shows an unavailable state on failure.
The source files themselves remain unresolved until originals are supplied or a
specific withdrawal proposal is approved. Live OnlyFans tests remain paused.
