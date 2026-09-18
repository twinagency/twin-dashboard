# Twin Core Explorer

GitHub-first, standalone interactive preview. No Lovable dependency, npm install, build service, database, API key or paid model call is required to run this version.

## Isolation

This work lives only on `feat/twin-core-explorer`, under `experiments/twin-core-explorer`. Do not merge it into the dashboard's main branch or deploy the dashboard to preview it. Main, existing application routes, workflows and production credentials are unchanged. No hosting or domain has been configured.

## Run

Open `index.html` in a browser for click and text navigation, or serve this folder locally:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Then open `http://localhost:8080`. Microphone support depends on browser support, permissions and a secure context. Voice is optional; clicks and text commands always remain available.

## Included in this first GitHub build

- White hero, one primary CTA, blue Intelligence heading, responsive layout.
- Standalone Canvas2D port of Twin's 216-point golden-angle orb geometry, links, palette, rotation, orbital ellipses and shell glints/arcs.
- Six fixed circular category labels, category replacement, 31 final capability detail panels, back/close controls and hash routes.
- Local text routing for requests such as "show me security", "follow up my leads", "clone my voice" and "go back".
- Optional browser speech navigation: explicit consent, start/stop state, denial handling, session timeout, cancellation and navigation cleanup.
- Pause/resume, reduced-motion support and background/offscreen suspension.
- Feature-specific process diagrams and local copy-only enquiry composer.

The original reference is `components/TwinAssistant.tsx`, blob `83bb5068a6d4ab517a9ce810c16d4bdccaa515a7`. The orb is a standalone adaptation, not a claim that the entire dashboard component was copied unchanged. Full visual parity and transition polish remain to be reviewed.

## Privacy and cost boundaries

No customer records, internal endpoints, analytics, transcript storage, live CRM calls, API secrets or enquiry-sending backend are included. Browser speech recognition may use the browser provider's external service; the consent dialog says so. The page itself does not upload audio. Its listening animation reflects recording state, not an audio-amplitude analyser. Speech playback is not falsely presented as voice cloning.

The optional Satoshi stylesheet is requested from Fontshare. A system-font fallback works without it. No font files are included. Hosting, future paid APIs and account plan limits are separate decisions; this repository does not promise all future operation is free.

## Validation

```sh
node tests/check.mjs
```

The code syntax, all 31 unique routes, exact feature-name commands, representative natural-language requests, unknown/ambiguous requests and safe fallbacks are checked without dependencies.

Local injected-HTML Chromium checks additionally exercised all panels, command navigation, copy composer, pause/resume, reduced motion, five viewport sizes and mocked speech lifecycle. See `TEST-RESULTS.md`. The environment blocked served-page navigation, so no deployed-site or real microphone result is claimed.

## Remaining milestones

1. Visual review and original-orb transition parity, including the more immersive category opening.
2. Three polished demonstrations: customer workflow, owner briefing, and a consented voice sample once provided. Current diagrams are explanations, not functioning business workflows.
3. Real iPhone/Safari/Chrome microphone testing and final accessibility/keyboard review.
4. Choose preview hosting and wire the real enquiry destination only with approval.

This is a working foundation, not the final sales-ready release or an implementation of every backend capability described inside it.
