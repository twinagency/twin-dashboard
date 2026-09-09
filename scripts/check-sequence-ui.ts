// Guards for the video-sequence operator policy (lib/sequence-policy.ts).
//
// WHY THIS CHECK EXISTS, SPECIFICALLY:
// Three rules here are the kind that stay true in the UI and quietly stop being
// true in the data, which is this repo's signature failure:
//
//   * A PUBLISHED REVISION IS WHAT A CUSTOMER BOUGHT. If it ever became
//     editable, an existing buyer's product would change under him and no
//     screen would look any different.
//   * PAUSE IS NOT REPOSSESSION. Pausing a fan's sequence stops future offers.
//     If the pause patch ever grew a field that touched entitlements, the
//     operator would be silently deleting content someone paid for.
//   * A CLIP DESCRIBES ITSELF. Brief section 4: a detail in the source
//     recording is not evidence it appears in a given clip. Letting the source
//     caption through is how the bot ends up promising something Part 1 does
//     not contain.
//
// Also asserted: the next eligible part is DERIVED from entitlements plus each
// part's prerequisite, never a counter. A blind increment hands out a part
// whose prerequisite was refunded.
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REVISION_STATES,
  SESSION_STATUSES,
  canEditRevision,
  canTransitionRevision,
  canTransitionSession,
  continuationBlockReason,
  descriptionIsInherited,
  nextEligiblePosition,
  patchTouchesOwnership,
  publishBlockers,
  revisionEditBlocker,
  revisionTransitionBlocker,
  sessionOperatorPatch,
  type PartDraft,
  type PublishContext,
} from "../lib/sequence-policy";
import { MIN_PAID_MEDIA_PRICE_STARS } from "../lib/pricing";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`PASS  ${name}`);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const preview = (over: Partial<PartDraft> = {}): PartDraft => ({
  position: 0, isPreview: true, caption: "a short teaser of the opening",
  priceStars: null, sourceStartSeconds: 0, sourceEndSeconds: 12, requiresPosition: null, ...over,
});
const part = (position: number, over: Partial<PartDraft> = {}): PartDraft => ({
  position, isPreview: false, caption: `what happens in part ${position}`,
  priceStars: 400, sourceStartSeconds: position * 60, sourceEndSeconds: position * 60 + 55,
  requiresPosition: position > 1 ? position - 1 : null, ...over,
});
const readyToPublish = (over: Partial<PublishContext> = {}): PublishContext => ({
  state: "review_required",
  approvedBy: "ronan",
  approvedAt: "2026-09-09T12:00:00Z",
  parts: [preview(), part(1), part(2), part(3)],
  sourceCaption: "the full forty minute recording",
  ...over,
});

// ── A published revision is immutable ───────────────────────────────────────

check("a published revision is not editable and says why", () => {
  assert.equal(canEditRevision("published"), false);
  assert.match(revisionEditBlocker("published") ?? "", /publish a new revision/i);
});

check("published may only be withdrawn, never re-opened", () => {
  assert.equal(canTransitionRevision("published", "unavailable"), true);
  for (const to of ["draft", "processing", "review_required"] as const) {
    assert.equal(canTransitionRevision("published", to), false, `published -> ${to} must be refused`);
    assert.match(revisionTransitionBlocker("published", to) ?? "", /only be withdrawn/i);
  }
});

check("a withdrawn revision is terminal", () => {
  for (const to of REVISION_STATES) {
    assert.equal(canTransitionRevision("unavailable", to), false, `unavailable -> ${to} must be refused`);
  }
});

check("only a reviewed revision can be published", () => {
  assert.equal(canTransitionRevision("review_required", "published"), true);
  for (const from of ["draft", "processing"] as const) {
    assert.equal(canTransitionRevision(from, "published"), false, `${from} -> published must be refused`);
  }
});

check("a revision being rendered is not editable", () => {
  assert.equal(canEditRevision("processing"), false);
  assert.equal(canEditRevision("draft"), true);
  assert.equal(canEditRevision("review_required"), true);
});

// ── Publish readiness ───────────────────────────────────────────────────────

check("a complete, approved, described cut publishes clean", () => {
  assert.deepEqual(publishBlockers(readyToPublish()), []);
});

check("publication requires a person's approval, not just a good cut", () => {
  assert.match(publishBlockers(readyToPublish({ approvedBy: null }))[0] ?? "", /person must approve/i);
  assert.match(publishBlockers(readyToPublish({ approvedAt: null }))[0] ?? "", /person must approve/i);
});

check("a clip may not carry the source recording's description", () => {
  const blockers = publishBlockers(readyToPublish({
    parts: [preview(), part(1, { caption: "The full forty minute recording." })],
  }));
  assert.ok(blockers.some((b) => /source video's description/i.test(b)), blockers.join(" | "));
});

check("description matching ignores case, spacing and trailing punctuation", () => {
  assert.equal(descriptionIsInherited("The Full Recording", "the full recording"), true);
  assert.equal(descriptionIsInherited("the  full   recording!!", "the full recording"), true);
  assert.equal(descriptionIsInherited("she opens the door", "the full recording"), false);
  // An empty source caption cannot make every clip look inherited.
  assert.equal(descriptionIsInherited("anything", null), false);
  assert.equal(descriptionIsInherited(null, "the full recording"), false);
});

check("every clip needs a description of its own", () => {
  for (const caption of [null, "", "   "]) {
    const blockers = publishBlockers(readyToPublish({ parts: [preview(), part(1, { caption })] }));
    assert.ok(blockers.some((b) => /needs its own description/i.test(b)), `caption ${JSON.stringify(caption)}`);
  }
});

check("a paid part under the Stars floor cannot publish", () => {
  const blockers = publishBlockers(readyToPublish({
    parts: [preview(), part(1, { priceStars: MIN_PAID_MEDIA_PRICE_STARS - 1 })],
  }));
  assert.ok(blockers.some((b) => new RegExp(`at least ${MIN_PAID_MEDIA_PRICE_STARS} Stars`).test(b)), blockers.join(" | "));
  assert.deepEqual(
    publishBlockers(readyToPublish({ parts: [preview(), part(1, { priceStars: null })] }))
      .filter((b) => /needs a price/i.test(b)).length, 1,
  );
});

check("the free preview cannot be priced and cannot be a later clip", () => {
  assert.ok(publishBlockers(readyToPublish({ parts: [preview({ priceStars: 400 }), part(1)] }))
    .some((b) => /preview cannot have a price/i.test(b)));
  assert.ok(publishBlockers(readyToPublish({ parts: [preview({ position: 2 }), part(1)] }))
    .some((b) => /must be the first clip/i.test(b)));
  assert.ok(publishBlockers(readyToPublish({ parts: [preview(), preview({ position: 0 }), part(1)] }))
    .some((b) => /only one clip can be the free preview/i.test(b)));
});

check("a sequence of nothing but a preview cannot publish", () => {
  assert.ok(publishBlockers(readyToPublish({ parts: [preview()] }))
    .some((b) => /at least one paid part/i.test(b)));
});

check("paid part numbers must not skip", () => {
  assert.ok(publishBlockers(readyToPublish({ parts: [preview(), part(1), part(3, { requiresPosition: 1 })] }))
    .some((b) => /no gaps/i.test(b)));
});

check("a clip cannot depend on itself, a later clip, or a clip that is absent", () => {
  assert.ok(publishBlockers(readyToPublish({ parts: [preview(), part(1, { requiresPosition: 1 })] }))
    .some((b) => /itself or a later part/i.test(b)));
  // An EARLIER position that is simply absent: no preview exists, so a
  // prerequisite of 0 is well-ordered but points at nothing.
  assert.ok(publishBlockers(readyToPublish({ parts: [part(1, { requiresPosition: null }), part(2, { requiresPosition: 0 })] }))
    .some((b) => /does not exist/i.test(b)));
});

check("a clip that ends before it starts cannot publish", () => {
  assert.ok(publishBlockers(readyToPublish({
    parts: [preview(), part(1, { sourceStartSeconds: 90, sourceEndSeconds: 30 })],
  })).some((b) => /ends before it starts/i.test(b)));
});

// ── Pause is not repossession ───────────────────────────────────────────────

check("an operator pause writes session state and nothing else", () => {
  const patch = sessionOperatorPatch("paused", "creator asked us to hold", 4);
  assert.equal(patchTouchesOwnership(patch), false, JSON.stringify(patch));
  assert.equal(patch.status, "paused");
  assert.equal(patch.lock_version, 5, "pause must advance the optimistic lock");
});

check("a patch reaching for ownership is rejected", () => {
  for (const rogue of ["revoked_at", "entitlements", "part_id", "price_stars_paid", "quoted_price_stars"]) {
    assert.equal(patchTouchesOwnership({ status: "stopped", [rogue]: null }), true, rogue);
  }
});

check("resuming clears the pause reason rather than keeping a stale one", () => {
  assert.equal(sessionOperatorPatch("active", "creator asked us to hold", 1).pause_reason, null);
  assert.equal(sessionOperatorPatch("stopped", "refund dispute", 1).pause_reason, "refund dispute");
});

check("a finished session cannot be restarted from the operator screen", () => {
  for (const from of ["completed", "stopped"] as const) {
    for (const to of SESSION_STATUSES) {
      assert.equal(canTransitionSession(from, to), false, `${from} -> ${to} must be refused`);
    }
  }
  assert.equal(canTransitionSession("paused", "active"), true);
  assert.equal(canTransitionSession("active", "paused"), true);
});

// ── Continuation is derived, never counted ──────────────────────────────────

check("the next part comes from what he owns plus the prerequisite", () => {
  const parts = [preview(), part(1), part(2), part(3)];
  assert.equal(nextEligiblePosition(parts, []), 1);
  assert.equal(nextEligiblePosition(parts, [1]), 2);
  assert.equal(nextEligiblePosition(parts, [1, 2]), 3);
  assert.equal(nextEligiblePosition(parts, [1, 2, 3]), null);
});

check("a refunded middle part stops the sequence rather than skipping it", () => {
  // He owns 1 and 3. A counter would say "next is 4". The prerequisite for 3 is
  // already met, so the only genuinely eligible part is the one he lost: 2.
  const parts = [preview(), part(1), part(2), part(3)];
  assert.equal(nextEligiblePosition(parts, [1, 3]), 2);
});

check("a part with no prerequisite is offerable out of order", () => {
  const parts = [preview(), part(1), part(2, { requiresPosition: null })];
  assert.equal(nextEligiblePosition(parts, []), 1);
  assert.equal(nextEligiblePosition(parts, [1]), 2);
});

check("the preview is never a purchasable next part", () => {
  assert.equal(nextEligiblePosition([preview()], []), null);
});

check("continuation names exactly one reason, most decisive first", () => {
  const base = {
    sessionStatus: "active" as const, revisionState: "published" as const,
    ownedPositions: [1], parts: [preview(), part(1), part(2)], pendingAttemptId: null,
  };
  assert.equal(continuationBlockReason(base), null);
  assert.match(continuationBlockReason({ ...base, revisionState: "unavailable" }) ?? "", /no longer live/i);
  assert.match(continuationBlockReason({ ...base, sessionStatus: "paused" }) ?? "", /paused/i);
  assert.match(continuationBlockReason({ ...base, sessionStatus: "stopped" }) ?? "", /ended/i);
  assert.match(continuationBlockReason({ ...base, pendingAttemptId: "a" }) ?? "", /already outstanding/i);
  assert.match(continuationBlockReason({ ...base, ownedPositions: [1, 2] }) ?? "", /owns every part/i);
  // A withdrawn revision outranks a pause: the content is gone either way.
  assert.match(
    continuationBlockReason({ ...base, revisionState: "unavailable", sessionStatus: "paused" }) ?? "",
    /no longer live/i,
  );
});

check("a missing prerequisite reads as a prerequisite problem, not completion", () => {
  const parts = [preview(), part(1), part(2), part(3, { requiresPosition: 2 })];
  const reason = continuationBlockReason({
    sessionStatus: "active", revisionState: "published",
    ownedPositions: [1, 2, 3], parts, pendingAttemptId: null,
  });
  assert.match(reason ?? "", /owns every part/i);
});

// ── Wiring: the "configured but inert" guard ────────────────────────────────
// A server action that is not on the allowlist, or a route that is not on the
// portal path list, fails silently for agency users. Assert the registration
// rather than trusting it was remembered.

check("every sequence server action is registered in the management allowlist", () => {
  const actions = readFileSync(resolve(root, "app/sequences/actions.ts"), "utf8");
  const guard = readFileSync(resolve(root, "lib/agency-management.ts"), "utf8");
  const exported = [...actions.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  assert.ok(exported.length >= 5, `expected several actions, found ${exported.length}`);
  for (const name of exported) {
    assert.ok(
      guard.includes(`"${name}"`),
      `server action ${name} is not in guardDashboardAction's allowlist: agency users get a silent denial`,
    );
  }
  // And each action must actually call the guard before doing anything.
  for (const name of exported) {
    const body = actions.slice(actions.indexOf(`export async function ${name}`));
    const guardCall = body.indexOf("guardDashboardAction");
    const firstAwait = body.indexOf("supabaseAdmin");
    assert.ok(guardCall !== -1 && (firstAwait === -1 || guardCall < firstAwait),
      `${name} must call guardDashboardAction before touching the database`);
  }
});

check("the sequences route is registered for agency portals", () => {
  const policy = readFileSync(resolve(root, "lib/agency-policy.ts"), "utf8");
  assert.ok(/"\/sequences"/.test(policy), "/sequences is not in agencyDashboardPath: portals get 403");
  const management = readFileSync(resolve(root, "lib/agency-management-policy.ts"), "utf8");
  assert.ok(/"\/sequences"/.test(management), "/sequences cannot dispatch server actions for managing agencies");
});

check("no em dashes in the sequence UI copy", () => {
  for (const file of ["app/sequences/page.tsx", "app/sequences/actions.ts", "components/sequence/SequenceEditor.tsx",
                      "components/sequence/FanSequenceControls.tsx", "lib/sequence-policy.ts"]) {
    const text = readFileSync(resolve(root, file), "utf8");
    assert.ok(!text.includes("—"), `${file} contains an em dash`);
  }
});

console.log(`\nsequence UI policy: ${passed} checks passed`);
