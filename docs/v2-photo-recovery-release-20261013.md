# V2 photo recovery — deployed 13 October 2026

Release recorded for Jesse in Australia/Brisbane time. The shared fix was deployed successfully at approximately **01:02 AEST on 13 October 2026** (15:02 UTC on 12 October). Independent read-only verification completed at **01:07:49 AEST**. This supersedes the earlier candidate document's access-blocked/not-deployed status; that document remains a historical record.

**Live code and scope**

| Item | Verified value |
| --- | --- |
| Repository and release branch | jesse98/twin-sexbot, v2-stage345 |
| Exact deployed commit | bcc68c7e801ad65310f43f4a4ce09f05d3e3b4f7 |
| Exact image | sha256:22f6bb3bee3cb5f0956826aeff33784ae511bc8db8e0fe92000499c8c0e25729 |
| Bot and monitor | twin-v2-bot-1 and twin-v2-dash-1, both running the same verified image and revision |
| Host | i-0584d283506f3f6be, /home/ubuntu/twin-v2 |
| Actual rollout | Shared image for Mrs Callace, Sania, Kyla, Riley, Briana and Fit Sid |
| Source verification | 123 release-runtime files checked against pinned Git blob hashes |
| PR | [twin-sexbot #3](https://github.com/jesse98/twin-sexbot/pull/3), merged by fast-forward to the exact tested commit |
| Live Telegram recovery observation | Pending a user-initiated controlled test; no post-release Riley/Kyla tester turns were present at the independent check |

This was a fleet-wide shared-code release, not a per-creator canary. The prior release branch was 45931b6f56db9f97cc8406154e35a0d216f5de65. The candidate preserved that release, its scoped prices and newer dashboard-history behaviour. The refreshed comparison with master was 98 ahead/zero behind. No default branch, V1 code or separate main dashboard was overwritten or deployed.

Mrs Callace's earlier engine migration was already completed and remains live. Her bot is @mrscallacepayments_bot. The current check confirmed a working enabled Business connection with reply permission for Mrs Callace, Riley and Kyla. Mrs Callace also has an older disabled connection; it was not changed or used as evidence of present availability. No connection was switched. Trashy was freshly confirmed active with engine=live (V1), and remains outside this V2 release.

**Cause and changes**

The retained Riley incident contained no valid media selection and no media-send attempt. The model nevertheless claimed a card existed and later refused to resend it. That was not a Telegram rejection or a five-Star pricing failure. An older card receipt existed, but could not establish current visibility, ownership or the unsupported pose asserted in conversation.

The fix updates existing responsibilities:

- memory.ts stores an optional, versioned, bounded photo context with stable creator/key/storage identity, epoch/route and distinct intended/acknowledged/failed/unknown states. Generated wording is not a receipt or purchase record.
- turn.ts/media.ts resolve a deliberate same-photo continuation or explicit resend through the existing selection path. Unsolicited duplicate protection remains. No tag still means no new attachment unless code has independently resolved the user's explicit same-photo action. Ambiguous references clarify instead of guessing; a stale menu slot, copied note or arbitrary most-recent photo is not authority.
- deliver.ts/runner.ts/payments.ts re-read the current exact creator-owned photo and reconcile fresh shared/local ownership at the final dispatch boundary. Deleted, held, changed or inaccessible content fails closed. Confirmed owned content is free; confirmed unowned paid content uses the existing scoped price resolver; uncertain ownership authorises neither a chargeable card nor a free release. Empty successful catalogue refreshes clear stale items.
- Existing acknowledged/rejected/preparation-failed/unknown/cancelled outcomes and the narrowly allowed stale cached-reference retry are retained. A timeout or failed bookkeeping write cannot silently cause a second send. Recovery intent is saved before dispatch and acknowledgement is recorded only after delivery evidence.
- grounding.ts now covers the known material pose/action gap and unsupported delivery, visibility, unlock and ownership claims, including a resolved previous photo without a new attachment. Unsupported capture-time claims are removed. An unsupported requested pose cannot be hidden by sending a different paid file with an empty caption.
- The existing shared template paragraphs, displayed prompt and operator wording were reconciled. The contradictory absolute never-resend and perpetual-visibility assumptions were removed. Creator voice, route-dependent age handling, normal offers and optional feature sections remain. Fixed recovery text remains non-billable.

No uploader change, vision call, extra conversation-generation path, second resend handler, financial ledger or database schema migration was introduced. Old chats without the optional context load safely. Reset invalidates references without erasing ownership; prepared or unknown attempts are not automatically replayed after restart.

**Verification and retained failures**

The final exact image passed all 19 established offline suites plus typecheck:

safety; media; photo-flow; media-facts; media-correction; media-toy-menu; reply-grounding; photo-recovery; turn; payments; bundles; delivery; credits; tips; tips-wiring; archive; memory; memory-wiring; dashboard-history.

The recovery suite contains 44 scenarios, including the original five frozen responses on both ordinary and Business routes. The existing delivery suite includes 445 checks. Coverage includes valid sales and same-file resends; paid/free/owned handling; ambiguity; malformed/no tags and failed model output; ownership/refund races; held/deleted/changed/cross-creator items; ordinary/Business routing; download/Telegram failures and uncertain outcomes; limited cached-reference retries; persistence failures; reset/queue/route/epoch changes; feature interactions; and old-state compatibility.

Thirteen bounded **real conversation-model** checks passed on the final exact image: ordinary and Business offers/resends, owned and held recovery, ambiguous reference, absent material pose, and the five retained incident fan requests. Each used one conversation request and DeepInfra answered each one.

These checks used the actual production creator variables, shared renderer, queue, turn, delivery and saved-state code. Telegram transport, storage and ownership responses in this harness were simulated. Input entered at the real queue, not through a live incoming Telegram update. They are not proof of a fan-visible delivered card. Optional database-rig credit/tip/archive suites were not run and are not claimed to have passed.

Earlier bounded candidates exposed two real problems: tagless photo description/omitted selection, then an unsupported claim about when the photo was taken. Both were retained as failing evidence and added to deterministic regressions. The existing responsible template/grounding components were corrected before the final candidate. Assertions and original image facts were not changed to make failures pass. There were three sets of 13 model requests across meaningfully changed candidates, not repeated sampling of an unchanged candidate until green.

Manual review of final model output found no known wrong-file, false-delivery, unsupported pose or capture-time claim passing the checked path. One valid Business offer delivered the correct requested card without a caption after unsupported wording was removed; that was not a substitution for an unsupported requested file.

Separate real, read-only production checks confirmed all 1,007 current photo paths were creator-scoped, exact target refresh worked for all six creators, and forced fresh shared ownership reads succeeded for the approved Riley/Kyla tester. Local ledgers were copied into an isolated temporary cache for these checks, not modified. Price-scope checks passed. Current render/parts/preview were compared for all six profiles; the independent post-deployment check also compared the actual running monitor's photo-policy display with the deployed renderer.

Both live containers, all six fresh runner start times, fleet health, feature settings and runtime source identity passed after a verified drain. No fan messages were sent, Stars spent or financial data restored.

**Models, prices and preserved scope**

The conversation model remains deepseek/deepseek-v4.1-flash, provider order deepinfra/fp8 then together, with provider fallbacks disabled. All final bounded requests were answered by DeepInfra. The existing one-generation path and its existing error/empty retry remain; no classifier/verifier/repair completion was added.

Riley/Kyla keep the accepted qwen/qwen3.8-27b photo analysis via DeepInfra only: xhigh reasoning excluded, temperature 0, JSON, 16,384 completion tokens, factual instructions before the image, 768px JPEG at quality 80. Existing correction/second look and timeout budgets are untouched. No new vision call was made in this incident release. Mrs Callace's engine move preserved her previous qwen/qwen3-vl-32b-instruct vision setting; it did not silently extend the Qwen3.8 photo rollout. Other creators' photo/video routing remains unchanged.

The earlier uploader coverage rule is preserved: explicit out_of_frame uncertainty can leave an attribute unknown while allowing unrelated confirmed content; missing reasons remain conservative, and ambiguous visibility/contradictions/unsupported claims remain held. Unknowns do not support exact tags or claims. Existing thong, transparent-fabric, covered-feature, paint, mirror, toy-specificity and negation rules remain covered by regressions. Held items remain excluded individually and through bundles.

Only the previously approved immutable tester ID receives five-Star individual paid photos for Riley/Kyla and Trashy's unchanged V1 path. Other fans/creators retain normal prices; free or owned files remain free. Mrs Callace has no new five-Star override. Videos, bundles, tips and credits are not repriced. Previously issued cards retain their historical price.

Credits, tips, bundles and memory remain off for the six V2 creators. Existing-content repair/bulk recaption remains unapplied and separate. Videos remain unfinished, including the earlier four invalid video sources; this fix does not complete video work. The earlier real dashboard uploader staging test remains evidence for that earlier uploader release, not a new V2 delivery test.

**Rollback and operational evidence**

Rollback baseline is commit 45931b6f56db9f97cc8406154e35a0d216f5de65 and image sha256:2f076bf6fbc17b4de58a31887e9328a56e0275d90edda39ea789efbd13517d2e.

Current backup: /home/ubuntu/twin-v2-backups/photo-recovery-20261013. It contains saved image, code/config archive, original compose/override, fleet settings snapshot, source manifest, test evidence, verified drain/deployment result and post-release check. Current source is /home/ubuntu/twin-v2-photo-recovery-releases/bcc68c7e801ad65310f43f4a4ce09f05d3e3b4f7. Runtime override: /home/ubuntu/twin-v2/photo-release.override.json.

Prepared rollback command on the host:

`python3 /home/ubuntu/twin-v2-backups/photo-recovery-20261013/deploy.py --rollback`

Rollback first requires a fresh verified fleet drain and open-work checks. It restores code/image/config only, preserving current data, logs, chats, payments, refunds and ownership. It must not restore older financial/chat snapshots or the older pre-pricing image. Old code may ignore the additive nonfinancial photo context; returning to the candidate does not auto-send it. A rollback was prepared, not executed.

The deployment utility was changed back to read-only immediately after release; future utility pushes do not redeploy this candidate.

- [Final pinned image, 19 suites, typecheck, real-model and production-read gates](https://github.com/jesse98/twin-dashboard/actions/runs/38266591004), job 114870201229.
- [Successful drain and deployment](https://github.com/jesse98/twin-dashboard/actions/runs/38267161079), job 114872085354.
- [Independent live runtime, monitor and Telegram connection checks](https://github.com/jesse98/twin-dashboard/actions/runs/38267935900), job 114874745083.
- Private retained model/state evidence is under /home/ubuntu/twin-v2/data/_operator_backups/photo-recovery-20261013 and the release backup. Credentials and full private transcripts are not included in this report, PR or runtime image.

**Remaining limits and next controlled check**

Grounding is bounded deterministic claim checking, not universal semantic proof. Saved factual errors and unmodelled paraphrases remain possible. Stable row plus creator-scoped path is not a byte-hash guarantee against an out-of-band overwrite of that object. Fresh checks do not create a distributed transaction across Supabase, Telegram and incoming purchases. The concrete checked races fail closed; these broader limits are not a claim of zero risk.

At 01:07:49 AEST there were no post-release tester turns for Riley or Kyla. Jesse can initiate a normal photo request with Riley and then explicitly ask for that same photo again. Observe exact selection, card, truthful caption, receipt and saved context; card appearance can be checked without purchasing it. Follow with Kyla as appropriate. Do not send unsolicited test messages, spend Stars or switch connections. A missing or ambiguous pre-upgrade reference may correctly ask which photo instead of guessing the old pink file.

Accurate completion status: **implementation, image verification, bounded model checks, deployment and independent runtime verification complete; user-visible controlled Telegram recovery remains unobserved**.

**Jesse's standing instructions — retain verbatim in subsequent handoffs**

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
