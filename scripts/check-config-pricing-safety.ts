import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import {
  BUILTIN_CLONE_DEFAULTS,
  filterCloneDefaultCascade,
  PERSONALITY_DEFAULT_FIELDS,
  sanitizeCloneDefaults,
  validateCloneDefaultsForWrite,
} from "../lib/clone-default-policy";
import {
  buildSafeRepricePlan,
  DEFAULT_CATEGORY_PRICING,
  DEFAULT_PHOTO_BUNDLE_PRICE_STARS,
  MAX_PHOTO_BUNDLE_PRICE_STARS,
  MIN_PAID_MEDIA_PRICE_STARS,
  normalizeSafeCategoryGuide,
  requirePhotoBundlePrice,
} from "../lib/pricing";
import { repriceConfirmationPhrase } from "../lib/reprice-confirmation";

let passed = 0;

function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

function functionBody(src: string, declaration: string): string {
  const start = src.indexOf(declaration);
  if (start < 0) throw new Error(`no such function: ${declaration}`);
  const rest = src.slice(start + declaration.length);
  const end = rest.search(/\nexport (async )?function |\nfunction /);
  return end < 0 ? rest : rest.slice(0, end);
}

console.log("Config and pricing safety checks");

check("missing and malformed templates use canonical message economics", () => {
  for (const raw of [null, "not json", [], { starting_credits: "50", credit_pack_size: 0, credit_pack_price_stars: NaN }]) {
    const clean = sanitizeCloneDefaults(raw);
    assert.equal(clean.starting_credits, 20);
    assert.equal(clean.credit_pack_size, 30);
    assert.equal(clean.credit_pack_price_stars, 299);
  }
  assert.equal(BUILTIN_CLONE_DEFAULTS.starting_credits, 20);
});

check("valid custom message economics survive sanitization", () => {
  const clean = sanitizeCloneDefaults({ starting_credits: 27, credit_pack_size: 34, credit_pack_price_stars: 277 });
  assert.equal(clean.starting_credits, 27);
  assert.equal(clean.credit_pack_size, 34);
  assert.equal(clean.credit_pack_price_stars, 277);
});

check("strict write validation rejects unsupported enums, ranges, and relationships", () => {
  const base = { category_pricing: DEFAULT_CATEGORY_PRICING };
  assert.throws(() => validateCloneDefaultsForWrite({ ...base, ai_mode: "invented" }), /unsupported/);
  assert.throws(() => validateCloneDefaultsForWrite({ ...base, llm_max_tries: 99 }), /1 to 5/);
  assert.throws(
    () => validateCloneDefaultsForWrite({ ...base, response_wait_min: 50, response_wait_max: 10 }),
    /minimum wait/,
  );
  assert.throws(
    () => validateCloneDefaultsForWrite({ ...base, bubble_delay_min_ms: 1500, bubble_delay_max_ms: 500 }),
    /Bubble delay/,
  );
});

check("strict write validation checks model ids and tip-button JSON", () => {
  const base = { category_pricing: DEFAULT_CATEGORY_PRICING, tip_max_stars: 1_000 };
  assert.throws(() => validateCloneDefaultsForWrite({ ...base, text_model: "bad model id" }), /model identifier/);
  assert.throws(
    () => validateCloneDefaultsForWrite({ ...base, spoil_options: [{ stars: 2_000, label: "Too high" }] }),
    /Tip buttons/,
  );
  const valid = validateCloneDefaultsForWrite({
    ...base,
    text_model: "openai/gpt-5:online",
    spoil_options: [{ stars: 500, label: "Treat me" }],
  });
  assert.equal(valid.text_model, "openai/gpt-5:online");
});

check("personality and arbitrary clone columns never enter a fleet cascade", () => {
  const attempted = Object.fromEntries([
    ...[...PERSONALITY_DEFAULT_FIELDS].map((field) => [field, "changed"]),
    ["name", "renamed"],
    ["bot_token", "secret"],
    ["response_wait_min", 8],
    ["category_pricing", DEFAULT_CATEGORY_PRICING],
  ]);
  const update = filterCloneDefaultCascade(attempted);
  assert.deepEqual(update, { response_wait_min: 8 });
});

check("stale personality values are stripped while operational values remain", () => {
  const clean = sanitizeCloneDefaults({
    sexual_level: "max",
    warmth_level: "max",
    emoji_allowlist: "❤️",
    welcome_instruction: "overwrite her voice",
    paywall_default_message: "overwrite her sales voice",
    paywall_resume_media_id: "creator-specific-photo",
    push_level: "high",
    response_wait_min: 6,
  }) as Record<string, unknown>;
  assert.equal(clean.sexual_level, undefined);
  assert.equal(clean.warmth_level, undefined);
  assert.equal(clean.emoji_allowlist, undefined);
  assert.equal(clean.welcome_instruction, undefined);
  assert.equal(clean.paywall_default_message, undefined);
  assert.equal(clean.paywall_resume_media_id, undefined);
  assert.equal(clean.push_level, "high");
  assert.equal(clean.response_wait_min, 6);
});

check("the built-in category ladder is complete and above the paid floor", () => {
  const normalized = normalizeSafeCategoryGuide(DEFAULT_CATEGORY_PRICING);
  assert.ok(normalized);
  assert.ok(Object.values(normalized).every((price) => price >= MIN_PAID_MEDIA_PRICE_STARS));
});

check("the corruption floor stays below current catalogue prices", () => {
  assert.equal(MIN_PAID_MEDIA_PRICE_STARS, 250);
  assert.ok(MIN_PAID_MEDIA_PRICE_STARS < DEFAULT_CATEGORY_PRICING.sfw);
});

check("photo bundle prices have a strict bundle-only ceiling", () => {
  assert.equal(DEFAULT_PHOTO_BUNDLE_PRICE_STARS, 99);
  assert.equal(MAX_PHOTO_BUNDLE_PRICE_STARS, 8500);
  for (const [raw, expected] of [[1, 1], ["99", 99], [900, 900], [901, 901], ["2200", 2200], ["4400", 4400], ["8500", 8500]] as const) {
    assert.equal(requirePhotoBundlePrice(raw), expected);
  }
  for (const raw of [0, -1, 8501, 8500.5, Number.NaN, Number.POSITIVE_INFINITY, "", "nope", null]) {
    assert.throws(() => requirePhotoBundlePrice(raw), /whole number from 1 to 8500 Stars/);
  }

  // The cap belongs only to photo bundles. High individual-media categories
  // must remain valid and must not be flattened to the bundle ceiling.
  const aboveBundleCap = { ...DEFAULT_CATEGORY_PRICING, anal: MAX_PHOTO_BUNDLE_PRICE_STARS + 1000 };
  assert.equal(normalizeSafeCategoryGuide(aboveBundleCap)?.anal, MAX_PHOTO_BUNDLE_PRICE_STARS + 1000);
  assert.ok(normalizeSafeCategoryGuide(DEFAULT_CATEGORY_PRICING));
});

check("the legacy 15-100 Star guide is rejected", () => {
  const legacy = Object.fromEntries(Object.keys(DEFAULT_CATEGORY_PRICING).map((key, index) => [key, 15 + index]));
  assert.equal(normalizeSafeCategoryGuide(legacy), null);
});

check("safe reprice raises low paid items but protects free and higher manual prices", () => {
  const plan = buildSafeRepricePlan([
    { id: "raise", tags: ["lingerie"], nsfw: false, star_value: 700, is_free: false },
    { id: "manual-high", tags: ["lingerie"], nsfw: false, star_value: 1800, is_free: false },
    { id: "free", tags: ["full_nude"], nsfw: true, star_value: 0, is_free: true },
    { id: "matched", tags: ["sfw"], nsfw: false, star_value: 600, is_free: false },
  ], DEFAULT_CATEGORY_PRICING);
  assert.deepEqual(plan.changes, [{ id: "raise", currentPrice: 700, nextPrice: 1000 }]);
  assert.equal(plan.protectedFromDecrease, 1);
  assert.equal(plan.protectedFree, 1);
  assert.equal(plan.unchanged, 1);
  assert.equal(plan.increaseStars, 300);
});

check("reprice confirmation is bound to creator, guide, ids, old prices, and proposed prices", () => {
  const input = {
    cloneId: "clone-a",
    target: "photos" as const,
    guide: DEFAULT_CATEGORY_PRICING,
    changes: { photos: [{ id: "photo-1", currentPrice: 400, nextPrice: 600 }], videos: [] },
  };
  const phrase = repriceConfirmationPhrase(input);
  assert.match(phrase, /^REPRICE 1 PHOTOS [A-F0-9]{10}$/);
  assert.notEqual(phrase, repriceConfirmationPhrase({ ...input, cloneId: "clone-b" }));
  assert.notEqual(phrase, repriceConfirmationPhrase({
    ...input,
    changes: { photos: [{ id: "photo-1", currentPrice: 400, nextPrice: 800 }], videos: [] },
  }));
  assert.notEqual(phrase, repriceConfirmationPhrase({
    ...input,
    changes: { photos: [{ id: "photo-2", currentPrice: 400, nextPrice: 600 }], videos: [] },
  }));
});

check("the fleet form does not render personality inputs", () => {
  const form = readFileSync(new URL("../components/CloneDefaultsForm.tsx", import.meta.url), "utf8");
  for (const field of PERSONALITY_DEFAULT_FIELDS) {
    assert.ok(!form.includes(`name=\"${field}\"`), `${field} is still rendered in the fleet form`);
  }
});

check("server actions require preview confirmation and surface default-write errors", () => {
  const mediaActions = readFileSync(new URL("../app/media/actions.ts", import.meta.url), "utf8");
  const settingsActions = readFileSync(new URL("../app/settings/actions.ts", import.meta.url), "utf8");
  assert.ok(mediaActions.includes("confirmationPhrase !== plan.confirmationPhrase"));
  assert.ok(mediaActions.includes('.eq("star_value", change.currentPrice)'));
  assert.ok(mediaActions.includes('.eq("is_free", false)'));
  assert.ok(settingsActions.includes("if (saveError) throw new Error"));
  assert.ok(settingsActions.includes("if (followersError) throw new Error"));
  const saveStart = settingsActions.indexOf("export async function saveCloneDefaults");
  const validation = settingsActions.indexOf("validateCloneDefaultsForWrite(out)", saveStart);
  const firstWrite = settingsActions.indexOf("const { error: saveError }", saveStart);
  assert.ok(saveStart >= 0 && validation > saveStart && firstWrite > validation);
});

check("automatic uploads and importers reject stale guides instead of flattening prices", () => {
  const mediaActions = readFileSync(new URL("../app/media/actions.ts", import.meta.url), "utf8");
  const photoImporter = readFileSync(new URL("../scripts/import-media.ts", import.meta.url), "utf8");
  const videoImporter = readFileSync(new URL("../scripts/import-video-media.ts", import.meta.url), "utf8");
  assert.ok(mediaActions.includes("assertUploadPricingReady(fd, guide)"));
  assert.ok(!mediaActions.includes("Math.max(derived ?? fallback"));
  assert.ok(photoImporter.includes("requireSafeGuide(rawGuide)"));
  assert.ok(videoImporter.includes("requireSafeGuide(rawGuide)"));
});

check("every dashboard bundle write and input uses the shared price guard", () => {
  const mediaActions = readFileSync(new URL("../app/media/actions.ts", import.meta.url), "utf8");
  for (const declaration of ["export async function createBundle", "export async function updateBundle"]) {
    const body = functionBody(mediaActions, declaration);
    const guard = body.indexOf("requirePhotoBundlePrice(");
    const firstWrite = body.indexOf('.from("photo_bundles")');
    assert.ok(guard >= 0, `${declaration} does not validate the bundle price`);
    assert.ok(firstWrite >= 0, `${declaration} no longer writes photo_bundles, this check needs updating`);
    assert.ok(guard < firstWrite, `${declaration} mutates photo_bundles before validating the price`);
    assert.ok(body.includes("star_price: starPrice"), `${declaration} does not write the validated value`);
  }

  const mediaManager = readFileSync(new URL("../app/media/MediaManager.tsx", import.meta.url), "utf8");
  const managerInputs = mediaManager.match(/<input name="star_price"[\s\S]*?\/>/g) ?? [];
  assert.equal(managerInputs.length, 2, "MediaManager must expose exactly the create and edit bundle price inputs");
  for (const input of managerInputs) {
    assert.ok(input.includes("min={1}"), "MediaManager bundle input is missing min={1}");
    assert.ok(input.includes("max={MAX_PHOTO_BUNDLE_PRICE_STARS}"), "MediaManager bundle input is missing the shared max");
    assert.ok(input.includes("step={1}"), "MediaManager bundle input is missing step={1}");
    assert.ok(/\brequired\b/.test(input), "MediaManager bundle input is not required");
  }
  assert.ok(mediaManager.includes("defaultValue={DEFAULT_PHOTO_BUNDLE_PRICE_STARS}"), "new bundle form is not using the shared default");

  const createClone = readFileSync(new URL("../components/CreateCloneForm.tsx", import.meta.url), "utf8");
  const stagedInput = createClone.split(/\r?\n/).find((line) => line.includes("value={b.stars}")) ?? "";
  assert.ok(stagedInput, "new-clone bundle price input was not found");
  assert.ok(stagedInput.includes("min={1}"), "new-clone bundle input is missing min={1}");
  assert.ok(stagedInput.includes("max={MAX_PHOTO_BUNDLE_PRICE_STARS}"), "new-clone bundle input is missing the shared max");
  assert.ok(stagedInput.includes("step={1}"), "new-clone bundle input is missing step={1}");
  assert.ok(/\brequired\b/.test(stagedInput), "new-clone bundle input is not required");
  assert.ok(createClone.includes("stars: String(DEFAULT_PHOTO_BUNDLE_PRICE_STARS)"), "new-clone bundle staging is not using the shared default");

  const importer = readFileSync(new URL("../scripts/import-media.ts", import.meta.url), "utf8");
  assert.ok(importer.includes("star_price: DEFAULT_PHOTO_BUNDLE_PRICE_STARS"));
});

console.log(`\n${passed} config and pricing safety checks passed.`);
