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
  MIN_PAID_MEDIA_PRICE_STARS,
  normalizeSafeCategoryGuide,
} from "../lib/pricing";
import { repriceConfirmationPhrase } from "../lib/reprice-confirmation";

let passed = 0;

function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
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

console.log(`\n${passed} config and pricing safety checks passed.`);
