# V2 photo recovery release — failed live acceptance and rolled back

Recorded 13 October 2026, Australia/Brisbane time. **The bcc68c7 photo-recovery release failed the actual live acceptance conversation and was rolled back at approximately 10:24 AEST.** The earlier release report is historical and must not be read as a current readiness claim.

Seven actual Riley Business-route turns between 10:14 and 10:17 AEST were inspected. All seven had no valid media selection, no selected file and no Telegram photo-send attempt. Text acknowledgements succeeded. The model omitted the required media tag; this was not a rejected photo upload, Telegram card error or price failure.

The shipped change added a regression: two ordinary requests were replaced by the same fixed clarification because groundDelivery rejected unsupported tagless media claims. The missing-card report then received the same fixed question. Meanwhile a new file-availability statement and the known unsupported historical pose still passed without grounding. A matching item existed in the current menu on at least one request; the model described it but never selected it. The later choice-delegation turn also described a current menu item without the tag and escaped validation because the reply/current fan wording did not match the narrow reference patterns.

The first fan request was merged with its following short message by the normal queue. photoRecoveryIntent was null for that turn. An initial code-level suspicion about bare “show me” classification was therefore not its actual cause and is not the incident diagnosis.

The earlier 19 suites and 13 final model checks genuinely passed their tested inputs, but they did not establish reliable behaviour for this real accumulated conversation and its repeated/elliptical requests. This live evidence supersedes the readiness inference. No new prompt patch or replacement implementation was deployed in this response.

Rollback completed through fresh matching handover receipts, drain and financial open-work checks for the **five currently active creators**. Sania had been changed to paused after the release; that newer setting was read and preserved. No Business connections, feature flags, creator profiles or prices were changed.

| Current item | Value |
| --- | --- |
| Running source revision | 45931b6f56db9f97cc8406154e35a0d216f5de65 |
| Running bot/monitor image | sha256:2f076bf6fbc17b4de58a31887e9328a56e0275d90edda39ea789efbd13517d2e |
| Running creators | Mrs Callace, Kyla, Riley, Briana, Fit Sid |
| Paused | Sania, still assigned to V2; not reactivated |
| Source branch rollback record | 61b18f51dc7d272e3676b5c5757f7d8106ebf03f on v2-stage345; a new revert commit with the exact prior source tree, preserving ancestry |
| Failed release preserved in history | bcc68c7e801ad65310f43f4a4ce09f05d3e3b4f7 |
| Live data | Current chats, sent history, purchases, refunds, ownership and logs preserved; no snapshot restore |
| Separate systems | Trashy/V1 and the main dashboard were not deployed or engine-switched |

This rollback removes the new repeated-clarification behaviour; it does **not** fix the pre-existing missing-selection or historical-description problem. No current claim of completed photo recovery is warranted.

Independent read-only verification at **10:25:26 AEST** confirmed both prior images/revisions, all five active runners, unchanged creator settings, matching runtime/monitor prompt policy and the existing Riley/Kyla tester-price scope. [Verification run](https://github.com/jesse98/twin-dashboard/actions/runs/38327143996), job 115068334104, passed. No model call or Telegram send was made.

Evidence:
- [Exact live incident read](https://github.com/jesse98/twin-dashboard/actions/runs/38326741245), job 115067047921.
- [Fresh fleet/settings and rollback compatibility read](https://github.com/jesse98/twin-dashboard/actions/runs/38326836902), job 115067354812.
- [Successful controlled rollback](https://github.com/jesse98/twin-dashboard/actions/runs/38326987463), job 115067841310.
- Private original request records retained at /home/ubuntu/twin-v2/data/_operator_backups/photo-incident-20261013-morning/riley-morning-requests.json; SHA256 43e21019a2c33d1e840c81ec6d683cf7bb6546f68e1de4106db9218b6d3bd253. Full transcripts and creator context remain private.
- The same incident directory holds the pre-rollback chat/settings and deployment configuration for diagnosis, not for restoring older financial/chat state.
- Existing image/code rollback assets remain at /home/ubuntu/twin-v2-backups/photo-recovery-20261013.

The utility workflow was disarmed back to read-only verification after rollback. Any replacement must be checked against these exact live turns, their original prompt/history/menu inputs, successful ordinary sales, current ownership and route rules. Changing the canned response alone would not resolve the missing media selection. The original model configuration, uploader work, scoped tester pricing, separate bulk-recaption work and unfinished videos remain unchanged.

Jesse's standing instructions remain applicable:

> For every Twin V2 recommendation or edit, inspect the current code, relevant prompts and recent changes first. Check how the proposed change interacts with existing behaviour before implementing it.
>
> Make the smallest necessary change. Do not add contradictory instructions, duplicate handlers, competing logic, unnecessary prompt layers or extra AI calls. Update the existing responsible component wherever practical.
>
> Keep the bot’s prompt and displayed prompt consistent with what the code actually does. Preserve previously approved behaviour except where the requested change explicitly modifies it.
>
> Test the affected flow and relevant failure cases. Check data compatibility and rollback when applicable. Explain what changed, what was verified and any remaining uncertainty. Never claim there are no clashes without checking.
>
> Work one agreed stage at a time. These are development instructions; keep them outside the bot’s fan-facing prompt.
>
> Apply these requirements to suggestions as well as implementation. Do not recommend or add a change until you have checked it against existing prompts, code and pending work for contradictions, duplicate logic and failure risks.
