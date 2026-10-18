# Native model budget and Operations — 18 October 2026

Historical 0075 checkpoint. Continue with
[NATIVE-MEMORY-2026-10-18.md](NATIVE-MEMORY-2026-10-18.md), schema 0076.

The paired backend schema is `0075_native_model_budget`. The private Operations
read uses outer `of-preview.v2` and nested `of-operations.v3`.

The existing Twin page now shows today's recorded model cost and reservations,
per-provider daily allowance, provider and call counts, and unresolved costs.
Values are explicitly USD with exact four-decimal formatting. The existing
delivery allowance remains a separate counter. No financial totals are combined
with Telegram Stars or relabeled as the dashboard's selected currency.

The read adapter strictly requires the new model-cost unit, counters and valid
UTC day. It rejects older/future contracts, extra private fields and invalid
values. Positive operator authentication, tenant/account/creator authorization,
no-store responses and clearing private state after session loss are retained.
Provider connectivity remains unverified and live sending remains disabled.

The native worker reserves against the existing cost owner before generation,
retains uncertain reservations, and checks settled evidence before queueing and
final one-use delivery. The saved model, voice and language come from the same
configuration snapshot. Only an explicit synthetic model is registered.

Read the backend document with this filename and the checkpoint validation
report for exact limits. Full native context/fact persistence, actual paid-model
policy and existing photo/video commerce remain open. This does not activate,
deploy, reset an allowance, edit Telegram or send a real message.
