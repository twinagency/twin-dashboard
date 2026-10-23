# OnlyFans UI component review

The production pages use their existing authenticated server reads and mutation handlers. This separate review uses the same presentation components with synthetic fixtures. It is not live-account, provider or end-to-end release acceptance.

Build the standalone component review with `node preview/onlyfans-ui/build.mjs`. Serve `preview/onlyfans-ui/dist` with a static server and open its root, then select OnlyFans. `mobile.html` embeds the actual app at 390, 430, 768 and 1440 pixels. The output is ignored by Git. The Next navigation shim exists only in this bundle; every API request is answered locally or refused, and every write is refused.

Alternatively, `node scripts/preview-onlyfans-ui.mjs` launches the existing isolated Next harness in synthetic UI mode on port 4173. Its middleware allows only its two local fixture reads and refuses other API requests. Without the fixture flag, that integration harness retains its real route imports and permission checks for disposable-backend integration tests.

The component review keeps Settings panels mounted. Edit the persona, switch through Reply settings and Account, then return to verify the draft is retained. Sales separates recorded transactions from open offers and keeps original currencies and pending/refund statuses. Account photos use the creator metadata already supplied to the real dashboard shell; synthetic identities fall back to initials.

Checks: `node --import tsx scripts/check-onlyfans-ui.tsx`, the existing channel/OnlyFans checks, `npx tsc --noEmit --incremental false` and `npm run build`. The new Overview loader is bounded to account and earnings reads plus one explicitly identified account's sales page. Missing values remain unavailable. Totals stay workspace-wide because the current earnings contract has no creator filter or verified daily time series.
