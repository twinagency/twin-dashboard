# Mobile source-restoration pass

## Scope

This update applies only at widths of 720 CSS pixels or less. It stays in the isolated Twin Core experiment, on `feat/twin-core-explorer`. There is no production merge, deployment, domain setup, live CRM access or paid service integration. Desktop presentation and deeper capability content are unchanged.

## Implemented

- Smaller top-left Twin Technologies wordmark with a blue full stop. The top Core breadcrumb and top-right pause icon are removed on mobile.
- Dark Twin heading with both Intelligence Core words in blue, and the exact owner-supplied platform description.
- One geometry calculation positions the ring and its six blue markers. Narrow phones use a slightly taller ellipse to retain readable labels and non-overlapping targets.
- Refined labels and command bar with a genuinely animated miniature orb, microphone and submit controls.
- The pause control remains available inside Browse capabilities. System reduced-motion preferences freeze both orbs.

## Orb provenance

The visual source is `components/TwinAssistant.tsx`, blob `83bb5068a6d4ab517a9ce810c16d4bdccaa515a7`. Its mobile dock canvas is 118 by 86 logical pixels. The adapter scales those drawing units uniformly, rather than enlarging only positions while changing stroke/node proportions.

The mobile painter restores the original 216-point geometry, nearest-neighbour links, cyan/white palette, additive blending, normal rotation, tilted perspective, local particle drift, shell glints, arcs and faint satellite details. It omits the explorer's subsequently added solid blue volume and altered source-over network rendering. The requested subtle inward/outward pulse is bounded to 1.4%; real analyser input and interface transitions can add limited scale response. This is an adaptation of the source drawing, not a claim that the full React dashboard component was copied unchanged or that every animation frame is pixel-identical.

Both the main orb and input icon use the same painter. No generated orb bitmap, recording, dashboard endpoint or copied assistant credentials are involved.

## Validation actually performed

- Dependency-free syntax/catalogue/workflow checks, including the new mobile script.
- All 17 existing browser check groups rerun with the mobile adapter included, including mocked microphone lifecycle and existing demonstrations.
- All 48 existing viewport/route presentation combinations pass.
- Eight additional mobile check groups: seven phone/tablet widths, ring/marker alignment, label bounds, 44px+ targets, correct branding/copy, both orb animations, pause/resume, reduced-motion freeze, offscreen miniature animation, viewport changes, touch-emulated navigation and no JavaScript errors.
- Desktop home, core and detail screenshots are byte-identical to the previous 9a55fd1 build under the same deterministic reduced-motion settings.

Commands:

```sh
node tests/check.mjs
python tests/browser-check.py
python tests/visual-check.py
TWIN_BASELINE_DIR=/path/to/previous/experiment python tests/mobile-check.py
```

The optional baseline variable is only required for the desktop screenshot comparison. The ordinary mobile tests run without it.

## Limits

Tests inline the exact split-file source into local Chromium; they are not a deployed HTTPS-site or physical iPhone/Safari test. Touch is browser emulation. Microphone recognition and permissions are mocked. Browser captures and the video use the installed Inter fallback because external Satoshi loading could not be verified here. No font files are distributed. Live HTTPS testing, authorised public voice samples and a real enquiry destination remain separate launch tasks.

The screenshots and video are captures of this running code, not image-generated mockups.
