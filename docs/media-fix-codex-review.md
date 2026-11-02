# Media fix continuation: implementation review

Status: focused code corrections verified locally; automatic catalogue-wide accuracy is NOT established. No production deployment, migration, catalogue update, repair apply, or live payment was performed.

## Exact starting points

| Repository | Existing review branch | Inspected parent |
| --- | --- | --- |
| twin-dashboard | media-repair-batch | 8f23c784bb5a89136d1fd0e7f5e93e39dbb3e314 |
| twin-bot | media-analysis-state | 299cff695422b122e450741c1d0068fcbd8347fe |
| twin-sexbot | v2-media-facts | 87bf00aec4d6c53c5b792d860029ea1c341bbf0a |

These are later than the emailed 746350e / 59e71c3 / 7ee8a3c package. Work already present in these parents includes the preview-bound operator hold list, targeted photo second look, toy alternatives in the V2 menu, video bundle-member facts and the V2 reply grounding guard. This continuation preserves those implementations.

## Follow-up: why coherent wrong claims still passed (12 October)

The validator checks structure, known contradictions and selected visibility flags. It cannot establish that mutually consistent prose and flags match image pixels. The narrow same-model second look also misses descriptive errors and may repeat a false positive. This is an analyser limitation, not a missing-file problem.

Two isolated alternatives were evaluated on the same 14 images and the frozen AI reference (no new model or images):

- A broader factual audit of the existing records against 1536px images made 14 real requests, US$0.01304490 reported cost. It marked every description supported, including known wrong details, and disputed some derived labels using a different rubric. Rejected; no audit call or prompt was added to the uploader.
- A concise-description first-pass prompt through the real uploader made 19 real requests, US$0.01416978. It shortened the text but still accepted the disputed through-garment genital claim on 70509013, now with affirmative prose and a confirming second look. Rejected; the primary prompt and image preparation remain unchanged. One run per image is not proof of comparative accuracy; providers were not pinned.

The focused correction is a shared visibility exception: a positive genital claim with a worn lower garment, or a claim of visibility through fabric, requires review even when the prose and second answer agree. Original observations remain intact for review. The rule does not assert that all fabric conceals anatomy, does not hold every nude/lingerie photo, and adds no AI call. It can also hold a genuinely visible through-fabric feature; that is an explicit trade-off for this unresolved class, not evidence of a corrected vision model.

The same check runs when building repair proposals and when binding an already-saved proposal before a write. An old accepted preview cannot bypass this new exception. Status-only holds remain valid; prices, file identities, ownership, existing legacy records and rollback writing logic are unchanged. Old previews remain unapproved.

Verification: new classification assertion failed with analysed before the guard. Five affected dashboard suites pass, including uploader tests with coherent prose plus a repeated yes, no caption call on held items, a saved legacy proposal refused before writing, and an allowed status-only hold. Changed-module TypeScript passes. Both recorded 14-photo runs were replayed through the final validator, actual row mapper and V2 menu with identical prepared bytes/prompts for their respective experiments: 200 assertions, zero network calls. Each ends 10 analysed / 4 needs_review. The concise prompt remains rejected despite this recorded-response regression test.

**Release decision: automatic description accuracy remains unresolved.** Ten analysed rows do not mean ten fully correct descriptions. Previously recorded object, pose/action, colour and location errors are not fixed by the new visibility exception. No blanket manual-review replacement is proposed, no perfect-accuracy claim is made, and no production deployment or catalogue write was performed. Videos remain outside the first repair batch. The PostgreSQL repair crash/rollback rig was not rerun here; its writing code is unchanged, and only the new pure validation gates were exercised. This is a focused review-branch correction, not approval to roll out bulk repair.

## Corrections

1. Dashboard: made first-pass, tag and second-look visibility instructions agree. Actual anatomy discernible through transparent fabric follows the same rule in each instruction. An inserted object alone is not proof that an opening is visible. This removes contradictory instructions; it does not prove improved model accuracy. Existing call limits, model choice, analysis schema/version and price logic are unchanged.
2. V1: legacy bundle short descriptions pass through the existing fact validation used for individual items. A stale short description cannot reintroduce an attribute denied by the item evidence. Covered photo and video members, with and without a catalogue row.
3. V1: commercial availability facts exclude pending/failed/needs_review individual items and incomplete bundles. Previously a generic availability claim could pass even though the item's evidence was withheld. Historical receipt handling is unchanged.
4. V2: strengthened the existing reply guard. A bra cannot prove a thong, heels cannot prove boots, and a colour in the background cannot prove that colour on the selected garment. Search aliases cannot manufacture an exact garment. Broad descriptions can still be supported by appropriate specific evidence. No additional conversation call.
5. V1 test compatibility: updated an existing inventory-read assertion for the analysisStatus/visualFacts fields already returned by the upstream mapper, and checked that a needs_review state survives the adapter. The old assertion was reproduced failing on the unchanged upstream source before this test correction.

## Verification

| Component | Result | What was exercised |
| --- | --- | --- |
| V2 | All 17 package test scripts pass: 2,407 checks; TypeScript passes | Includes 324 toy-menu, 73 reply-grounding and 389 delivery checks |
| Dashboard | Classification, correction, upload-resilience, config/pricing-safety and analysis suites pass; changed-module TypeScript check passes | Real analysis functions with mocked model answers; image/video preparation; status/timeout/failure paths |
| V1 | Nine affected suites pass; TypeScript passes on the downloaded source graph | Bundle members 28, correction 139, inventory/receipt reads 152, scripted commercial flow 88/88; analysis state, bundle readiness, named-medium receipts and invitation guards |
| New V2 delivery cases | 4 combinations pass | Ordinary/Business x free/paid, actual turn and delivery code with simulated Telegram/storage/model; correct message, selected file, price, payload, history and one conversation call |

Before/after evidence: 10 newly exposed grounding failures before the fix; 4 stale bundle-description failures; 6 held-item availability failures; contradictory prompt contract assertion failed before correction. Additional positive controls remain green.

The V2 package scripts were invoked with `node --import tsx` because this environment blocks the tsx CLI's IPC socket. This changes the launcher, not the test scripts. The isolated local checkouts were populated from the exact upstream commits; no production environment file or database credential was loaded.

The V1 full repository suite and the dashboard full release build were not run locally. GitHub CI subsequently completed the dashboard build, typecheck and behavioural checks successfully at 817e01f. V1 CI at 4c35e52 passed typecheck and 333 of 334 suites; the remaining ordinary-invitation test failed its four-second latency assertion. That unchanged test passes locally, so CI is not reported green and no runtime change was made for it. The repair Postgres rig was not rerun here because Docker is unavailable; the repair implementation was not changed by this continuation. Older failing local logs from missing snapshot files or the outdated assertion are not final test results.

## Accuracy and release limits

- OpenRouter access was subsequently supplied and verified. The factual vision path has now run once on all 14 saved Tammy originals at 817e01fed7b3866f0409924e6bbfe1877f5e58e6: 19 HTTP requests, US$0.01036036 reported cost, 11 analysed / 3 needs_review. The reference rubric and image hashes were frozen before outputs. References are AI-reviewed, not independently person-verified. Providers actually reported were DeepInfra, Parasail and Venice; this used the existing uploader transport without introducing provider pinning.
- The original 20-photo inputs are unavailable. On 12 October the owner authorised continuing with the 14 retained Tammy originals, without waiting for those files. The attached 40-item PDF is the older report with small thumbnails, not equivalent original evaluation inputs. No claim is made that the original 20-photo test was repeated.
- Do not apply the old Tammy preview. A fresh preview must be generated from the exact candidate, reviewed against the images and bound by its hash. Apply must use that saved preview and make zero model calls.
- Same-model second-look agreement is not independent evidence. It can still confirm a wrong first answer. False negative facts and non-triggered attributes remain possible. These code checks do not guarantee perfect descriptions.
- Reply grounding covers a defined vocabulary and nearby colour/garment phrases. It does not prove every natural-language claim, pose, action, absence claim or underlying image observation.
- Videos remain outside the first repair batch. The existing new-upload gate does not verify legacy videos or detect every false-negative analysis.
- The fresh 14-photo outputs still contained an unsupported genital flag on a sheer-clothing item (70509013), despite same-model second-look agreement. The validation now sends a genital=yes observation to needs_review when its original factual prose never affirmatively names the anatomy. This extends the existing internal-consistency check, without claiming it verifies pixels. It is not keyed to an image ID and adds no model call.
- All recorded responses were replayed, with byte-identical prompts and prepared-image hashes, through the final validation and actual row/menu code: 100 assertions pass, zero network calls, 10 analysed / 4 needs_review. Only the unsupported row changes status. Raw observations remain preserved. The five affected dashboard suites and changed-module typecheck pass; 389 V2 delivery checks pass. Two positive test fixtures were made explicitly factual so their existing pricing/second-look checks retain their purpose.
- This is a factual-vision evaluation and recorded-response replay, not a fresh full production upload or repair apply. Promotional-caption generation was deliberately excluded using the existing writeCaption seam (caption=null). No live Telegram, database or storage service was used. The four automatic holds are not a claim that the other ten outputs are perfectly described: remaining object/colour, pose/angle and location details still need review. The model can give mutually consistent wrong prose and flags; this new guard cannot catch that class. No production-ready pilot preview or bulk repair is approved.

## Review and rollout

Changes are on separate review branches and draft PRs targeting Claude's existing work branches, not main. No live deployment was requested or performed. The existing production deployment, migration and guarded repair sequence remains paused. After the bounded real-model evaluation and review of the combined candidate, use the existing backup/preview/hold/apply/rollback path and the existing verified bot drain.

Any later integration must inspect intervening changes and rerun only the affected gates. Preserve prices, file identities, creator ownership, purchases, single conversation-call behaviour and Stages 1–5.

## Development requirements

For every Twin V2 recommendation or edit, inspect the current code, relevant prompts and recent changes first. Check how the proposed change interacts with existing behaviour before implementing it.

Make the smallest necessary change. Do not add contradictory instructions, duplicate handlers, competing logic, unnecessary prompt layers or extra AI calls. Update the existing responsible component wherever practical.

Keep the bot's prompt and displayed prompt consistent with what the code actually does. Preserve previously approved behaviour except where the requested change explicitly modifies it.

Test the affected flow and relevant failure cases. Check data compatibility and rollback when applicable. Explain what changed, what was verified and any remaining uncertainty. Never claim there are no clashes without checking.

Work one agreed stage at a time. These are development instructions; keep them outside the bot's fan-facing prompt.

Apply these requirements to suggestions as well as implementation. Do not recommend or add a change until you have checked it against existing prompts, code and pending work for contradictions, duplicate logic and failure risks.
