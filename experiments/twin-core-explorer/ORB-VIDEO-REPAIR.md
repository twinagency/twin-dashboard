# Recording-based Twin orb replacement

The supplied 8-second MOV was examined frame by frame. It is reference evidence only, not a shipped video or bitmap. The comparison clip pairs the recording with capture of the actual running replacement renderer.

## Root cause and change

The explorer retained a filled-blue desktop painter while the mobile adapter selected a different painter. Earlier mobile-only changes therefore did not correct the desktop orb. The mobile adapter also carried a native-raster upscaling override.

The mobile adapter now owns layout only. twin-orb.js supplies one source-derived painter; orb-runtime.js replaces the active controller once for both phone and desktop, including the miniature command-bar orb. The original core bootstrap drawing remains in core.js but is superseded on startup; there is no breakpoint fallback to it. A future cleanup may remove that dead bootstrap implementation.

Source: components/TwinAssistant.tsx, blob 83bb5068a6d4ab517a9ce810c16d4bdccaa515a7. Retained: 216-point geometry, 486 links, cyan/white colours, original drift, breathing, white shell glints and electrical arcs. The replacement has no opaque volume. Display fit varies with viewport bounds, not drawing identity. The last mobile-only raster wrapper is removed.

This is a source-derived integration, not a claim of pixel-identical frames at different timestamps, resolutions or video compression. Existing page layout, category copy, ring geometry and customer-data boundaries are unchanged.

## Checks actually run

All 17 existing browser-check groups passed in local Chromium with query-string-aware source inlining. Additional checks covered widths 320, 350, 375, 390, 414, 430, 720, 768, 1280 and back to 390; main/mini animation; pause/resume; reduced-motion freeze; viewport bounds; and no JavaScript errors. Browser speech and permissions are mocked. Physical iPhone/Safari and external font loading are not certified by these tests.

AppDeploy snapshot 1789787336648 reported ready with no frontend/network errors. No hosted end-to-end result was supplied by its status API, so none is claimed. The existing Netlify upload does not auto-sync from this branch. Domain/DNS work is paused. No production dashboard merge, paid upgrade or customer-data access.
