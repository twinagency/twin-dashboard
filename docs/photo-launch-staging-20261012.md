# Controlled photo launch: staging checkpoint, 12 October 2026

The launch is authorised but not deployed at this checkpoint. Staging credentials now work. This supersedes the access and staging blockers in the earlier recovery note. No production creator setting, catalogue, schema, charging, tips, bundle or memory activation has changed.

## Real staging flow

The production Next build ran an authenticated dashboard session and real multipart HTTP requests to `/api/admin/v1/media`, which invokes the existing dashboard `uploadPhoto` server action. It used the private staging media bucket and database in `zqotxvrxuaocsonpizuw`, creator `photoflow-editor-test` (`7e57f10f-0000-4000-8000-00000000f001`). This was not a helper-only upload. Each completed case verified the saved row, creator, source hash, stored JPEG, price/free flag, effective analysis model/provider and refreshed `/media` page.

| Frozen retained case | Final checked disposition | Reason |
| --- | --- | --- |
| b44898f3-a6e7-465b-b994-4bb18a91f493 | needs_review | Genital visibility remains ambiguous; confirmed thong cheeks retain ass without full nudity. |
| kyla-1 | analysed | Covered nipples remain no; grey clothing and mirror selfie agree with the file. |
| 70509013-75d6-4d67-8b35-550cf5e129dd | needs_review | Genital visibility remains ambiguous; no sales caption. |
| 448462a7-19f8-4916-a1ad-474f53c813c3 | needs_review after the fix | The real brushes were mistaken for painted imagery. The object-depiction exception holds this claim; no sales caption. |

Two earlier body-paint uploads incorrectly passed. Their records remain in the evidence, including the second wording that escaped the initial narrow guard. Both staging rows were subsequently held explicitly and their captions cleared; prices and files were preserved. The frozen original/reference was not changed. Exact recorded responses are regression fixtures. The final real upload exercised the fixed guard, save and refresh successfully.

Duplicate submission saved once and made no additional model call. An invalid image returned a failed item, no misleading uploaded success, and no row. Other creators' rows remained unchanged. Both free and paid uploads were exercised. Original staging model settings were restored after the runs (manually after the interrupted run).

All image requests used qwen/qwen3.8-27b through DeepInfra only, provider fallbacks false, xhigh reasoning excluded, temperature 0, JSON, 16384 completion tokens and factual text before the image. The existing 768px JPEG quality-80 preparation is unchanged. The pre-existing send-caption call is text-only and retains its previous model/routing; it is not an image-provider fallback. No fan conversation call was added.

Evidence: `photo-launch-staging-evidence-20261012.json`. Original fifteen first-pass responses still replay 3 analysed / 12 needs_review because they do not contain coverage reasons; the per-item reasons and unchanged hashes remain in `photo-launch-recovery-20261012.md`. This is not an 80% model error rate.

## Small implementation changes

- Optional photo coverage reasons allow an explicitly out-of-frame unknown without establishing it as yes or no. In-frame ambiguity, absent coverage reasons, contradictions, second-look failures and prior visibility exceptions remain held. Unknown attributes cannot license tags, prices or exact claims. Cropped regions cannot establish full nudity.
- The existing normalizer and repair validators now hold body-paint object-depiction claims. Repeated model agreement cannot distinguish a real held object from a painted representation reliably in the checked case. Ordinary body paint without such a claim remains eligible. This conservative exception can also hold a genuine painted design; it adds no AI call and does not change video rules.
- The admin upload route respects a resolved `{ok:false}` from the action. It reports unconfirmed saving truthfully instead of announcing success. Its declared deadline is 900 seconds.
- The existing text-only send-caption retry now shares a 60-second cancellation budget. Combined with the 750-second vision budget, this leaves time for storage within the planned 900-second proxy deadline.
- V1 individual and bundle factual consumers exclude promotional captions. Trusted short descriptions/tags remain available, and a legacy individual without factual detail can remain a generic catalogue item without acquiring visual attributes. Tests that previously stored factual descriptions only in the caption field now populate the factual field; flow expectations are retained. Held rows still return no usable facts.

## Candidate and compatibility checks

Dashboard candidate includes main `fb8948acd951e9a678791d13aa4e9ae85681c454`, preserving the newer questionnaire-save change. The complete build/typecheck and affected profile, classification, correction, analysis, pricing, upload resilience and API failure tests pass locally. Actual browser automation was not rerun in this environment; authenticated page refresh was exercised over HTTP.

V1 candidate `188c4437c7b4fde86b4c91b92b761013ce26f171` includes current main `eaabfe31c7e279722740766f06d450114ce9f6f1`. Thirteen previously failing flow suites now pass locally, plus media-state, bundle-member/readiness and stale-caption regressions. Full repository CI is still a release gate.

V2 combined candidate `ef040a757627bb5813b4f19ac47af2c1f373506c` preserves both 90-message local retention and newer 90-day operator history from `d7da542b11f56b791ce1e68a5a78ded556e14eb8`. Current live source was inspected: it also contains the 700-character whole-sentence media-description change, already included in the candidate. Focused media/grounding, 389 delivery checks, 177 memory-wiring checks, 90-day history checks and typecheck pass. Ordinary/Business delivery, ownership, selected-file/message agreement and held bundles use simulated Telegram/storage/conversation transport. No Stars were spent, fan messages sent or Business connections switched.

## Remaining release work and rollback

Wait for final CI and compare latest heads again. Prepare and verify scoped proxy/host rollback, then use the additive media-state migration, compatible bot consumers and dashboard release. Activate only one low-impact creator and verify a controlled upload of that creator's own file before any expansion. The actual production proxy was not part of the local staging HTTP test.

Retained rollback references (recheck immediately before deploying):

- Dashboard previously `24a07ae8b536c88ec9443d3cf35927b2ffa259b2`, image `323149985112.dkr.ecr.ap-southeast-2.amazonaws.com/twin-dashboard@sha256:c2be9368feb6160c2d5ced099fe1a0cf6b7ed5c833f2e53b4df3c7a55c168932`. Main has since advanced; fresh live image verification is pending.
- V1 `eaabfe31c7e279722740766f06d450114ce9f6f1`, running image `sha256:7af7398f6a11a45b17a0c1ef205a83c24ee3b4c384c9e245db67d21a23ec9b05`.
- V2 bot `sha256:c425cb955352a5062717f8f650367cdae4297402c9af39d300c6d52b9fdaee16`; dashboard `sha256:c1a6c521c76431ea638494f00acac2a057b77b44ab9ac9dfe8a1985976ad089c`. Existing host backup directory `/home/ubuntu/twin-v2-backups` and separate `/home/ubuntu/twin-v2/data` and `logs` mounts must be preserved. Do not restore old financial data.

Existing-content repair remains separate and unapplied. Old previews are not approved. Videos remain on the prior model and outside the photo launch; unfinished video evaluation/repair is unchanged.
