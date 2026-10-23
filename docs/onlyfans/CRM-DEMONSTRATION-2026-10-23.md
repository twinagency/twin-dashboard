# Twin Hybrid CRM visual demonstration

The complete agency presentation workspace is available at `/agency/demo` after signing in as an internal administrator or a verified agency member. It is also built into a single HTML file for an offline recording. Run `npm run demo:crm`; open `test-results/crm-demo/index.html` in a browser.

This is a visual and interaction demonstration using synthetic records. Its changes live in memory until reset or reload. It does not establish that the added workflows are connected to production persistence or that OnlyFans delivery, import, upload, voice generation, campaign dispatch or payouts have passed live acceptance testing.

## Structure

| Page | Demonstration interactions |
| --- | --- |
| Overview | Existing shared layout, creator selection, dates, chart options, recent purchases and rankings |
| Creators | Shared creator identity, editable profile, channel status and scoped shortcuts |
| Inbox | Existing OnlyFans conversation layout, pause, takeover, manual sample reply and handback |
| Fan management | Directory, VIPs, tags, saved segments, assignment, internal notes, editable saved facts and confirmed account links |
| Staff workflow | Follow-up board, task assignment and shift handovers |
| Requests and approvals | Custom, content and escalation requests with owners, due dates and review stages |
| Automation | Autonomous, pause and human control, sample budgets and follow-up rules |
| Playbooks | Shared and creator-specific scripts, previews, duplication and copying |
| Campaigns | Audience tags, multi-step builder, delays, message previews, saved content and stop conditions |
| Content library | Approval queue, sample file names, bundles, pricing and voice-note draft approval |
| Reports | Creator and staff performance, transaction ledger and CSV export |
| Commissions | Creator share, staff commission, refund treatment and draft statements |
| Team and access | Existing team form, sample invitation, acceptance preview and scoped roles |
| Activity | Notifications linking back to the affected workflow |
| Data management | CSV preview and import, exports, retention preference and privacy-request preparation |
| Agency settings | Shared agency identity and links to its controls |

Every page has loading, empty and error previews. Navigation supports hash links and browser history. Owner, manager and read-only role previews use the sample team assignments. Creator scope carries through the demonstration. UI permissions here are demonstrations; production authorization remains in the existing verified services.

## Suggested recording

1. Overview and creator selection.
2. Creator profile and the inbox.
3. Play the sample autonomous sale, then demonstrate human takeover, a manual reply and handback.
4. Open the same fan's notes, saved memory and account links.
5. Create a request and a follow-up task, then show the shift handover.
6. Review content approval, a voice-note script and the campaign builder.
7. Show the updated revenue and commission statement.
8. Finish with team access if the audience asks about agency operations.

Use the Guide control for the presentation sequence. Close it for a cleaner recording. The standalone file can enter fullscreen. Reset restores all synthetic records. No provider account is required.

## Isolation and validation

Both the wrapper page and the HTML response independently check a real dashboard identity. The embedded document runs in a sandbox without same-origin access. The HTML has no external scripts or styles and prohibits network connections and native form submission through its Content Security Policy. File picking records names only. Downloads contain synthetic records. Invitations do not send email or create Auth users.

`npm run test:crm-demo` checks record relationships, role scoping, refund allocations, overview reconciliation, CSV handling, independent access decisions and bundle isolation. `node scripts/check-crm-demo-ui.mjs` checks all pages, representative forms, connected conversation actions, role restrictions, recovery and mobile widths. CI builds and retains the HTML review artifact before the full TypeScript and Next build checks.

The existing Overview and messaging layouts remain shared with production. The Overview gains an optional channel label whose default remains Telegram; the demonstration supplies its explicit aggregate label. No production database migration or provider testing is part of this change.
