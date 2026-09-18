# Twin Core Explorer validation

## Current mobile implementation

The exact final source was tested locally, not through GitHub Actions or a hosted website.

- `node tests/check.mjs`: syntax of all four JavaScript files, six categories, 31 unique detail routes, exact-name and representative natural-language commands, invalid/unknown/ambiguous routing, workflow approval/takeover/reset bounds, no application API/storage calls, mobile renderer provenance and desktop fallback.
- `python tests/browser-check.py`: all 17 existing check groups pass with the mobile adapter included. Covers workflow gates, briefing sources, deployment diagrams, 31 panels, five viewport sizes, keyboard/navigation/focus/history, copy-only enquiry, pause/reduced motion, real synthetic-tone playback and mocked speech lifecycle.
- `python tests/visual-check.py`: 48 viewport/route combinations pass. No horizontal overflow, non-overlapping 44px+ targets, retained mobile circular layout, stale-status cleanup and settled transitions.
- `TWIN_BASELINE_DIR=... python tests/mobile-check.py`: eight additional groups pass. Seven mobile widths, ring/marker alignment, complete labels, minimum targets, approved wordmark/copy/command design, genuine main and mini canvas motion, pause/resume, reduced-motion freeze, offscreen miniature animation, resize restoration, touch-emulated navigation and no page errors.
- Desktop home, core and detail screenshot bytes match the 9a55fd1 baseline under identical deterministic reduced-motion settings.

## Method and limitations

Tests inline the exact local split-file source into Chromium because this execution environment does not allow served-origin browser navigation. This is not a deployed-site or physical-device result. Ordinary browser clicks, keyboard events, touch emulation and media playback are exercised.

Speech recognition, permissions and microphone input are mocked. Synthetic audio tests playback only; it is not a voice clone and is not shipped as a public sample. Physical iPhone/Safari and HTTPS checks remain necessary.

Actual screenshots and video use the installed Inter fallback. External Satoshi loading is not verified in this environment. No font files are bundled. These checks are not an exhaustive accessibility, compatibility or security audit.

No public hosting, real enquiry recipient or authorised curated voice comparison has been configured. See `MOBILE-UPDATE.md` for source provenance and the mobile-only scope.
