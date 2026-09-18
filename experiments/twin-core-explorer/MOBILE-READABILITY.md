# Mobile readability and preview integration repair

Scope: mobile presentation in the existing isolated experiment. No main merge, DNS change, customer-data access, new paid service or new capabilities.

## Implemented

- Recomputed mobile ellipse and marker positions with more vertical space and measured label widths.
- Grouped each category name with a separately rendered number/capability count; controlled mobile line breaks replace concatenated text.
- Darker body, category, helper and status text. Larger supporting text, natural heading wrapping, bounded scrollable dialogs and an input that retains usable width.
- Retained the original mobile painter unchanged byte for byte, including the main and mini-orb movement. This pass does not substitute another generated sphere.
- Added mobile-refinement.css after the existing styles. Desktop has no new design rules.

## Preview deployment

The existing AppDeploy preview twin-core-explorer-5eso90 was updated to snapshot 1789761220929. Both its root and served public/mobile.js were patched. An unrelated Tailwind reset in the deployment scaffold's src/styles.css was removed; that reset was not part of this GitHub standalone app. The deployment reported ready with no reported frontend/network errors. Its status response did not include an end-to-end test result, so none is claimed.

## Local validation

Syntax/catalogue/workflow checks passed. The existing 17 browser groups, 48 viewport/route combinations and eight mobile groups passed. The mobile tests exercise both animations, pause/resume, reduced-motion, navigation and desktop pixel comparisons. Microphone/permission responses are mocked.

Additional readability checks inspect seven widths (320, 350, 375, 390, 414, 430, 720): separate label/count blocks, label bounds and overlap, dialog fit, and measured text contrast of at least 4.5:1 against white for the sampled meaningful text.

Tests use local Chromium with the installed Inter fallback. They do not establish physical iPhone/Safari microphone behavior or verified external Satoshi loading. The custom Twin domain remains unconnected. The public preview is an illustrative product explorer, not a connection to customer systems.
