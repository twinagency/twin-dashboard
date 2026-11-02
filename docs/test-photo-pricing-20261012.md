# Scoped photo test pricing — 12 October 2026

Authorisation: Jesse requested paid individual photos at 5 Telegram Stars only for @rcy07 with Kyla, Riley and Trashy. The immutable Telegram user ID 6814483810 was independently matched to all three production user records. No username-based authorisation or catalogue-wide repricing is used.

| Creator | Clone ID | Current engine |
| --- | --- | --- |
| Kyla | d2678dce-6a4e-4f1c-b54a-86057bba427c | V2 |
| Riley | 20ef9407-83f2-4351-8d3c-48cc0ed54e0b | V2 |
| Trashy | 3484f7d9-0cda-4f52-84de-e104c238ce5e | V1 |

The temporary operator configuration is `src/test-photo-pricing.ts` in both bots. Only the exact creator + Telegram user ID + photo kind matches. Paid photo offers use 5; free and owned-file handling stays in the existing delivery path. Video, bundle, credit and tip prices are unchanged. Existing Telegram cards retain their immutable quoted prices. Catalogue rows, financial history, user test flags, prompts and stage activation flags were not changed. All three creators have sell_via_mini_app=false; this is the Telegram bot photo path, not a Mini App discount.

V2 changes the existing paid-media resolver with explicit creator/fan/type context. V1 changes the existing quote and settlement component, makes the photo base price consistent, and updates its configured-price guard. The test override does not consume a pending one-use discount. No conversation-model call or fan-facing prompt was added.

Status: live for Kyla, Riley and Trashy. Independent deployed-container checks completed 10:35:48–10:36:03 UTC / 20:35:48–20:36:03 AEST. Run [38237274046](https://github.com/jesse98/twin-dashboard/actions/runs/38237274046) passed. Both exact deployed price resolvers returned 5 for Telegram ID 6814483810 across all three creator IDs, preserved the other-account baseline and left non-photo types unchanged. V2's default mode remains real. Read-only Telegram getBusinessConnection confirmed all three enabled with reply permission; no connection was changed.

## Verification

- V2 local typecheck, 61 payment checks and 443 delivery checks pass. The latter includes 54 checks for test pricing in ordinary and Business routing, free photos, a different fan, recorded price and the single conversation-model call.
- V1 local typecheck and 139 durable offer integration checks pass. These drive mediaFlow, the durable receipt and TelegramMessenger with simulated transport; the new scope tests cover the three IDs, ordinary and Business routing, another fan's normal discount and preserving the tester's pending discount.
- V1 full CI at caa2a94ee519eb84d25b6c77023f732e8fed7b36: all 334 offline suites pass; four separate Supabase-backed suites are skipped by the established CI gate (run 38234816174).
- V2 exact image: all 18 existing suites plus typecheck pass without network, including ownership/refunds, holds, bundles, credits, tips, archive, memory and 90-message operator history.
- No Telegram messages or Stars purchases were made for this release. Telegram transport and model responses in delivery tests are simulated.
- V2 runtime verified at 10:18:30 UTC: default price mode remains real; approved account resolves to 5 and another account retains its ordinary price. This is an independent read-only check in the deployed container (run 38235470242).

## Deployment and rollback

V2 deployed 10:17:33 UTC / 20:17:33 AEST: commit 45931b6f56db9f97cc8406154e35a0d216f5de65, image sha256:2f076bf6fbc17b4de58a31887e9328a56e0275d90edda39ea789efbd13517d2e. Both bot and dashboard use this image. Verified handover completed; all five existing fleet entries returned to running. 119 shipped source/test files were checked against Git blob hashes. Release run 38235157749.

V2 rollback: previous commit ef040a757627bb5813b4f19ac47af2c1f373506c, image sha256:77b0e687db21388334749d7fbf6ceeb59650caa72e35a9f91fd1d0cab4717447. Protected backup /home/ubuntu/twin-v2-backups/test-photo-price-20261012 contains images.tar, code.tgz, images.json and the verified drain receipt. Live data and logs are excluded. Use a fresh verified handover before any restart/rollback; never restore old financial or chat data.

V1 deployed and runtime verified at 10:33:35 UTC / 20:33:35 AEST: commit caa2a94ee519eb84d25b6c77023f732e8fed7b36, image 323149985112.dkr.ecr.ap-southeast-2.amazonaws.com/twin-bot@sha256:f9618c70eb79abd38cce8991f47b4a6b11f19b7d28eb7d3886baa0a4e5b368ab. Successful guarded deployment run 38236670595. It recorded zero pending turns and zero background work, a fresh clean shutdown receipt with zero turns pending at exit, then the new commit in running state. The release image also passed 437 scoped price checks.

The first deployment run 38235298151 passed all tests and built that same image, but its 330-second prepare window expired with a decreasing backlog (75 then 63 pending turns). No stop or image swap occurred; the same old runtime resumed, independently confirmed at 10:28:40 UTC. The bounded second attempt allowed up to 900 seconds using the same zero-pending, shutdown-receipt and resume-on-failure requirements; it completed without dropping work.

V1 rollback: previous deployed commit 278e3c3d639ae6384882735a42975718d93dbb32, image 323149985112.dkr.ecr.ap-southeast-2.amazonaws.com/twin-bot@sha256:cc25287414090b053c575ca04a149954cbd47dc829627b201875c7cb3710d34d. Use the established reliability-drain-host.py path and fresh verified shutdown; do not restore financial or chat history. An alternative narrow rollback is to remove these three entries in both bot configurations through the same tested deployment path.

The first V2 preparation attempt stopped on an archive file absent from the already-deployed source package, before changing runtime. The corrected release manifest covers runtime, tests, migrations and build configuration, checks each hash and excludes archived/non-shipped material. The second attempt passed; the failure was not ignored.


## Photo launch and separate work

The dashboard photo release was independently confirmed still running commit 52e7b5beaf64f570ea8850c624c3892030a6f991 at 10:36:03 UTC. Its Qwen3.8-27B / DeepInfra-only photo profile, eligibility rules, actual staging upload, creator settings, video limitations and rollback are recorded in [photo-model-split-20261012.md](photo-model-split-20261012.md) and [photo-launch-release-20261012.md](photo-launch-release-20261012.md). Existing-content repair remains unapplied; unfinished video work is separate. Concurrent dashboard main commit 780e4f051ff8362beab5488685cf6263ba226687 (creator gallery improvements) is preserved; this documentation update does not redeploy or revert its source.
