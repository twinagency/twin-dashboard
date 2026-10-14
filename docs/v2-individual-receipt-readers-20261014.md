# V2 individual receipt readers

Status: offline review branch only. No discount setting, payment flow, creator configuration, prompt or production deployment was changed.

## Shared contract

The settlement writer owns the additive `star_transactions` fields:

- `receipt_namespace = 'v2i1'` for every claimed Stage 3 individual receipt, including quarantined receipts.
- `individual_offer_id` links a verified receipt to its immutable offer.
- `provider_charge_id` retains the provider identity separately from the scoped row id.
- `receipt_status` is `verified`, `quarantined` or `refunded`.

Incoming row ids are `v2i1:<bot id>:<provider charge id>`. Verified refund row ids are `refund:v2i1:<bot id>:<provider charge id>`. Quarantined refunds use `quarantine-refund:v2i1:<bot id>:<provider charge id>` until their binding is verified, so legacy refund-prefix readers cannot revoke an unrelated entitlement.

Dashboard money readers use `receipt_namespace` to deduplicate `v2i1` rows by their scoped row id. Distinct provider charges therefore remain distinct even when creator, fan, amount, kind and timestamp are identical. Rows outside this namespace retain the historical business-key collapse used for the September duplicate-import incident.

Quarantined receipts stay in signed revenue. They do not grant media. A quarantined refund also stays in signed revenue but does not revoke a verified entitlement; only a `v2i1` row with `receipt_status = 'refunded'` can revoke it. Legacy receipt and refund behavior is unchanged.

## Deployment order

1. Keep Stage 3 individual discount issuance disabled.
2. Apply the additive shared schema. Old readers ignore the new nullable columns.
3. Deploy the settlement writers with issuance still disabled.
4. Deploy every dashboard money and ownership reader in this change. Confirm each deployed reader sees the new schema.
5. Re-run the focused receipt, catalogue, revenue, public API and attribution checks against the combined release candidate.
6. Only after every financial reader is live may the separately approved Toochi pilot be considered for activation.

New readers probe `receipt_namespace,receipt_status` before a named-column read. A confirmed missing receipt column uses the old column list, which keeps a pre-migration deployment working while issuance is disabled. Connection, permission and unrelated schema errors fail the read; they never silently downgrade to legacy deduplication.

## Rollback

Disable individual discount issuance before rolling back a writer or reader. Keep the additive columns and all receipt rows. Once any `v2i1` payment exists, do not restore a reader that lacks the namespace-aware deduplication because it can collapse two genuine same-second charges. Do not drop the receipt columns during an application rollback.

The old-schema fallback is only a pre-issuance compatibility path. It is not a safe way to serve already-recorded `v2i1` receipts after removing the schema.
