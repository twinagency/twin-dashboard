# Riley and Trashy photo activation — 12 October 2026

Riley was enabled at 09:54:42 UTC / 19:54:42 AEST. Kyla and Dreka were already enabled. Trashy requires a photo-only model override because her base/video model is Mistral; simply replacing her existing vision_model would change video behaviour.

## Compatible change

Nullable clones.photo_vision_model inherits vision_model when absent/null. Photos use the override; videos always use the existing base. The dashboard shows the configured/effective photo model separately. The importer and repair reader use the same selector. No existing-content repair was applied.

The optional-column reader falls back only for confirmed missing-column errors, preserving pre-migration compatibility. Permission and provider failures do not silently choose a different model. The setting is protected from agency writes and hidden with other private model configuration for restricted partner views.

Migration 20261012100115 photo_vision_model_override was applied to production; staging also received the additive column. All 20 production creator overrides were null immediately afterward. Existing RLS was retained; the advisor's existing informational clones RLS/no-policy result was unchanged.

Candidate/deployed-source target 52e7b5beaf64f570ea8850c624c3892030a6f991 preserves main 0c53c7a80ce2d8ed93d20d3b658b0e8653e4c571 and all its ancestors. Full CI 38234363017 passed. Initial 7269ee9ddb0464f443934d0da9aa4a57739f04be failed a Supabase projection type inference check; the literal query branches were corrected, then local typecheck and full CI passed.

## Real staging evidence

Run 38234370361, utility commit 56cbfe38bd356009ab513a47ba0e62fb36599067, artifact 11739848209. Exact release source with staging-only test harness.

Actual authenticated dashboard HTTP server action, OpenRouter/DeepInfra request, Supabase private storage/database save and catalogue refresh. Test creator 7e57f10f-0000-4000-8000-00000000f001 had Mistral as vision_model and Qwen3.8-27B as photo_vision_model. Both original settings were restored.

The original frozen source was unchanged (SHA256 37d13829fa072e03edd8ec8fb8f83c1e72da98eb4548c4f56fe977c0929f148b). Prepared/stored SHA256 0e860ce2297b4a312a50b20d2e48595019faecf82151015dcacbdfe4bec7c25b. Upload elapsed 71.949 seconds, one actual vision call.

Saved row 4c8bc8a4-5573-4e19-b207-694d5a54d096 recorded analysis_model=qwen/qwen3.8-27b, analysis_provider=DeepInfra, is_free=false and 350 Stars. It was correctly held as needs_review for genitals/anus ambiguity, with both uncertainty reasons ambiguous_visibility. Confirmed solo/ass/lingerie facts remained; no forbidden kneeling claim or unsupported positive explicit tag passed. This is a transport/save/routing success with a held result, not a claim that every output is automatically usable.

Duplicate upload saved once and made no additional model call. Invalid image reported failure without a row. Stored identity, creator ownership, paid flag, refreshed catalogue and another creator's records were checked. No expected answer was changed. This used the retained control image inside the dedicated staging creator; it was not a new Trashy production upload.

The accepted Qwen profile and exclusion rules are unchanged: qwen/qwen3.8-27b, DeepInfra only, fallbacks disabled, xhigh reasoning excluded, temperature 0, JSON, 16,384 completion tokens, factual instructions before 768px quality-80 JPEG. Unknown attributes never establish claims or exact matches; contradictions, analysis failures and material ambiguity remain held.

## Activation and rollback

Dashboard commit 52e7b5beaf64f570ea8850c624c3892030a6f991 is deployed, image 323149985112.dkr.ecr.ap-southeast-2.amazonaws.com/twin-dashboard@sha256:6a9053a820657db8e8b404a157489e860c510c4e72ffa8be5e1b0ca227b31c83. Container started 10:23:39 UTC; deploy runtime check passed at 10:23:53 and independent verification at 10:25:32. Trashy was enabled after that runtime check; independent DB read at 10:25:18 confirmed the Qwen photo override and unchanged Mistral base/video model. Kyla, Riley and Dreka's photo settings remain enabled.

Deployment run 38235414819 passed its type/build/behavioural tests, creator upload gates, running-commit proof, recovery/agency checks and live signup/upload-boundary tests with cleanup. Its overall status is failure only because the final video-preview warmup again found the same four pre-existing invalid sources (45 passed, 4 failed). This does not roll back the verified running photo release. The gate was not disabled and its failure is not represented as all-green.

Read-only Telegram getBusinessConnection checks at 10:25:30 confirmed Kyla, Riley and Trashy enabled with reply permission. No connections were switched and no messages sent. Dreka's previously disabled Telegram connection is separate from her enabled uploader setting.

Previous dashboard commit cb7958720a8467ec152928966790dbda36a1eb8f; image 323149985112.dkr.ecr.ap-southeast-2.amazonaws.com/twin-dashboard@sha256:50f75a5e00fcd27e0af8c4aaa185ab062effd9453cdb9ba87e041c4ab9e61d6f. Clear Trashy's override with ID/current-value guards before any code rollback. Retain the additive column and the photo exclusion safeguards. No financial snapshots may be restored.

Trashy ID 3484f7d9-0cda-4f52-84de-e104c238ce5e retains mistralai/mistral-small-3.2-24b-instruct for videos. Riley ID 20ef9407-83f2-4351-8d3c-48cc0ed54e0b previously configured qwen/qwen3-vl-32b-instruct; her effective video route remains the pre-existing Qwen235B alias. Kyla and Dreka settings are preserved.

Existing-content repair is still a separate, unapplied guarded operation. Video work remains out of scope, including four previously known invalid preview sources. No credit charging, tips, bundles, memory or Business connection flags were activated by these changes.
