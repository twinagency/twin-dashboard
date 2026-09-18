# Twin Core Explorer

Standalone, GitHub-first interactive product explorer. No Lovable, npm install, database or paid model API is required to run it.

## Isolation

Work stays on `feat/twin-core-explorer`, under `experiments/twin-core-explorer`. Do not merge main or deploy the production dashboard to preview this experiment. There are no production route, workflow, credential or customer-data changes. Hosting and the real enquiry destination remain separate decisions.

The panels describe the offering. Demonstrations use fictional data; this page does not implement the business integrations it describes.

## Run

Open `index.html` for click/text navigation, or serve this directory:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Open `http://localhost:8080`. Public voice-navigation testing requires a supported browser and HTTPS. Typing and clicks remain usable when the microphone is unsupported or denied.

## Experience

- Six circular categories and 31 final capability panels, local keyword navigation, keyboard and browser-back support.
- Customer workflow with real simulated approval and takeover gates; owner briefing with inspectable fictional sources; deployment diagrams showing external processing boundaries.
- A local, consent-gated audio-comparison player. It accepts an original recording and an authorised pre-generated sample; it does not generate a clone or upload files.
- Copy-only enquiry composer. No enquiry is sent or stored.

## Latest mobile design

See `MOBILE-UPDATE.md`. At 720 CSS pixels or narrower, the adapter applies the approved small Twin Technologies wordmark, blue punctuation and title, exact platform description, aligned ring and refined command bar. Both main and miniature orbs use a source-faithful adaptation of the original dashboard drawing, including the original 118 by 86 logical mobile-dock proportions. The added solid blue volume is removed on mobile. Desktop remains the prior presentation.

The original source is `components/TwinAssistant.tsx`, blob `83bb5068a6d4ab517a9ce810c16d4bdccaa515a7`. This is a visual adaptation, not a copy of dashboard networking or an exact frame-by-frame identity claim. The requested subtle inward/outward pulse is bounded; reduced motion freezes both orbs. Mobile pause is available under Browse capabilities.

## Files

- `index.html`: semantic entry page.
- `core.js` / `core.css`: catalogue, routes and original explorer foundation.
- `experience.js` / `experience.css`: demonstrations and interaction layer.
- `presentation.css`: earlier desktop/mobile presentation pass.
- `mobile.js` / `mobile.css`: narrowly scoped mobile design and source-restored orb.
- `speech.js`: consent-gated browser speech and local amplitude adapter.
- `tests/`: reproducible syntax, behaviour, presentation and mobile checks.

## Privacy

Tap-to-talk only. The browser speech provider may process audio externally; the app does not store audio or transcripts. Cancellation, navigation, backgrounding and late permission responses stop capture and release streams. Local comparison audio uses temporary object URLs, revoked on navigation or consent withdrawal. There is no upload endpoint, analytics, customer-data access or API secret.

Satoshi loads through an optional Fontshare stylesheet. The installed/system font fallback works without it. No font files are distributed.

## Tests

```sh
node tests/check.mjs
python tests/browser-check.py
python tests/visual-check.py
python tests/mobile-check.py
# Optional desktop baseline comparison:
TWIN_BASELINE_DIR=/path/to/previous/experiment python tests/mobile-check.py
```

Python browser tests require Playwright and Chromium. The current environment permits local inlined documents, not hosted-origin validation. See `TEST-RESULTS.md` for actual checks and limits.

## Before public launch

Review a real HTTPS preview on physical iPhone/Safari and Chrome, including speech permissions and Satoshi loading. Supply authorised public voice recordings or retain the local comparison mode. Configure hosting and a real enquiry destination only with approval. This branch is not deployed.
