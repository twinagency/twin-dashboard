# Twin Agency public site, phase one

Preview URL: `/twin-agency` on the existing dashboard deployment.
The live TwinAgency.co domain and Lovable site are NOT changed.

The public marketing page preserves the Twin wordmark and blue-gradient visual
identity with creator-only calls to action, product previews, how it works,
creator control/revenue sections, an illustrative dashboard and FAQs.
All sample conversations and dashboard graphics are labelled as illustrations.
There are no live earnings claims, testimonials, customer images or customer data.

Signup/login buttons open an accessible phase-two information dialog. They do
not collect personal details, create accounts, submit agency codes, or link to
internal admin/partner logins. Contact links open the existing public email address.
There is no public agency signup.

Security: only GET and HEAD on the EXACT `/twin-agency` route are public. Server
Actions and all other methods are refused. Middleware sets the trusted pathname;
root layout and metadata return before resolving identity or reading private data.
Existing Twin, Link, Moxy and Jess/Kate URLs and permission boundaries stay intact.
The preview is noindex/no-store. CSS is isolated to this page through a module.

Verification: `npx tsx scripts/check-marketing-access.ts`, existing offline and login
suites, production build, and `node scripts/check-marketing-site.mjs` with Playwright.
CI saves responsive screenshots and a JSON report for desktop, tablet and mobile.

Deferred explicitly: DNS/domain cutover, Lovable removal, creator authentication,
onboarding, agency invite tokens, memberships, creator dashboards and data migration.
