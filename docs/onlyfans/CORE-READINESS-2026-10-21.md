# Core connection and creator preparation, 21 October 2026

## Changes

- Expired private sign-in attempts remove the credential form. Creator-session loss clears private form state and refreshes the parent. Status reads are bounded; transient status errors clear after recovery. Stale input and status replies cannot restore a previous attempt.
- Platform status separates a valid paused account from an expired connection. Old pending enrollments no longer lock setup. A creator can reconnect the account they select. Failed refreshes display unknown status rather than a current connected/sending claim.
- Creator Home shows saved profile-answer counts, verified photo/video counts, pending uploads, provided folder links and recorded consent. Reads use the existing creator-account ownership boundary and exact count queries. Missing data remains unavailable. This is preparation, not account activation or a new onboarding requirement. Twin uploads and the OnlyFans vault remain separate; native catalogue prices are reviewed after connection.
- Native uploads use bounded requests, avoid overlapping background status reads, validate each chunk acknowledgment against its account/job/file and preserve uncertain-transfer recovery. Completed jobs replace stale queued messages with their recorded outcome.
- Full-video preparation has bounded reads, clears playback on session loss, preserves browser playback errors through status refreshes, and reuses the same request identity when preparation acknowledgment is uncertain.

No database migration, membership grant, creator enrollment, provider upload, fan message, payment or production media edit is part of these changes. Purchase/refund authority, outgoing allowances and the media activation hold are unchanged.

## Verification

Local Windows Node 24 verification used the existing matching dependency lock, installed Chrome and pinned Playwright WebKit:

- TypeScript noEmit passed.
- Creator preparation ownership/projection/count/outage cases passed.
- Creator platform HTTP identity, sign-in and enrollment guards passed.
- Native media contract checks passed, including chunk bounds, ownership, Range/HEAD/416 and invalid-stream rejection.
- Agency scope and ownership checks passed.
- Actual Next HTTP and fresh Chrome checks passed for scoped inbox reads, manager/read-only actions, CSRF, stable staff actor, revoked membership, version refusal, private history and desktop/mobile handover.
- Chrome and mobile WebKit sign-in checks passed, including expired-form removal, session-loss clearing, transient recovery, account-specific reconnection, exact confirmation retry and small-phone controls.
- Actual browser bulk-upload checks passed for committed lost acknowledgment, changed-file refusal and individual outcomes. A synthetic MP4 decoded, played and sought successfully. Preparation/media screens fit 1280/390/320px.

Production build and CI results are recorded on the pull request and release, rather than inferred from these local checks.

## Production baseline and remaining acceptance

Read-only production inspection confirmed dashboard 8ca569186785211a8ce199e6d6829664da875a4a, native runtime 72771f73b484c4a45a49d8bbfda58aeae1cd5019, and healthy private sign-in browser 1aee00e056492653a2a8963366949ae7c48fce6a. Both native media flags remain 0. The existing release record documents automatic approval's activation hold over four damaged catalogue videos. This continuation does not override that decision.

An explicitly selected, authorised OnlyFans account and approved test media are still needed to prove real sign-in/reconnection, photo/video upload, mixed batch, playback/seek, provider carrier cleanup, human takeover and exact purchase/refund linkage. None of the current creator roster is assumed to have an OnlyFans account or an existing audience to import.
