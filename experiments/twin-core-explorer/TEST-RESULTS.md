# Twin Core Explorer: interaction implementation validation

These checks were run locally against the final split-file source in this implementation session, not on GitHub Actions or a deployed website.

## Passed: dependency-free checks

Command: `node tests/check.mjs`.

- Syntax of all three JavaScript files.
- Six categories and 31 unique capability routes, with complete source/control descriptions.
- Exact capability-name routing and representative security, automation, voice, data ownership and follow-up requests.
- Category-name, customer-retention and memory-boundary routing regressions.
- Unknown/ambiguous requests and invalid-route fallbacks.
- Bounded workflow model: no advance through the approval checkpoint without approval, no advance during human takeover, explicit resume, completed-state bounds and reset.
- No application fetch, XHR, beacon, localStorage or sessionStorage calls.

## Passed: 17 browser check groups

Command: `python tests/browser-check.py`.

1. Six-step fictional workflow, approval gate, takeover pause, resume and restart.
2. Briefing source inspection and example briefing assembly.
3. Deployment-pattern switch with explicit external-processing boundary.
4. No horizontal overflow across home, core, category and detail states at 1440x900, 1024x768, 768x1024, 390x844 and 320x740.
5. All 31 capability panels opened and closed using browser clicks; focus restored to the selected capability.
6. Arrow, Enter and Escape navigation plus native dialog dismissal.
7. Typed routing, unknown/ambiguous requests, browser back/forward and copy-only enquiry composer.
8. Orb animation, pause, resume and reduced-motion pixel freeze.
9. Consent-gated local sample selection, real browser playback of a synthetic test tone and clearing on consent withdrawal.
10. Mocked speech cancellation while permission is pending.
11. Mocked microphone permission denial.
12. Mocked final-transcript routing and analyser-input response, with track and AudioContext cleanup.
13. Late microphone stream returned after cancellation is stopped.
14. Late analyser stream returned after capture ends is stopped.
15. Background event stops recognition and audio tracks.
16. Navigation cancels speech; unsupported speech retains typed/click navigation.
17. No JavaScript page errors in the tested paths.

## Method and limitations

The runtime browser policy blocks file and served-origin navigation. The suite therefore inlines the exact local CSS and JavaScript into an isolated Chromium document using Playwright, then exercises ordinary browser clicks, keyboard input, same-document history and media playback. It does not bypass the policy or claim a hosted-origin test.

Speech recognition, permission responses, microphone data and associated cleanup were mocked. The synthetic tone tested local playback only; it is not a voice clone and is not included as a public demonstration. No physical microphone, external transcription service or actual iPhone/Safari session was tested. A real HTTPS/device pass remains required.

Screenshots use the system font fallback to avoid nondeterministic CDN loading. Verify Satoshi loading on the real preview. These checks are not an exhaustive accessibility or penetration audit.

No authorised public before/after voice recordings were supplied. The local comparison player is implemented, but connecting a curated public sample requires approved recordings. No real enquiry destination or hosting is configured.
