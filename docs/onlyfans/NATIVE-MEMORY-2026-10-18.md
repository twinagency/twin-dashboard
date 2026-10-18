# Native memory checkpoint — 18 October 2026

The paired backend now uses schema `0076_native_memory_evidence`. Its native
reply uses the existing fan profile and typed facts alongside bounded canonical
history. The same model response can propose source-backed corrections and
updated profile notes, without another extraction/model call.

Changes update existing `Fan` / `FanProfile` rows and retain append-only before/
after provenance. Stale or uncertain replies cannot overwrite newer facts.
Profile changes also invalidate drafts at final dispatch. No outbound bubble,
sale or purchase is inferred from learning a fact.

The public read contract is unchanged: outer `of-preview.v2`, Operations
`of-operations.v3`. No memory write controls, new data source, prompt layer,
Telegram change or UI redesign was introduced. Read the paired backend document
and checkpoint validation report for exact constraints and remaining gates.

This is an offline synthetic checkpoint. Full native policy, actual provider
integration, existing photo/video commerce and release work remain unfinished.
