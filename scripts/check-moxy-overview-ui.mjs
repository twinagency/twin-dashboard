// The Moxy adapter uses the same layout and interaction contract as Twin.
process.env.OVERVIEW_TEST_BRAND='moxy';
await import('./check-live-overview-ui.mjs');
