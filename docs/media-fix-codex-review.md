# Media fix continuation: implementation review

Status: focused code corrections verified locally; automatic catalogue-wide accuracy is NOT established. No production deployment, migration, catalogue update, repair apply, or live payment was performed.

## Exact starting points

| Repository | Existing review branch | Inspected parent |
| --- | --- | --- |
| twin-dashboard | media-repair-batch | 8f23c784bb5a89136d1fd0e7f5e93e39dbb3e314 |
| twin-bot | media-analysis-state | 299cff695422b122e450741c1d0068fcbd8347fe |
| twin-sexbot | v2-media-facts | 87bf00aec4d6c53c5b792d860029ea1c341bbf0a |

These are later than the emailed 746350e / 59e71c3 / 7ee8a3c package. Work already present in these parents includes the preview-bound operator hold list, targeted photo second look, toy alternatives in the V2 menu, video bundle-member facts and the V2 reply grounding guard. This continuation preserves those implementations.

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

The V1 full repository suite and the dashboard full release build were not run locally. The repair Postgres rig was not rerun here because Docker is unavailable; the repair implementation was not changed by this continuation. Older failing local logs from missing snapshot files or the outdated assertion are not final test results.

## Accuracy and release limits

- No new vision-model evaluation was run. OPENROUTER_API_KEY is not configured in this workspace. Existing outputs from earlier commits must not be relabelled as results of this candidate.
- The revised candidate still needs the agreed existing 20-photo evaluation and all 14 Tammy photos, through the real uploader, using the fixed rubric. Record false claims, misses, review status, raw outputs, effective model/provider, cost and latency. Do not expand the dataset or retry until a preferred answer appears.
- Do not apply the old Tammy preview. A fresh preview must be generated from the exact candidate, reviewed against the images and bound by its hash. Apply must use that saved preview and make zero model calls.
- Same-model second-look agreement is not independent evidence. It can still confirm a wrong first answer. False negative facts and non-triggered attributes remain possible. These code checks do not guarantee perfect descriptions.
- Reply grounding covers a defined vocabulary and nearby colour/garment phrases. It does not prove every natural-language claim, pose, action, absence claim or underlying image observation.
- Videos remain outside the first repair batch. The existing new-upload gate does not verify legacy videos or detect every false-negative analysis.
- All 14 pilot dispositions and the model's accuracy must be reassessed on fresh outputs. A four-row manual hold is not a substitute for demonstrating the automatic path works on new uploads.

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
