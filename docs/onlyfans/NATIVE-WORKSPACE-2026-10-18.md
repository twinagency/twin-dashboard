# Native Content, Sales and Settings — 18 October 2026

This offline checkpoint follows operator controls. Database schema remains
`0078_operator_controls`; native reads use nested `of-workspace.v1` under the
existing `of-preview.v2` service envelope. The backend document of the same name
defines the complete projection and snapshot contract.

The three previously planned sidebar entries now open authenticated views of
existing records. Content shows saved catalogue metadata, prices and current
term-check/review status. Sales keeps actual transactions grouped by their
original currency/status, with open offers in a separate bounded section.
Settings shows saved creator facts/persona/model choices and recorded runtime
permissions; a saved value does not certify provider readiness.

Pages and GET handlers verify the real operator session and creator/account
scope. Agency/view-as sessions and cross-account cursors are denied. The
server-only HTTP adapter uses the read credential, never a browser cookie or
write token. Strict response validation refuses unsupported/malformed snapshots.
Empty, missing, refused and failed reads stay distinct from invented sample data.

The pages reuse Twin styling, support account navigation and keyset paging, and
wrap on mobile. Tests run the actual API, Next auth/handlers/pages and Chromium
against disposable PostgreSQL. They cover catalogue paging, separate cleared,
pending/refunded and original-currency totals, open offers excluded from payments,
saved settings, session loss, role/scope denials and zero external browser calls.

Content/configuration edits, uploads, pricing changes and payment resolution are
not implemented by these read screens. The five scoped local conversation
controls remain separate. This is not deployment or complete Milestone 5/live
acceptance. Preserve Telegram behavior and the existing native owners.
