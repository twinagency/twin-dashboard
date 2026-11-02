# Twin photo launch recovery, 12 October 2026

**Historical recovery snapshot.** See [the final release report](photo-launch-release-20261012.md) for deployed commits, the controlled creator, production verification and current rollback references, and [the staging checkpoint](photo-launch-staging-20261012.md) for retained real-upload results and failures. The fifteen-response replay below remains unchanged.

The interrupted session's source, local edits, retained photos and 15 accepted first-pass answers were recovered. This checkpoint continues that work. The controlled launch is authorised, but it has not happened. No creator has been switched to Qwen3.8, and no production schema, catalogue, price, financial record or Business connection was changed in this recovery session.

## Recovered references and current production

- Dashboard PR 153: `codex/media-fix-review-20261012`, targeting `media-repair-batch`, starting at `b09aaa3b0739a3846345a4f0f66bd0ae19344c85`.
- V1 PR 84: starting at `4c35e520dc870c33921376199afba7f4bc19d76f`. Its branch already contains current V1 main `eaabfe31c7e279722740766f06d450114ce9f6f1`.
- V2 PR 1: unchanged at `ea69bd64dcb57a022c41724c04c1073a2de5e7a8`, targeting `v2-media-facts`.
- Current dashboard main and the running dashboard: `24a07ae8b536c88ec9443d3cf35927b2ffa259b2`. Its exact source was recovered and combined with the media candidate, preserving its newer onboarding and chat-history work.
- Running dashboard image: `323149985112.dkr.ecr.ap-southeast-2.amazonaws.com/twin-dashboard@sha256:c2be9368feb6160c2d5ced099fe1a0cf6b7ed5c833f2e53b4df3c7a55c168932`.
- The V1 runtime reports `eaabfe31c7e279722740766f06d450114ce9f6f1`. V2 containers are running, but they expose no GIT_SHA and their host source has no .git directory. An exact V2 live commit has not been established by the recovered runtime check; do not substitute an earlier report for that check.
- Production project `aouaenqayfltoqrmpitg` still lacks the photo/video analysis-status columns. Existing records remain legacy. The additive media-state migration is in V1 PR 84 and remains unapplied to production.

## Narrow eligibility change

Photo observations add optional `uncertainty_reasons` for unclear nipples, genitals, anus and bare_buttocks. `out_of_frame` means the relevant region is entirely outside the crop. In-frame ambiguity, obscuration, uncertain fabric visibility, blur or insufficient detail uses `ambiguous_visibility`. No unknown value becomes yes or no.

A photo with an explicitly cropped-out feature can be analysed for its other confirmed content. Only yes supports tags, flags and exact claims. Missing reasons preserve the previous conservative hold, including for older observations. Contradictions, in-frame ambiguity, failed analysis, failed second-look confirmation and the existing visibility/garment exceptions remain held. Videos do not use this relaxation.

The recovered caption guard also prevents a visible-buttocks claim when that feature is unknown. A further reproduced gap allowed full_nude while declaring an anatomy region out of frame; that case now remains held and loses the full_nude tag. Operator corrections remove obsolete coverage reasons. Price-only edits do not approve held items.

An actual V1 consumer replay also reproduced a stale promotional caption reintroducing an unknown genital claim when visual_description was absent. The existing mediaFacts component now uses the factual visual_description, trusted auto_desc and trusted tags; the promotional send caption is not exact-match evidence. Legacy catalogue availability is retained. V2 already ignores captions for matching, and the additive coverage field needs no V2 format change.

## Unchanged recorded-response replay

This is the final offline first-pass disposition, not a fresh final-uploader evaluation. The original answers do not contain coverage reasons. None was invented from prose or changed to make the replay pass. Correction and second-look calls were not rerun.

| Retained item | Disposition | Reason |
| --- | --- | --- |
| e8ad7706-f3d7-4eb1-a523-21374f804eaf | needs_review | unclear nipples and bare_buttocks |
| kyla-1 | needs_review | unclear bare_buttocks; exposed-chest prose contradicts nipple evidence |
| b44898f3-a6e7-465b-b994-4bb18a91f493 | needs_review | unclear genitals and anus |
| 448462a7-19f8-4916-a1ad-474f53c813c3 | needs_review | unclear genitals, anus and bare_buttocks |
| 7272ed92-091c-4bac-a907-b49e50cd0baa | needs_review | unclear genitals and anus |
| a3809576-b6c7-4fcc-9e6f-387f04c00086 | needs_review | unclear genitals and bare_buttocks |
| 70509013-75d6-4d67-8b35-550cf5e129dd | needs_review | unclear bare_buttocks |
| bd12a5a8-9f04-41e1-b6d0-546dccf93c9f | analysed | no normalizer issue |
| dan-1 | needs_review | unclear nipples and anus |
| 5313cd84-dc44-42be-aa1d-cf3723e8dcf8 | analysed | no normalizer issue |
| efb9fb36-a0c2-4c70-bce4-dc046c0f2abc | analysed | no normalizer issue |
| 8c5a937a-eb5c-439e-afba-deaf62edf357 | needs_review | unclear nipples, genitals and anus |
| fef57d48-ca27-44e2-91fa-9bbaa1cc4c69 | needs_review | unclear bare_buttocks |
| d51523d2-b0eb-4d1c-8a53-faad4a9abb26 | needs_review | unclear nipples and genitals |
| dd390949-117c-47c6-ad25-303ab5096c18 | needs_review | unclear genitals and anus; thong prose without confirmed lingerie or swimwear |

Result: 3 analysed / 12 needs_review. This is not an 80% photo-error rate. The two saved JSONL SHA-256 values remain `d93373338b1807f6fb3e4df7fa236cecbe4523ad273a37ef3536439afb89bc73` and `077c9df6905698c9ef0b771402ba13c2fbb1289dc22ae7e11b4f3ef5379afa38`.

## Verification and limits

The combined dashboard passes its full build and typecheck, classification, profile, analysis, correction, upload-resilience, config/pricing and private-gallery checks. The profile tests exercise the actual image preparation, request builder, analyser and saved-row mapper with simulated HTTP/caption replies. They retain DeepInfra-only, no provider fallback, xhigh with reasoning excluded, temperature 0, 16,384 tokens, JSON, text before image, 768px JPEG quality 80, 240-second requests and the shared 750-second vision budget. Failure, correction, second-look, crop, price and manual-edit paths remain covered. No new real model request was made during recovery.

V1 focused correction, bundle-member, analysis-state, inventory/receipt and named-medium checks pass. V1 typecheck passes. V2 media-facts, reply-grounding and 389 delivery checks pass; V2 typecheck passes. Ordinary/Business and free/paid delivery use the real turn/delivery implementation with simulated Telegram, storage and conversation-model transport. They are not live sends or Business-connection changes. No conversation-model call was added.

**Actual staging upload: not completed.** The existing test project `zqotxvrxuaocsonpizuw` is healthy and already has the analysis columns. SQL access works, but the uploader's authorised staging server/service credential is absent from the retained files and cloud application environments. The older staging paths refer to Ronan's machine, which is not connected. The exposed connector provides publishable keys only; test photos are protected by RLS and have no anonymous insert privilege. No protection was weakened to bypass this requirement.

The cloud access route itself works: the existing `codex/media-launch-access-20261012` GitHub Actions workflow uses established AWS credentials to run read-only SSM checks. Desktop Commander devices are offline, but this does not block production cloud inspection.

The Twin Apache configuration has Timeout 300 and no per-vhost override for its port-3001 proxy. This is shorter than the 750-second vision budget. Flirt's separate proxy has 600 seconds. The compatible release needs a scoped Twin proxy deadline plus a check of the caption/storage portion of the complete action before a live long-running upload can be called verified. No proxy setting was changed during recovery.

## Remaining authorised launch gates

1. Restore the existing staging server credential securely, then run bounded real-model checks through the actual dashboard action, including storage/row save and refresh. Keep the retained failure cases and expected answers fixed.
2. Check resulting facts against the selected file and both matching consumers; unknown attributes must never support claims. Verify creator/file identity, ownership, free/paid behavior, held bundles, save failures and retry/deduplication.
3. Establish an exact current V2 code/image rollback reference and retain all previous settings before release. Check intervening changes again.
4. After these gates pass, use the existing compatible release order for the media migration, bot consumers, dashboard and scoped proxy deadline. Activate the selected photo model for one appropriate low-impact creator, verify the controlled upload and saved result, then report its identity. No extra general deployment approval is required.

Rollback must use the retained code/image and the previous creator model setting. The V1 migration has `db/manual/ROLLBACK_20261012000000_media_analysis_state.sql`; do not drop useful new metadata casually and never restore financial records. There is no activation to undo in this session.

Existing-content repair remains separate and unapplied. Do not apply old Tammy previews or bulk recaption. Video evaluation/repair remains unfinished and the selected Qwen3.8 profile is photo-only. Charging, tips, bundles and memory activation remain outside this release.
