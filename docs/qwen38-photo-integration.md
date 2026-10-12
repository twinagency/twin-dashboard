# Accepted photo model: integration, 12 October 2026

Jesse accepted the practical quality of Qwen3.8-27B on DeepInfra after the five-photo and ten-more-photo reports. Model selection is settled. This change integrates that exact profile into the existing uploader; it does not activate it, deploy, rewrite creator settings, or repair catalogue rows. Stages 1–5 are unchanged.

## Change

- Selecting `qwen/qwen3.8-27b` uses DeepInfra only, provider fallbacks off, `reasoning.effort=xhigh`, `exclude=true`, 16,384 maximum completion tokens, temperature 0, JSON output and text-before-image ordering. These match the accepted test requests.
- Existing 768px JPEG q80 preparation and the factual prompt are unchanged. No additional call or handler is introduced. Corrective attempts and the existing triggered second look receive the same model profile.
- The new model gets 240 seconds per vision request, with a shared 750-second vision budget covering corrections, transport retries and the second look. It is not a promise that a complete upload finishes in that time: the existing caption writer and storage work are separate. The previous 40-second request/150-second vision budget remains for other models.
- Empty, refused, errored and explicitly truncated vision responses fail rather than becoming accepted facts. Existing status and contradiction checks remain in force.
- Because the creator setting is shared, choosing this photo model explicitly keeps videos on Qwen3-VL-235B. Both model controls display the effective photo/provider and video selections. No claim of Qwen3.8 video accuracy is made.
- Existing settings/defaults continue to use their previous models until an operator selects the new photo candidate. Custom model choices are preserved. Stored schema, fact vocabulary/version, prices, files, owners, purchases and bot conversation calls are unchanged.

## Verification completed

- New offline integration suite exercises the actual analyser, image preparation, OpenRouter request builder and row mapper. It verifies provider pinning, reasoning/token settings, deadlines, corrective retry, triggered second look, refusal/truncation, cancellation, uncertainty holds, effective-model storage and unchanged default/video routing. HTTP replies and the caption writer are simulated; zero new paid model requests.
- Existing classification, correction, media-analysis (including video preparation), upload-resilience and config/pricing suites pass. Changed runtime modules and the new test pass TypeScript. The four edited UI files pass syntax/transpilation; a complete dashboard build was not run in this partial checkout.
- Inspected upstream review head: `8dfabcb5713ceb71c227b5dff0f68acc0abd9b7d`. Current prompt/normalizer and repair source were compared with it before editing. Prior local work was preserved in a separate checkout.

## Real test evidence and the remaining integration decision

The accepted reports contain 15 distinct retained photos, not a random sample of the full catalogue. All 15 first-pass requests returned usable JSON without provider blocks. Combined measured cost was US$0.084513825, with request times approximately 30–157 seconds. These are first-pass costs and times; uploader corrections, second looks and legacy captions are additional. The comparison is AI-reviewed with owner acceptance, not proof of perfect accuracy.

Passing those first-pass responses directly through the current normalizer gives **3 analysed and 12 needs_review**. This replay makes no new vision/correction/second-look calls, so it is not a prediction of every final uploader status. All 12 have at least one uncertain anatomy field; two also have prose/fact contradictions. Cropped or out-of-frame features often cause the uncertainty. It does not mean 12 photos were incorrectly described.

The existing rule says uncertain anatomy holds the entire item. Silently deleting that rule would contradict the accepted development requirements. This integration therefore preserves it and does not recommend immediate activation for automatic uploads. The remaining decision is how cropped-out/unknown attributes should affect whole-item eligibility while still never supporting an exact claim. That needs an explicit rule change and affected-flow verification, not another round of model shopping. Existing garment/visibility exceptions and known false claims must not be bypassed.

Recorded response SHA-256 values:

- Five: `d93373338b1807f6fb3e4df7fa236cecbe4523ad273a37ef3536439afb89bc73`
- Ten: `077c9df6905698c9ef0b771402ba13c2fbb1289dc22ae7e11b4f3ef5379afa38`

## Activation and rollback

Keep deployment and catalogue writes paused. After the eligibility rule is settled, check the deployed dashboard/proxy upload timeout against the longer profile: the repository uses a standalone Node server, but the live proxy timeout was not inspected. Exercise an actual staging upload through the server action with the selected model, including the existing second look/status flow. These are remaining integration checks, not completed ones.

Then use the existing release procedure and explicitly set the chosen creator's `vision_model` to `qwen/qwen3.8-27b`; do not bulk recaption as part of the model switch. Existing content changes only through a separately reviewed, hash-bound repair preview. Rollback is the prior code image plus the prior creator model setting; this change has no migration or data rollback. Do not restore old financial records.
