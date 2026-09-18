# Mobile first-screen spacing correction

Follow-up to `ecda30b67ff0eec638cadb2e0863fa3a2d42bccf`. This patch only changes
`mobile.css` at widths of 720 CSS pixels or less, on the root Core view.
No renderer, JavaScript behaviour, catalogue, desktop design or deeper page is changed.

## Changes

- Move Voice Cloning & Communication and Private Intelligence above their ring
  markers to give the animated sphere a clear central area. The marker coordinates
  and the ring geometry are unchanged.
- Bring Identity & Memory 10 CSS pixels closer to its marker. Balance the lower
  labels with a slightly larger outward gap. Keep horizontal, readable text.
- Reduce the visible send face from 45 to 36 CSS pixels and the arrow from 25 to
  20 pixels. Preserve a 44 by 44 CSS pixel hit target. Use a quieter flat blue
  surface instead of the previous bright gradient.
- Both existing animated orbs, branding, colours and descriptive copy are untouched.

## Verification completed in this session

```sh
node tests/check.mjs
TWIN_BASELINE_DIR=/path/to/ecda30b/experiment python tests/mobile-check.py
python tests/visual-check.py
python tests/browser-check.py
TWIN_BASELINE_DIR=/path/to/ecda30b/experiment python tests/mobile-spacing-check.py
```

All commands passed on the final source:
- The dependency-free syntax/catalogue/workflow checks.
- Eight mobile groups, including seven widths and unchanged desktop pixels.
- All 48 viewport/route presentation combinations and non-overlapping tap targets.
- All 17 existing browser interaction groups. Speech permissions and recognition
  are mocked, not tested through a physical microphone.
- New spacing checks at 320, 350, 375, 390, 414, 430 and 720 pixels: marker-to-label
  gaps, a conservative network-clearance envelope, labels within the viewport,
  all six category labels selectable by touch emulation, a 36px visible send face
  and a 44px touch target.
- Deterministic canvas captures of both orbs match the baseline byte for byte.
  The checked mobile category/detail pages and desktop home/core/detail screens
  also match the baseline under the same settings.

Checks use the exact split-file source inlined into local Chromium, with the
installed Inter font fallback. These are not hosted HTTPS, Satoshi-loading or
physical iPhone/Safari tests, and not a complete accessibility certification.

## Release state

Saved only on the existing `feat/twin-core-explorer` branch. No main merge,
production deployment, domain/DNS change, customer-data access, paid API call or
Lovable work is included. Next release steps are an isolated HTTPS preview,
physical-device verification and approval of the public Twin-domain address.
