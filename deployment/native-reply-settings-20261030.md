# Native reply settings candidate

Adds independent `nativeReplyPacingEnabled` and `nativeReplyFormatEnabled` checkboxes to the existing creator configuration editor. Missing fields remain readable and their controls are disabled until the backend supports them. Only changed fields are submitted through the existing revision/fingerprint, permission and idempotency flow. Neither setting changes activation or contextual sales mode.

Base: dashboard commit `3a516c8a60401f8d9ed9b30d3e2666f90d7af821`. Changes: `components/onlyfans-preview/ConfigurationEditor.tsx`, `lib/onlyfans/configuration.ts`, and `scripts/check-native-reply-settings.ts`.

Validation: contract script passed for old API responses, independent true/false values, rejection of non-booleans, contextual-field compatibility and activation-write rejection. Focused editor TypeScript checking passed with the existing dependency fixture. Full Next build and browser interaction were not run.

Deploy this compatible parser before the companion backend starts returning the new fields: the old exact-key parser rejects unknown fields. Both backend flags default off. Nothing was deployed or enabled in this session. Backend live sender reconciliation, remaining integration/load validation, and an exact compatible rollback are release blockers documented in the backend candidate's `docs/onlyfans/reply-pacing-20261030/RELEASE.md`.

Do not merge contextual offers or enable new accounts as part of this change. Nicky/Nikki remains excluded. Reverting this UI after a backend rollout requires reverting the backend response fields first, or retaining this additive parser.
