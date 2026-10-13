# Remaining creator V2 migration — 13 October 2026

Jesse requested migration of every remaining creator to V2. Eleven of fourteen were migrated through the current production monitor; three remain on V1 because their recorded date of birth is absent and the deployed V2 validator requires a YYYY-MM-DD value. No birth date was fabricated and the shared renderer/validator was not changed.

## Result at 15:21:58 Brisbane

| Creator | Engine | Bot runtime | Photos | Videos |
|---|---|---|---:|---:|
| Alanna Pow | V2 | Running | 404 | 193 |
| Allison Parker | V2 | Running | 0 | 0 |
| Cat | V2 | Running | 24 | 17 |
| Dakota Lyn | V2 | Running | 247 | 113 |
| Dreka Cakez | V2 | Running | 17 | 2 |
| Olivia Jade | V2 | Running | 36 | 17 |
| Tamara | V2 | Running | 14 | 8 |
| Toochi | V2 | Running | 16 | 18 |
| trashy | V2 | Running | 209 | 114 |
| Tru Kait | V2 | Running | 9 | 22 |
| Zoey Foxx | V2 | Running | 28 | 22 |

The V2 fleet has 16 running creators. Sania Mallory is assigned to V2 but remains paused. Autumn Renae, Dan Dangler and Hazey Haley remain active on V1 with their original settings. Their stored creator rows and associated onboarding records did not supply a usable birth date.

Dreka's bot token is valid and her V2 runner is running, but neither saved historical Telegram Business connection yielded an enabled connection with reply rights during preflight. The ten other migrated creators each had an enabled connection whose owner username matched their configured creator account. No Telegram connection was modified. Allison's current catalogue already contained zero eligible photos/videos; this migration did not remove content.

## Change and verification

Only clones.engine and clones.v2_vars changed for the eleven targets. Their 26-variable profiles were prepared with the existing V1 mapper, completed from recorded creator fields, and validated using the actual deployed renderer. Unknown descriptive fields remain explicitly unspecified. Recorded creator boundaries were carried into the existing boundary variable. Conflicting V1 formatting instructions were omitted in favor of the already-approved V2 shared style. Existing dates, time zones and source facts were retained. The shared prompt, bot code, transport, selection and model-call logic were not edited.

The existing monitor saved the profiles and performed the engine switches. The fleet's existing per-creator handover hold prevented V2 startup until V1 emitted each verified polling-stop/drain receipt. All eleven V1 receipts were recorded between 05:20:01 and 05:20:16 UTC. V2 started all eleven between 05:20:46 and 05:20:47 UTC. Current runtime state, stored profile hashes, displayed prompt rendering and applied credit/tip/memory settings were verified. Every unrelated creator field and every untargeted creator row matched the before snapshot.

Existing tip settings were preserved, including enabled tips; credit and memory settings were preserved. V2 bundles remain disabled by the unchanged runtime environment. Media rows/prices, transactions, purchased ownership, fan rows and existing chat files were not edited or restored. No operator test message, model request, purchase or refund was initiated. One natural Alanna turn was observed after activation; this is not end-to-end verification of every creator's chat/media/payment flow.

Both V2 containers retained image sha256:9649329a00bd20fe06499f8238e1e51713381521af00d4cdc67505e1064f724a and revision 86b0ad199ea33fd7855f1c0dd54cc355f706e7f5. Neither restarted or reported an OOM. The independent final check found no remaining handover requests and no operator lock. The existing photo incident remains a separate task; migration does not establish its resolution.

## Evidence and rollback

- Readiness: Actions run 38350274939, job 115140853447.
- Activation and complete verification: run 38350802395, job 115142515094; operation commit 408550fa6312cca0bd94085b186f2a21f40a8600.
- Independent read-only check: run 38350963141, job 115143098182.
- The operation entry was replaced with read-only verification at 63be28253230ab4a5d5629f29aec791fa0626979. Later pushes cannot rerun activation.
- Private settings, prepared profiles, connection summary, handover receipts and result are on the shared V2 data mount under /app/data/_operator_backups/remaining-creators-v2-20261013/.

Rollback must use the existing monitor engine control and its verified V2 drain. For creators whose preserved tips are enabled, use the existing settings controls to stop new offers and verify financial work before any rollback. The engine guard also requires message credits off and no reserved credit work. Restore only this operation's creator settings after checking for newer edits. Preserve all current chat, ownership, payment and refund data; never restore old financial/chat snapshots.

## Jesse's standing development requirements

For every Twin V2 recommendation or edit, inspect the current code, relevant prompts and recent changes first. Check how the proposed change interacts with existing behaviour before implementing it.

Make the smallest necessary change. Do not add contradictory instructions, duplicate handlers, competing logic, unnecessary prompt layers or extra AI calls. Update the existing responsible component wherever practical.

Keep the bot's prompt and displayed prompt consistent with what the code actually does. Preserve previously approved behaviour except where the requested change explicitly modifies it.

Test the affected flow and relevant failure cases. Check data compatibility and rollback when applicable. Explain what changed, what was verified and any remaining uncertainty. Never claim there are no clashes without checking.

Work one agreed stage at a time. These are development instructions; keep them outside the bot's fan-facing prompt.

Apply these requirements to suggestions as well as implementation. Do not recommend or add a change until you have checked it against existing prompts, code and pending work for contradictions, duplicate logic and failure risks.
