# Recent-history component qualification handoff

These are the preserved standalone qualification inputs used during the 2 November 2026 onboarding work. They do not change the application or qualify the running Next.js dashboard.

- `check-rendered.cjs` runs Chromium at 375 and 1280 pixels against the saved ready/held HTML in `rendered-ui.json`, checks labels and overflow, and writes screenshots plus `browser-results.json`. From this directory, with the repository's Playwright dependency/browser installed: `node check-rendered.cjs`.
- `ui-browser-check.tsx` is the original combined render/browser harness. It was staged next to copies of `RecentHistoryStatus.tsx` and `recent-history.ts`; its relative imports describe that staging layout. It is retained as evidence, not wired into the application build. Re-stage those exact components before using it.
- `local-node-loader.mjs` was a local TypeScript resolution helper. It is not production runtime configuration.
- All fixtures are synthetic. The recorded four browser component checks and 12 parser checks are in [verification.json](../verification.json). Static saved HTML alone cannot establish that later source renders correctly.

The complete Next.js application, production CSS and exact source of running OF image `sha256:22be6bc89bf7308e2c2214e03d63313bfc32f2edb6c831bddcd1a06a28258049` remain unqualified. Reported source `3d0ee2e3e2848f9cd5019399a82fe27a67f435c2` could not be recovered. Do not deploy this branch over that image until its matching source is reconciled. Preserve Moxy and all other current dashboard changes.

Full backend/deployment/measurement handoff: [CLAUDE-HANDOFF.md](https://github.com/twinagency/twin-onlyfans-backend/blob/codex/recent-history-onboarding-20261102/docs/onlyfans/recent-history-onboarding/CLAUDE-HANDOFF.md). This commit archives qualification sources only; it is not a deployment or a new browser test run.
