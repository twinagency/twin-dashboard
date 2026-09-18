# First GitHub build validation

Date: 18 September 2026. Tests run locally, not on GitHub Actions.

## Passed

- JavaScript syntax and pure catalogue/route tests: `node tests/check.mjs`.
- Six main categories and all 31 capability panels opened/closed in the browser DOM.
- Security, voice cloning, lead follow-up, automation, data ownership and email commands opened the expected routes.
- Unknown/ambiguous commands retained safe navigation choices.
- Local enquiry composer included the selected capability without sending anything.
- Particle pause/resume and reduced-motion freeze.
- No horizontal overflow at 1440x900, 1024x768, 768x1024, 390x844 and 320x740 across home, core, category and feature views.
- Mocked speech: final transcript routing, pending-session cancellation and permission-denied fallback.
- No JavaScript page errors in the checked paths.

## Limits

Local HTTP and intercepted test-origin navigation were blocked by this environment's browser policy. Tests therefore used locally injected HTML and same-document navigation; this is not a hosted-site test. Exhaustive panel checks used reduced motion and DOM click dispatch, not real touch input. Satoshi was blocked in deterministic checks, so screenshots show the system fallback font. Speech recognition was mocked: no physical microphone, real transcription service or iPhone/Safari validation was performed. Live audio-amplitude animation, real cloned voice playback and polished interactive business demonstrations remain unfinished.
