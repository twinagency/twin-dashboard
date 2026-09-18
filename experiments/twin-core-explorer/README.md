# Twin Core Explorer

A GitHub-first, standalone interactive product explorer. No Lovable dependency, npm install, database, model API key or paid generation call is needed for this version.

## Scope and isolation

Work remains on `feat/twin-core-explorer` under `experiments/twin-core-explorer`. Do not merge the dashboard's main branch or deploy its production image to preview this work. No production routes, workflows, credentials or customer data are changed. Hosting and the public address are a separate milestone.

The explorer presents the offering and clearly labelled fictional demonstrations. It does not implement the customer-facing business integrations described by its panels.

## Run

Open `index.html` for ordinary browsing or serve this folder:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Open `http://localhost:8080`. A real HTTPS preview and supported browser are required for public microphone testing. Click and text navigation remain available when speech is unsupported or denied.

## Visual finishing pass

The approved six-category structure is unchanged. Mobile now uses a circular capability layout rather than a disconnected two-column list. The existing 216-point sphere uses its original geometry and movement, with source-over blending, blue/cyan volume and particle edge contrast calibrated for white. This is contrast tuning, not a promise of pixel-for-pixel parity with the dark dashboard.

The header, typography, CTA, command field, detail presentation and transitions have been refined. Category labels emerge radially, then remain stationary. Status messages reset on navigation. Inter is the explicit system fallback when Satoshi cannot load.

The extra presentation stylesheet contains these refinements without changing the catalogue or speech provider. This is a design review build, not a public-release sign-off.

## Implemented experience

- Original 216-point Twin particle geometry, nearest-neighbour links, cyan/blue palette, shell glints/arcs and normal rotation, adapted from `components/TwinAssistant.tsx` blob `83bb5068a6d4ab517a9ce810c16d4bdccaa515a7`.
- One premium white hero; six fixed labels on a circular path; category replacement; 31 final capability panels. No spinning labels or additional menu layer.
- Reactive orb opening, selected arc highlighting, desktop repositioning, hover, live audio amplitude when available, pause/resume and reduced-motion handling.
- Local keyword/synonym navigation, visible status, safe unknown/ambiguous results, browser back/forward, keyboard arrows, focus restoration and mobile layouts.
- A six-step fictional customer workflow. Approval is a real simulation gate, human takeover blocks progression, and restart resets the example.
- Owner briefing with inspectable fictional source records, including unverified delivery information that is not converted into an invented promise.
- Deployment diagrams that visibly distinguish the customer environment from external providers.
- A permission-gated local audio comparison player. Select an original recording and an already-generated, authorised sample. The page does not generate or verify a cloned voice, upload files or present generic speech synthesis as cloning. Actual public samples have not been supplied.
- A local enquiry composer with copy support and manual-copy fallback. It does not send or store enquiries.

## Code

- `index.html`: semantic entry page.
- `core.css`: original white visual foundation.
- `core.js`: approved catalogue, local routing and original orb renderer.
- `experience.css`: interaction and demonstration styling.
- `presentation.css`: refined typography, white-surface presentation, circular mobile layout and radial reveal transitions.
- `experience.js`: bounded workflow, briefing, deployment and local audio experiences.
- `speech.js`: opt-in browser recognition and local audio-amplitude adapter.
- `tests/check.mjs`: dependency-free syntax, route and workflow checks.
- `tests/browser-check.py`: reproducible browser regression suite.

## Microphone and privacy

Microphone access is requested only after the visitor chooses Start in the disclosure dialog. The browser's recognition provider may process audio externally. There is no always-listening mode, backend transcription, transcript logging or recording storage in the application.

Recognition and the optional local analyser have cancellation guards. Final result, timeout, denial, navigation, background and page exit stop active capture. Audio streams returned after cancellation are immediately stopped. Optional analyser failure does not block ordinary speech routing. No synthetic amplitude is presented as a live microphone signal.

Audio files selected for comparison remain object URLs in the current page and are released on navigation or consent withdrawal. There is no upload endpoint. Fontshare is the optional Satoshi stylesheet provider; system fonts work without it. No font files are bundled.

## Tests

```sh
node tests/check.mjs
# Requires local Python Playwright and Chromium, not a runtime dependency:
python tests/browser-check.py
python tests/visual-check.py
```

See `TEST-RESULTS.md` for the exact checks and limitations. The browser suite inlines the source in an isolated local test document because served-origin navigation is blocked by this execution environment. That is not a hosted-site test. The suite uses actual browser clicks and actual synthetic-tone playback, but mocked speech/permission APIs. No physical microphone or iPhone result is claimed.

The visual suite checks 48 viewport/route combinations, full-size non-overlapping navigation targets, preserved circular mobile layout, stale-status cleanup and settled opening transitions. Both suites were rerun against the final source. Screenshots and the walkthrough are actual local browser captures, not generated design renders. They use Inter fallback, not a verified Satoshi download.

## Before public release

1. Review the real HTTPS preview on iPhone/Safari and Chrome, including microphone permissions and selected-font rendering.
2. Supply authorised before/after recordings for a curated public voice sample, or retain the local comparison mode.
3. Select hosting and configure the real enquiry destination with approval.

No hosting has been configured and no production merge or deployment is part of this change.
