# Mrs Callace V2 activation — 13 October 2026 (Brisbane)

Mrs Callace is running on the existing V2 release. This is a creator configuration change, not deployment of the pending photo-recovery candidate.

## Verified result

- Creator: Mrs Callace, `mrs-callace`, clone `2e5eb05f-cc88-4ba6-870a-924948d4b09a`.
- Bot: `@mrscallacepayments_bot`.
- V1 finished its admitted work and recorded its engine-handover receipt at 2026-10-12 14:16:56.043915 UTC. Runtime log ID: 8111644.
- V2 started at 2026-10-12 14:17:04.225 UTC (13 October, 00:17:04 Brisbane). Running state and applied feature settings were verified at 14:17:34.180 UTC.
- The five existing V2 entries remained running: Sania, Kyla, Riley, Briana and Fit Sid. Mrs Callace is the sixth.
- Her existing Telegram Business connection was checked directly with Telegram: enabled, permitted to reply, and the owner username matched her configured account. The other historical connection was disabled. No connection was changed.
- Existing catalogue loaded: 305 photos and 142 videos, 447 usable legacy/current entries under the existing eligibility code. This was not new visual analysis or a claim that every legacy description was re-verified.
- Prices were not changed. Mrs Callace has no five-Star tester override.
- Credits and memory stayed off. Her existing V1 tips flag was turned off during the migration so V2 tips would not become active. V2 bundles remain disabled by the existing `V2_BUNDLES=off` runtime setting.

## Profile and compatibility

The existing V1-to-V2 mapper supplied the starting profile. Missing fields were completed from her saved creator information; absent physical details and personal preferences remain explicitly unspecified. No physical attributes or preferences were invented. Her existing privacy and no-meetup boundaries were retained.

All 26 required variables passed validation in the actual deployed renderer. The current displayed prompt matched the runtime rendering, and saving was verified by reading through the existing monitor. The V2 shared lowercase texting style applies; her old V1 capitalization/style instructions were not pasted in as contradictory overrides.

The runtime shared template, conversation generation path, photo/video analysis configuration, financial records and other creators' settings were not edited. No chat/financial snapshot was restored and no existing content was recaptioned. The script made no conversation/vision-model calls, no proactive Telegram sends and no Stars purchases. A live fan exchange was not initiated or observed as part of this operation.

## Exact runtime and rollback

V2 bot and monitor:
- Commit `45931b6f56db9f97cc8406154e35a0d216f5de65`
- Image `sha256:2f076bf6fbc17b4de58a31887e9328a56e0275d90edda39ea789efbd13517d2e`

V1 remained running:
- Commit `caa2a94ee519eb84d25b6c77023f732e8fed7b36`
- Image `323149985112.dkr.ecr.ap-southeast-2.amazonaws.com/twin-bot@sha256:f9618c70eb79abd38cce8991f47b4a6b11f19b7d28eb7d3886baa0a4e5b368ab`

Settings backup on the shared V2 data mount:
- `/home/ubuntu/twin-v2/data/_operator_backups/mrs-callace-v2-20261012/settings.json`
- Activation/receipt record beside it: `activation.json`
- Container path: `/app/data/_operator_backups/mrs-callace-v2-20261012/`
- Prepared profile SHA-256: `85aec6077be9083ca0cf658f6a40df5a4d30ba2509200469010acdc57c5cc07a`

A rollback must use the existing monitor engine control and its verified V2 drain, then restore only the original creator settings as appropriate after checking for newer edits. Preserve current chat history, purchases, refunds and ownership. No image replacement is needed to undo this creator-only activation.

## Evidence and remaining photo-fix gate

- Access retry succeeded: Actions run 38259691287, job 114846731496.
- Telegram/fleet preflight: run 38260300004, job 114848779775.
- Profile save and runtime/image checks: run 38261169060, job 114851735581.
- Verified engine activation: run 38261647145, job 114853370415; utility commit `c70f2a569170d0513160566686ddcae9264f41c1`.
- The utility has been returned to read-only verification after activation.

The earlier GitHub startup failure had a billing/spending-restriction annotation. No payment or budget was changed by this work. A fresh run subsequently succeeded, restoring the established host-access path.

Photo-recovery PR #3, candidate `12b2341f05e9ef91eeb66cca93e73522d18c6b10`, is still not deployed. Its real-model private-incident check remains blocked pending the explicit external-data approval previously requested by automatic review. The release image build and remaining candidate release gates are separate from this configuration change. Existing-content repair and unfinished video work also remain separate.
