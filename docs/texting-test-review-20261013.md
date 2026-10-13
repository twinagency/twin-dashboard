# Texting test review — shared Twin V2

13 October 2026, Brisbane time. Read-only review completed against source `2f24f023c0cf46bea1c3b3b334458cf1a5df265e`; product branch head remains documentation commit `2b59d900bd61fbcd335228f2032c6548b37535a1`.

## Status

The earlier five-issue release is deployed. **The overall photo/reply flow is not fully repaired.** The uploaded PDF exposed further failures, and later existing tester traffic confirms several on the deployed version. This stage performed diagnosis only: no product code/prompt edits, deployment, model calls, Telegram calls, purchases or application/database writes.

The original release evidence (23 offline suites plus TypeScript; final 39/39 model cases) remains valid for those cases. It does not establish that the newly observed follow-up cases pass.

## What the uploaded PDF establishes

The run `20261013-163634-s909359292` spans 16:36–16:45. It overlaps the first deployment, rollback at 16:37, and final rollout completed at 16:43:51.

All 48 V2 replies shown in the PDF were matched by tester, timestamp, fan text and reply. Their saved system prompts identify 42 with the preceding wording and six with the repaired wording. Three of those six are from the brief first attempt; the other three are Kyla's last three replies after the final rollout. Prompt wording is a fingerprint, not a per-turn commit receipt.

- Dakota's old mechanical prefix was sent at 16:38:05, during rollback. It was a hardcoded fan-facing caption, not private model reasoning. The current constant is different.
- Seven creators each sent three different catalogue keys/cards. Their follow-up sends were on the preceding version. These were distinct acknowledged media actions, not a rendering duplication in the PDF.
- The report's Dakota “NO REPLY” table label conflicts with its own four replies. Four other creators are the reported nonresponders.
- The PDF's 58/300 figure is an incomplete test; its stated message-bank limit is not a bot failure.
- Its “screens” are reconstructed chat logs and placeholders, not opened photos or phone screenshots.

## Failures confirmed after the final rollout

The read-only follow-up observed existing tester traffic at 17:17–17:32. New-prompt fingerprints and the pinned running source/image were checked. These are later observations, not relabelled PDF results. Examples and bounded excerpts are saved in [the evidence JSON](texting-test-review-evidence.json).

| Finding | Concrete evidence | Current source interaction |
|---|---|---|
| Questions about an existing card produce another card | Riley at 17:21 and 17:27; Tamara at 17:22; Kyla at 17:22. New catalogue keys were selected and Telegram acknowledged attachments. | The template requires selecting a listed file when describing/inviting an unlock, while the menu excludes offered files. Existing-card discussion is not separately represented as a text-only continuation. |
| Replies imply an unchanged offer although a different catalogue item was sent | Sid selected `photo:e59206b6-a027-44a9-9659-a5d2b2c886ed` at 17:25:53, then called it “the same pool one” at 17:26:49. The earlier pool offer was `photo:6727a05a-1477-48de-b6f4-498500f3783e`. | The existing exact-resend path was not used. Bounded vocabulary grounding does not establish exact-file identity. This confirms different catalogue identities; the actual images were not opened to compare pixels. |
| Alternative wording appears on conversational follow-ups | Cat at 17:26:28 received “here's a different option.” after a request to describe what she was imagining. Sid received it while discussing Friday plans. | Replacing “different” in tokenization fixed that specific repro; alternative classification still uses words from non-photo conversation. This is a code-generated prefix, not hidden reasoning. |
| An unsolicited free preview still occurs | Riley's 17:18:46 “are you real?” turn selected and sent a free photo. | The prompt says free previews require a request, but the ordinary selection contract still permits a free item. |
| Item prices are still quoted in model prose | Kyla said “150 stars” at 17:22; Tamara and Mrs Callace also quoted item prices. | The shared prompt prohibits item-price claims. The delivery amount remains controlled by code; these observations do not establish what someone paid. The original five-Star tester scopes are still in the unchanged pricing component. Do not infer a purchase or change prices to match model prose. |

These examples establish remaining behaviour failures; they do not establish that every reply or creator fails. No new real-model replay was commissioned during this review.

## Findings that need separate evidence

**No replies:** the four named V2 processes were running with cached Business connections during the observation, but there was no matching processed request row for the PDF's four unanswered inputs. Alanna and Tru had acknowledged replies just before the run. Tamara and Tru have later tester replies on the repaired version; Alanna and Zoey do not in the observed tester window. Process health and cached connections do not establish that Telegram delivered those particular incoming updates to the correct handler. The runner discards queued-but-not-started batches during handover; the overlap makes that a candidate, not a proven explanation. Raw incoming Telegram message IDs/timestamps and route evidence are needed before changing routing or handover behaviour. The Business handler does not gate replies on a Supabase “user row”; adding one blindly is not a justified fix.

**Returning-fan greetings:** short histories and reset epochs are visible. Persistent memory is disabled in the current creator settings. The standing session also records a separate request to clear this tester's history before this run, but this review did not retrieve the reset operation's receipt. The PDF alone therefore does not prove an unintended memory regression. Do not enable memory, restore deleted history or add a returning-fan note without resolving that reset context.

**Autumn:** current and deployment-baseline settings put Autumn on the live/V1 engine. Her voice/format issues are not evidence that the shared V2 repair was applied incorrectly. This review made no V1 changes.

**Fleet changes:** at 17:32, 17 active V2 runners were observed, including Sania, whose activation occurred separately after the earlier 16-creator release check. This review preserved that assignment and all settings.

**Monitor:** the separately documented dashboard HTTP timeout remains unresolved; this review did not change or retest its implementation.

## Smallest justified next implementation stage

Review and repair existing-offer follow-ups in the current turn/menu/grounding/template components, with one existing model call and the existing delivery authority:

1. Save the exact later failing histories, menus, asset identities and receipts as regression fixtures before modifying behaviour. Retain failed outcomes.
2. Distinguish discussion/price questions about an acknowledged offer from a new offer or explicit resend. Use the existing scoped recorded photo context for truthful text-only discussion; do not silently select a replacement after `none`.
3. Remove the prompt/selection conflict at its responsible component. Keep explicit “another/different/new photo” selection, genuine spontaneous offers where approved, refusals, exact resends and unlocked owned resends intact.
4. Apply alternative disclosure only to a genuine visual request that the chosen file does not satisfy. Preserve honest disclosure for real alternatives; do not merely replace the prefix again.
5. Align the same selection contract with the existing free-preview policy, and extend bounded reply checks for the demonstrated identity/price claims without filtering unrelated conversation.
6. Verify the new cases plus affected photo/resend/ownership/price/cleanup and route regressions. Confirm rendered/displayed prompts still match. Record isolated implementation, tests, model replay and any eventual deployment separately.

Do not combine this with V1 rewrites, creator migration, memory activation, video expansion, bulk recaptioning or an unverified routing fix. No production replacement was prepared or made during this review.

## Inspection and evidence limits

- Inspected current media, turn, grounding, template, runner and memory source; local Git blob hashes match the current full remote tree for all six.
- Rechecked the open PR #1 diff. Its garment/colour work overlaps the existing grounding component; it is not an offer-continuation fix and should not be layered in again.
- Rechecked runtime image/source: both bot and dashboard remain `sha256:dff48242b35b94e7b0e757ee4b7778a11958ef85b231b5fdb369542902e325f9`, source `2f24f023...`.
- [PDF-window correlation](https://github.com/jesse98/twin-dashboard/actions/runs/38362581913): complete.
- [Broadened follow-up](https://github.com/jesse98/twin-dashboard/actions/runs/38362881534): SSM truncated stdout; 12 complete creator objects were recovered locally. The original result is retained and is not described as a complete observation.
- [Narrower bounded follow-up](https://github.com/jesse98/twin-dashboard/actions/runs/38363250663): complete, with an explicit per-creator example limit and output-size guard.
- Excerpts are bounded and turn IDs are eight-character prefixes; full source request records remain in creator logs. Later examples are samples, not an exhaustive audit.
- Telegram acknowledgments are not proof that the fan opened or could see the attachment. No purchases were made.

## Jesse's standing instructions — retain verbatim in every handoff

For every Twin V2 recommendation or edit, inspect the current code, relevant prompts and recent changes first. Check how the proposed change interacts with existing behaviour before implementing it.

Make the smallest necessary change. Do not add contradictory instructions, duplicate handlers, competing logic, unnecessary prompt layers or extra AI calls. Update the existing responsible component wherever practical.

Keep the bot’s prompt and displayed prompt consistent with what the code actually does. Preserve previously approved behaviour except where the requested change explicitly modifies it.

Test the affected flow and relevant failure cases. Check data compatibility and rollback when applicable. Explain what changed, what was verified and any remaining uncertainty. Never claim there are no clashes without checking.

Work one agreed stage at a time. These are development instructions; keep them outside the bot’s fan-facing prompt.

Apply these requirements to suggestions as well as implementation. Do not recommend or add a change until you have checked it against existing prompts, code and pending work for contradictions, duplicate logic and failure risks.
