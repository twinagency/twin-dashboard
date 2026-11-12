// KNOWN RED (W8 ui-flow-plus1 F1, docs/review/W8/ui-flow-plus1.md): the clone "view" tab flow map
// (components/flow/graph.ts, mounted by components/CloneForm.tsx:284-386) claims "a capability that's toggled
// off on the clone produces no node" (graph.ts:3-4), yet draws the vision lane "always" (graph.ts:102-103,178).
// The bot gates it: handler.ts:629,633 (`fanSentPhoto && photoVisionEnabled`, `fanSentVideo && videoVisionEnabled`)
// and :2323 for Smart. CloneCfg has no vision fields, so an operator who turns both "sees fan photos/videos"
// off still sees a metered "React to his media" path.
// Contract pinned: buildGraph reads `photo_vision_enabled` / `video_vision_enabled` (the clones column names,
// CloneCfg's snake_case convention). A fix that names them differently must update this file (TEST-CHANGE).
// Not covered: CloneForm's flowCfg mapping of cfg.photoVision/cfg.videoVision (the second half of the fix).
// Team's Claude owns the fix. Not wired into npm scripts; init.sh lists known-reds by name.
import assert from "node:assert/strict";
import test from "node:test";
import { buildGraph, type CloneCfg } from "../../components/flow/graph";

// Untyped on purpose: a fix that adds required fields to CloneCfg must not break this file's typecheck.
const base = {
  ai_mode: "classic" as const, smart_split: false, charge_messages: true, photos_enabled: true, videos_enabled: true,
  bundles_enabled: true, voice_enabled: true, tips_enabled: true, discounts_enabled: false, emojis_enabled: false,
  live_captions_enabled: false, thank_you_enabled: false, drip_enabled: false, text_model: "t", routing_model: "r",
};
// The two keys a fixed CloneCfg carries; asserted to CloneCfg so this compiles before and after the fix.
const withVision = (photo: boolean, video: boolean) => ({ ...base, photo_vision_enabled: photo, video_vision_enabled: video }) as CloneCfg;
const ids = (mode: "classic" | "smart", c: CloneCfg) => buildGraph(mode, c).nodes.map((n) => n.id);

test("control: with vision on, both modes draw the vision lane fed by the photo decision", () => {
  for (const mode of ["classic", "smart"] as const) {
    const g = buildGraph(mode, withVision(true, true));
    assert.ok(g.nodes.some((n) => n.id === "vision"), `${mode}: vision node present`);
    assert.ok(g.edges.some((e) => e.source === "sawPic" && e.target === "vision"), `${mode}: sawPic -> vision edge`);
  }
});

test("W8-F1: both vision toggles off removes the vision lane (as every other toggled-off capability)", () => {
  for (const mode of ["classic", "smart"] as const) {
    assert.ok(!ids(mode, withVision(false, false)).includes("vision"),
      `${mode}: photo_vision_enabled=false + video_vision_enabled=false still draws "React to his media/photo"`);
  }
});
