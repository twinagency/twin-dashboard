# Dashboard login routing

- `/` and `/twin` show the same Twin administrator login, regardless of partner cookies.
- `/login` remains a compatible administrator login URL. An existing admin session can resume its requested internal page.
- `/moxy` shows only the Moxy-branded login and keeps Moxy's verified agency scope.
- `/link` shows the Link-branded login, using the existing fixed LYNQ account and creator assignments. `/lynq` remains compatible.
- Successful Twin password authentication clears partner access, partner branding and creator-scope cookies, then opens `/revenue` by default. Visiting Twin login does not grant admin access.
- Existing backend URLs stay unchanged. There is no catch-all `/twin/*` rewrite or forced redirect of assets, server actions or backend navigation.
- Login pages are standalone, uncached, and never load fleet/partner data. Public login paths reject Server Actions and non-read requests; authentication uses the existing native POST endpoints.
- The V2/V3 experiment and creator settings are unchanged.

Verification: `npm run test:agency` includes the public login routing regression matrix, legacy/Link login, Moxy read-only access, scoped Lynq management, revocation, same-origin authentication and tenant isolation checks.
