# Jess and Kate AI

Login: `/jess-and-kate-ai`. Business: Jess and Kate AI.
Agency: `40563447-698f-4ec2-b175-c816f877a1f6`.
Initial creator: Tru Kait (`02a49e27-606d-4f20-9472-fab39255753f`).

Uses the existing dashboard and verified agency membership, not a duplicated backend.
Management access covers creator settings/personality/models, flows/campaigns,
media uploads/edits/deletes/bundles/pricing, fan controls/manual takeover and
permitted Telegram Business settings. It is not Moxy's read-only role.
All data reads, writes, cached summaries and media access remain creator-scoped.
Global credentials, fleet administration, safety overrides and destructive creator/fan deletion remain internal Twin operations.
The unfinished CRM team module is not presented as working functionality.

Credentials are created by the Supabase Auth admin API, not by inserting into auth tables.
No passwords are stored in Git. Twin admin can change the portal password at
`/agency-admin/jess-kate-password`. The same password must not be reused for Twin, Moxy or Link.
A successful partner login clears Twin's admin session and any previous creator selection.
Sign-out/expired-session redirect returns to this portal; `/` and `/twin` still show Twin login.
The single assigned creator is selected automatically.

Verification: full offline suite, new login/scope regression, existing mutation/security
suite repeated under this agency ID, production-build HTTP login smoke.
No sales-flow, clone config or fan messages are changed by provisioning this portal.
