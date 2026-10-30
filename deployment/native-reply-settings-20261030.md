# Native reply settings release

Deployed on 30 October 2026 to both dashboard consumers from `2e4dfea7acbc5fa3fe14b64dc2d3bb981b5da7db`, image `sha256:60c4edf7947e3af3cbe33454b2df90db508d58572a7a40bf3d5698ec2a33d1fb`. Later documentation commits do not require a new runtime image.

The existing configuration editor now exposes independent `nativeReplyPacingEnabled` and `nativeReplyFormatEnabled` controls. It accepts older API responses with missing fields and disables unsupported controls. Only changed fields go through the existing authenticated revision/fingerprint and idempotency flow. Neither control changes activation or contextual sales mode. The live contextual settings UI is preserved.

The compatible dashboards were deployed before the backend, because the earlier strict parser rejects new response keys. Both images and runtime settings were verified. The second consumer retained its environment, mounts, command, entrypoint and port bindings.

Contract and focused editor checks passed. The [release workflow](https://github.com/twinagency/twin-dashboard/actions/runs/41015046700) passed creator/upload tests, full test/build jobs, image/source checks, dashboard recovery and signup/upload boundary checks.

The final all-creator catalogue-preview audit failed after checking 20 of 1,313 videos with a generic error; its exact cause is unproven. A comparison using the byte-identical checker on the previous image completed all 1,313: 1,309 passed and four failed. Media routes and this checker were not modified. The audit is not marked green; the subsequent public-homepage workflow step was skipped. Manual browser interaction has not been claimed.

Pacing was enabled for Maile alone through the audited backend endpoint at 07:22:30 UTC. Formatting was also enabled for Maile at 08:06:08 UTC / 18:06:08 Brisbane, following the user's explicit instruction to make it live after the incomplete live-verification status was explained. Both settings were read back and audit-verified; both remain off for other creators. Live conversation and interruption verification remains incomplete. No new account activation, reconnection, fan test message or purchase occurred. Nicky/Nikki remains excluded.

See the [backend release record](https://github.com/twinagency/twin-onlyfans-backend/blob/codex/reply-pacing-208785-20261030/docs/onlyfans/reply-pacing-20261030/RELEASE.md) for exact integration, load, live-observation and rollback evidence. Reverting this UI requires reverting the new backend response fields first, or retaining this compatible parser.
