// KNOWN RED (REVIEW.md inv 7 "Holds and STOP": a STOP is never harder to trigger than a go, no fingerprint/revision gate
// on stop; W1 lane 3 finding F16). Moxy Off is the stop for a sending engine ("Off ... stops new Moxy work",
// MoxyControls.tsx:104-105), but validMoxyChange (moxy.ts:29-31) requires expectedRevision and settings for every mode,
// Off included: the bare stop is revision-gated exactly like the go. Same shape as F7 (preparation stop) and RISKS R13.
// Off without settings needs no revision; Off with settings stays revision-gated: the creator-setup import saves Off
// together with new settings (MoxyControls.tsx:70,75), and without the revision a stale page would overwrite newer settings.
// Fixed looks like: a bare { mode: "off" } is valid without expectedRevision; any change carrying settings, and every
// "on"/"preview", stays revision-gated. Team's Claude owns the fix. Not wired into npm scripts; init.sh does not list it
// yet (lane 10/orchestrator wires it).
import assert from "node:assert/strict";
import test from "node:test";
import { starterSettings, validMoxyChange } from "../../lib/onlyfans/moxy";

test("control: turning Moxy On without a revision stays refused (the go stays gated)", () => {
  assert.equal(validMoxyChange({ mode: "on", settings: starterSettings("synthetic") }), false);
});

test("control: Moxy Off WITH settings and no revision stays refused (the import save path keeps its CAS)", () => {
  assert.equal(validMoxyChange({ mode: "off", settings: starterSettings("synthetic") }), false);
});

test("F16: a bare Moxy Off (no settings) needs no revision", () => {
  assert.equal(validMoxyChange({ mode: "off" }), true, "STOP must not be harder than a go");
});
