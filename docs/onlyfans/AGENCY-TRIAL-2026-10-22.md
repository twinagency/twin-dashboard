# Twin agency trial preparation

The trial kit uses the existing agency setup, team and join screens with isolated
browser-memory fixtures. It is for reviewing the agency experience without an
OnlyFans account. It does not establish that production connections or delivery
work. No demo records are inserted into the shared database.

## Run the isolated trial

```sh
node scripts/build-agency-trial.cjs
```

Open `test-results/agency-trial/index.html` in a browser. The output is one
self-contained file, with no external assets or network dependencies. All changes
are temporary and reset on reload. The header identifies it as demo data.

## Review walkthrough

1. Open Agency setup. Check creator counts and the existing onboarding summary.
   Questionnaire, content and voice progress remain separate from connection readiness.
2. Open Team & access. Expand the sample staff member, select creators and change
   read-only or manager access. The real form defaults to selected creators and
   read-only access. No selection means no creator access.
3. Create a sample invitation, then revoke it. This changes the demo only. Invitation
   creation does not send email in the production product either.
4. Open the join screen to review the recipient journey. Email verification and
   account acceptance are simulated. Do not enter a real password in the demo.
5. Switch to restricted staff. Confirm that team administration is denied and the
   setup summary reflects only the assigned sample creator.
6. Reset the demo and review at a phone-sized width.

The demo's navigation is limited to those screens. Production workspace links are
explained in place and never open production. It includes no fan conversations,
real earnings, creator content or production credentials.

## What to ask the agency to prioritise

Assignments and shift handovers; notes and follow-up tasks; VIP tags and segments;
editable fan memory; custom-request escalations; autonomous pause and takeover;
sales playbooks; campaigns; content requests; staff reporting; commission reports.
Suggested reply approval is optional and deferred. Autonomous handling remains
the main product direction.

## Release and pilot limits

- Existing isolated checks cover verified-email acceptance, owner authorization,
  creator scope, safe form defaults and denial of existing-membership replacement.
- The demo simulates outcomes. Server authorization and database concurrency are
  checked separately by the existing HTTP and disposable PostgreSQL suites.
- Four damaged legacy source videos still require originals or a reviewed withdrawal.
- Actual invitation email delivery is still unverified.
- OnlyFans sign-in, history completeness, sends, uploads, sales and reversals need
  the later live acceptance session. Do not advertise this trial as launch acceptance.
- No proxy supplier has been selected by this work. HOP remains unverified.
