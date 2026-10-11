// Analysis pipeline checks with MOCKED vision responses: no network, no model call, no database.
// Run: npm run test:media  (needs the scripts tsconfig for the server-only stub)
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  analysePhoto, analyseVideo, contactSheet, sampleOffsets, resolveVisionAnalysisModel,
  VISION_ANALYSIS_DEFAULT_MODEL, VISION_CALL_TIMEOUT_MS, ANALYSIS_TOTAL_BUDGET_MS, type VisionCall,
} from "../lib/caption";
import { ANALYSIS_VERSION, FACT_KEYS, FACT_FIELDS } from "../lib/media-analysis-contract";
import {
  analysisRowFields, priceForAnalysis, factFieldsChanged, insertMediaRowWithFallback, isMissingColumnError,
  withoutOptionalMediaColumns, OPTIONAL_MEDIA_COLUMNS,
} from "../lib/media-analysis-row";
import { withRetry } from "../lib/retry";
import { PRICING_CATEGORIES } from "../lib/pricing";

const meta = (over: Record<string, unknown> = {}) => ({ model: "qwen/qwen2.5-vl-72b-instruct", provider: "DeepInfra", latencyMs: 1200, costUsd: 0.0004, finishReason: "stop", ...over });
const allNo = Object.fromEntries(FACT_KEYS.map((k) => [k, "no"]));
const answer = (evidence: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => JSON.stringify({
  evidence: { ...allNo, ...evidence },
  identifying: "A blonde woman in a grey sweatshirt takes a selfie on a wooden floor.",
  details: "She has a grey sweatshirt and black leggings and stands near a window.",
  short_label: "grey sweatshirt selfie",
  visible: ["grey sweatshirt", "black leggings", "wooden floor"],
  tags: ["solo"],
  ...over,
});
const replying = (...contents: string[]): { call: VisionCall; calls: { prompt: string; dataUrl: string; model: string }[] } => {
  const calls: { prompt: string; dataUrl: string; model: string }[] = [];
  let i = 0;
  return { calls, call: async (a) => { calls.push({ prompt: a.prompt, dataUrl: a.dataUrl, model: a.model }); const c = contents[Math.min(i++, contents.length - 1)]; return { content: c, meta: meta() }; } };
};
const captionOk = async () => "mmm lounging in my sweatshirt, wanna see what's under it? 😈";
async function main() {
const photo = await sharp({ create: { width: 1000, height: 800, channels: 3, background: "#888" } }).jpeg().toBuffer();

// ---- success: analysed, contract shape, effective model + provider recorded, caption from the facts ----
{
  const r = replying(answer());
  const res = await analysePhoto(photo, "qwen/qwen3-vl-32b-instruct", undefined, { call: r.call, writeCaption: captionOk });
  assert.equal(res.status, "analysed");
  assert.equal(res.version, ANALYSIS_VERSION);
  assert.equal(res.model, VISION_ANALYSIS_DEFAULT_MODEL, "a retired configured model is replaced by the single resolver");
  assert.equal(r.calls[0].model, VISION_ANALYSIS_DEFAULT_MODEL);
  assert.equal(res.provider, "DeepInfra");
  assert.equal(res.costUsd, 0.0004);
  assert.equal(res.fields?.visual_facts.v, 2);
  assert.equal(res.fields?.visual_facts.frames, undefined);
  assert.equal(res.fields?.caption, "mmm lounging in my sweatshirt, wanna see what's under it? 😈");
  assert.match(r.calls[0].dataUrl, /^data:image\/jpeg;base64,/);
  assert.doesNotMatch(r.calls[0].prompt, /SEND CAPTION/);
  // a forced model passes through untouched (eval entry point)
  const forced = replying(answer());
  const f = await analysePhoto(photo, "qwen/qwen3-vl-235b-a22b-instruct", undefined, { call: forced.call, writeCaption: captionOk });
  assert.equal(f.model, "qwen/qwen3-vl-235b-a22b-instruct");
  assert.equal(forced.calls[0].model, "qwen/qwen3-vl-235b-a22b-instruct");
}
assert.equal(resolveVisionAnalysisModel(null), VISION_ANALYSIS_DEFAULT_MODEL);
assert.equal(resolveVisionAnalysisModel("google/gemini-2.5-flash"), VISION_ANALYSIS_DEFAULT_MODEL);
assert.equal(resolveVisionAnalysisModel("mistralai/mistral-small-3.2-24b-instruct"), "mistralai/mistral-small-3.2-24b-instruct");

// ---- legacy caption: failure => null (V1 falls back to auto_desc), never throws, never a promo caption for needs_review ----
{
  const res = await analysePhoto(photo, null, undefined, { call: replying(answer()).call, writeCaption: async () => { throw new Error("deepseek down"); } });
  assert.equal(res.status, "analysed", "a caption failure does not fail the analysis");
  assert.equal(res.fields?.caption, null);
  const bad = await analysePhoto(photo, null, undefined, { call: replying(answer()).call, writeCaption: async () => "my nipples are out 😈 want more of me?" });
  assert.equal(bad.fields?.caption, null, "a caption that claims what the facts do not state is dropped");
  const review = await analysePhoto(photo, null, undefined, { call: replying(answer({ nipples: "unclear" })).call, writeCaption: captionOk });
  assert.equal(review.status, "needs_review");
  assert.equal(review.fields?.caption, null, "needs_review rows get no send caption");
}

// ---- failure: the call errors, the upload is still representable, nothing reads as analysed ----
{
  const err: VisionCall = async () => { throw new Error("OpenRouter 402: insufficient credits"); };
  const res = await analysePhoto(photo, null, undefined, { call: err });
  assert.equal(res.status, "failed");
  assert.equal(res.fields, undefined);
  assert.match(res.error ?? "", /402/);
  const row = analysisRowFields(res);
  assert.equal(row.analysis_status, "failed");
  assert.equal(row.analysis_error, res.error);
  assert.equal(row.analysed_at, null);
  assert.equal(row.visual_facts, null);
  assert.equal(row.visual_description, null);
  assert.equal(row.caption, null);
  assert.deepEqual(row.tags, []);
  // not a photo at all
  const junk = await analysePhoto(Buffer.from("not an image"), null, undefined, { call: replying(answer()).call });
  assert.equal(junk.status, "failed");
  assert.match(junk.error ?? "", /unreadable/);
}

// ---- bounded retries: malformed, then fine => analysed on the second look; always malformed => failed; 4xx stops at once ----
{
  const r = replying("{not json", answer());
  const res = await analysePhoto(photo, null, undefined, { call: r.call, writeCaption: captionOk });
  assert.equal(res.status, "analysed");
  assert.equal(r.calls.length, 2);
  assert.match(r.calls[1].prompt, /previous answer was rejected/);
  const never = replying("{nope");
  assert.equal((await analysePhoto(photo, null, undefined, { call: never.call })).status, "failed");
  assert.equal(never.calls.length, 2, "exactly one corrective retry, never more");
  const auth = replying();
  let n = 0;
  const dead: VisionCall = async () => { n++; throw new Error("OpenRouter 404: model not found"); };
  assert.equal((await analysePhoto(photo, null, undefined, { call: dead })).status, "failed");
  assert.equal(n, 1, "a dead model is not retried");
  void auth;
}
// a contradiction is retried once; if it survives the result is needs_review with facts-only prose
{
  const contradicted = answer({}, { details: "She is topless in lingerie at a mirror." });
  const r = replying(contradicted, contradicted);
  const res = await analysePhoto(photo, null, undefined, { call: r.call, writeCaption: captionOk });
  assert.equal(res.status, "needs_review");
  assert.equal(r.calls.length, 2);
  assert.doesNotMatch(res.fields!.visual_description, /topless|lingerie|mirror/i);
  assert.equal(res.fields!.is_nude, false);
  assert.equal(res.fields?.caption, null);
  const fixed = replying(contradicted, answer());
  assert.equal((await analysePhoto(photo, null, undefined, { call: fixed.call, writeCaption: captionOk })).status, "analysed", "a corrected second answer is accepted");
}
// timeouts: each call has its own deadline and the total is bounded
assert.ok(VISION_CALL_TIMEOUT_MS >= 30_000 && ANALYSIS_TOTAL_BUDGET_MS > 2 * VISION_CALL_TIMEOUT_MS, "per-attempt timeout is sane and the retry fits inside the total");
{
  const ctrl = new AbortController();
  ctrl.abort();
  const res = await analysePhoto(photo, null, ctrl.signal, { call: replying(answer()).call });
  assert.equal(res.status, "failed", "an aborted caller signal fails the analysis, never throws");
}
{
  let tries = 0;
  const r = await withRetry(async () => { if (++tries < 3) throw new Error("fetch failed"); return "ok"; }, 3, { baseMs: 1 });
  assert.equal(r, "ok");
  tries = 0;
  await assert.rejects(withRetry(async () => { tries++; throw new Error("OpenRouter 400 bad"); }, 3, { baseMs: 1 }));
  assert.equal(tries, 1);
}

// ---- pricing: failed / needs_review never price from blank tags ----
const guide = Object.fromEntries(PRICING_CATEGORIES.map((c) => [c, c === "sfw" || c === "solo" ? 700 : c === "anal" ? 2000 : 900]));
{
  const ok = await analysePhoto(photo, null, undefined, { call: replying(answer()).call, writeCaption: captionOk });
  assert.equal(priceForAnalysis(guide, ok), 700, "an analysed SFW item prices from its tags");
  const nudeRes = await analysePhoto(photo, null, undefined, { call: replying(answer({ genitals: "yes" }, { identifying: "A woman sits.", details: "A woman sits on a bed.", short_label: "sitting", visible: ["bed"], tags: [] })).call, writeCaption: captionOk });
  assert.equal(priceForAnalysis(guide, nudeRes), 900, "pussy price");
  const failedRes = await analysePhoto(photo, null, undefined, { call: async () => { throw new Error("boom"); } });
  assert.equal(priceForAnalysis(guide, failedRes), 2000, "failed => the guide's highest category, not the SFW price");
  const review = await analysePhoto(photo, null, undefined, { call: replying(answer({ anus: "unclear" })).call });
  assert.equal(review.status, "needs_review");
  assert.equal(priceForAnalysis(guide, review), 2000);
  assert.equal(priceForAnalysis(null, failedRes), null, "no usable guide => no derived price");
  assert.equal(priceForAnalysis({ sfw: 5 }, ok), null, "an unsafe guide is refused");
}

// ---- row fields ----
{
  const ok = await analysePhoto(photo, null, undefined, { call: replying(answer()).call, writeCaption: captionOk });
  const row = analysisRowFields(ok);
  assert.equal(row.analysis_status, "analysed");
  assert.equal(row.analysis_version, 2);
  assert.equal(row.analysis_model, VISION_ANALYSIS_DEFAULT_MODEL);
  assert.equal(row.analysis_provider, "DeepInfra");
  assert.equal(row.analysis_error, null);
  assert.ok(typeof row.analysed_at === "string");
  assert.deepEqual((row.visual_facts as { evidence: unknown }).evidence, ok.fields!.visual_facts.evidence);
  assert.equal(row.is_nude, false);
}

// ---- metadata_edited_at: only a real change to a FACT_FIELDS value counts ----
{
  const stored = { caption: "c", tags: ["solo", "bed"], auto_desc: "a", visual_description: "d", explicitness: "none", is_nude: false, nsfw: false };
  assert.equal(factFieldsChanged(stored, { caption: "c", tags: ["bed", "solo"], auto_desc: "a", explicitness: "none", is_nude: false }), false, "resaving the same values is not an edit (tag order ignored)");
  assert.equal(factFieldsChanged(stored, { star_value: 900, is_free: false, image_name: "x", teaser_caption: "t" }), false, "price and name edits are not fact edits");
  for (const [k, v] of [["caption", "new"], ["tags", ["solo"]], ["auto_desc", "b"], ["visual_description", "e"], ["explicitness", "explicit"], ["is_nude", true], ["nsfw", true]] as const) {
    assert.equal(factFieldsChanged(stored, { [k]: v }), true, k);
  }
  assert.equal(factFieldsChanged({ ...stored, caption: null }, { caption: null }), false);
  assert.equal(factFieldsChanged(null, { caption: "x" }), false);
  assert.deepEqual([...FACT_FIELDS].sort(), ["auto_desc", "caption", "explicitness", "is_nude", "nsfw", "tags", "visual_description"]);
}

// ---- deploy order: writes survive the analysis columns not existing yet ----
{
  assert.equal(isMissingColumnError("Could not find the 'analysis_status' column of 'photos' in the schema cache"), true);
  assert.equal(isMissingColumnError('column "visual_facts" of relation "photos" does not exist'), true);
  assert.equal(isMissingColumnError("duplicate key value"), false);
  const stripped = withoutOptionalMediaColumns({ caption: "x", analysis_status: "failed", visual_facts: null, visual_description: "d", metadata_edited_at: "now", star_value: 5 });
  assert.deepEqual(stripped, { caption: "x", star_value: 5 });
  for (const c of ["analysis_status", "analysis_version", "analysis_model", "analysis_provider", "analysis_error", "analysed_at", "visual_facts", "metadata_edited_at", "visual_description"]) assert.ok(OPTIONAL_MEDIA_COLUMNS.includes(c), c);
  const rows: Record<string, unknown>[] = [];
  const client = { from: () => ({ insert: async (row: Record<string, unknown>) => { rows.push(row); return { error: "analysis_status" in row ? { message: "Could not find the 'analysis_status' column of 'photos' in the schema cache" } : null }; } }) };
  await insertMediaRowWithFallback(client, "photos", { caption: null, analysis_status: "failed", star_value: 5 });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], { caption: null, star_value: 5 });
  await assert.rejects(insertMediaRowWithFallback({ from: () => ({ insert: async () => ({ error: { message: "violates check" } }) }) }, "photos", {}), /violates check/);
}

// ---- video: 5 evenly spaced frames, ONE contact sheet, ONE call ----
{
  const offs = sampleOffsets(10);
  assert.equal(offs.length, 5);
  assert.ok(offs[0] > 0 && offs[4] < 10, "away from the first and last instant");
  const gaps = offs.slice(1).map((v, i) => +(v - offs[i]).toFixed(2));
  assert.ok(gaps.every((g) => Math.abs(g - gaps[0]) < 0.02), "evenly spaced");
  assert.equal(sampleOffsets(1).length, 2, "a 1s clip cannot give 5 distinct seconds");
  assert.deepEqual(sampleOffsets(0), [0]);

  const frames = await Promise.all([0, 1, 2, 3, 4].map((i) => sharp({ create: { width: 640, height: 360, channels: 3, background: { r: i * 50, g: 10, b: 10 } } }).jpeg().toBuffer()));
  const sheet = await sharp(await contactSheet(frames)).metadata();
  assert.equal(sheet.width, 3 * 448);
  assert.equal(sheet.height, 2 * 448);

  const dir = mkdtempSync(path.join(tmpdir(), "analysis-check-"));
  try {
    const clip = path.join(dir, "clip.mp4");
    execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc=duration=6:size=320x240:rate=10", "-pix_fmt", "yuv420p", clip], { stdio: "ignore" });
    const r = replying(answer({}, { identifying: "A test pattern fills the frame.", details: "Coloured bars and a counter appear in each frame.", short_label: "test pattern", visible: ["colour bars"] }));
    const res = await analyseVideo(readFileSync(clip), "qwen/qwen2.5-vl-72b-instruct", undefined, { call: r.call, writeCaption: captionOk });
    assert.equal(r.calls.length, 1, "ONE vision call for the whole clip");
    assert.equal(res.status, "analysed");
    assert.equal(res.fields?.visual_facts.frames, 5);
    assert.match(r.calls[0].prompt, /5 separate frames/);
    assert.match(r.calls[0].prompt, /no claims about motion/i);
    assert.match(res.fields!.visual_description, /Based on 5 sampled frames\./);
    const sent = await sharp(Buffer.from(r.calls[0].dataUrl.split(",")[1], "base64")).metadata();
    assert.equal(sent.width, 3 * 448, "the single image is the tiled contact sheet");
    // clip-wide narration is a contradiction for video
    const narr = replying(answer({}, { details: "Then she turns around and continues dancing throughout." }));
    const nres = await analyseVideo(readFileSync(clip), null, undefined, { call: narr.call });
    assert.equal(nres.status, "needs_review");
    // a file ffmpeg cannot read fails the analysis, it does not throw
    const broken = await analyseVideo(Buffer.from("not a video"), null, undefined, { call: replying(answer()).call });
    assert.equal(broken.status, "failed");
    assert.match(broken.error ?? "", /video frames unavailable/);

    // second look (video only): a trigger key "yes" costs ONE more call, and whatever is not re-confirmed becomes "unclear"
    const bare = { identifying: "A woman lies on a bed.", details: "She lies on a white sheet.", short_label: "woman on bed", visible: ["white sheet"], tags: ["pussy", "solo"] };
    const sl1 = replying(answer({ genitals: "yes" }, bare), JSON.stringify({ genitals: "no" }));
    const s1 = await analyseVideo(readFileSync(clip), null, undefined, { call: sl1.call, writeCaption: captionOk });
    assert.equal(sl1.calls.length, 2, "genitals yes on a video makes exactly one second-look call");
    assert.match(sl1.calls[1].prompt, /ONLY these keys: genitals\./);
    assert.equal(sl1.calls[1].dataUrl, sl1.calls[0].dataUrl, "same sheet");
    assert.equal(s1.status, "needs_review");
    assert.equal(s1.fields?.visual_facts.evidence.genitals, "unclear");
    assert.ok(!s1.fields?.tags.includes("pussy"));
    assert.equal(s1.fields?.is_nude, false);
    assert.match(s1.error ?? "", /second look did not confirm genitals/);
    assert.equal(s1.fields?.caption, null, "needs_review rows get no send caption");
    assert.equal(s1.latencyMs, 2400, "second call latency is accounted");
    assert.equal(s1.costUsd, 0.0008, "second call cost is accounted");

    const sl2 = replying(answer({ genitals: "yes", sexual_activity: "yes" }, bare), JSON.stringify({ genitals: "yes", sexual_activity: "yes" }));
    const s2 = await analyseVideo(readFileSync(clip), null, undefined, { call: sl2.call, writeCaption: captionOk });
    assert.equal(sl2.calls.length, 2);
    assert.equal(s2.status, "needs_review", "confirmed explicit keys stay yes, but a new video waits for completeReview (video gate)");
    assert.equal(s2.fields?.visual_facts.evidence.genitals, "yes");

    const sl3 = replying(answer({ anus: "yes", full_nudity: "yes" }, { ...bare, tags: [] }), JSON.stringify({ anus: "yes", full_nudity: "no" }));
    const s3 = await analyseVideo(readFileSync(clip), null, undefined, { call: sl3.call, writeCaption: captionOk });
    assert.match(sl3.calls[1].prompt, /ONLY these keys: anus, full_nudity\./);
    assert.equal(s3.status, "needs_review", "a partial downgrade still goes to review");
    assert.deepEqual([s3.fields?.visual_facts.evidence.anus, s3.fields?.visual_facts.evidence.full_nudity], ["yes", "unclear"]);

    // the second look itself failing confirms nothing
    let n = 0;
    const flaky: VisionCall = async (a) => { if (n++ === 0) return { content: answer({ sex_toy: "yes" }, bare), meta: meta() }; throw new Error("OpenRouter 500: boom"); };
    const s4 = await analyseVideo(readFileSync(clip), null, undefined, { call: flaky, writeCaption: captionOk });
    assert.equal(s4.status, "needs_review");
    assert.equal(s4.fields?.visual_facts.evidence.sex_toy, "unclear");

    // ---- conservative video gate: a NEW video never ends "analysed" with a nudity/sexual key yes or unclear ----
    // The evidence below is the round-3 eval output for the clips named (video-eval/results.json), mocked as model answers.
    // Residual risk (c13): a missed nipple answered "no" is indistinguishable from a clean clip; no code can detect it.
    const mock = (ev: Record<string, string>, tags: string[], identifying: string, details: string, confirm: string[] = []) => {
      const answers = [answer(ev, { identifying, details, short_label: "eval clip", visible: ["bed"], tags })];
      if (confirm.length) answers.push(JSON.stringify(Object.fromEntries(confirm.map((k) => [k, "yes"]))));
      return replying(...answers);
    };
    const gate = async (r: ReturnType<typeof replying>) => analyseVideo(readFileSync(clip), null, undefined, { call: r.call, writeCaption: captionOk });
    const known: [string, ReturnType<typeof replying>][] = [
      ["c19 worn thong read as genitals+pussy", mock({ nipples: "yes", genitals: "yes", bare_buttocks: "yes", swimwear: "yes", lingerie: "yes", suggestive_pose: "yes" },
        ["outdoor", "solo", "topless", "tits", "pussy", "ass", "bikini", "lingerie"], "A red haired woman in a pink bikini poses outdoors.", "She stands beside a garden wall in sunlight.", ["genitals"])],
      ["c21 explicit clip read as fully unclothed", mock({ nipples: "yes", genitals: "yes", anus: "yes", bare_buttocks: "yes", full_nudity: "yes", suggestive_pose: "yes" },
        ["bed", "solo", "topless", "tits", "pussy", "anal", "ass", "full_nude"], "A red haired nude woman lies on a bed.", "Her anus is visible between her legs.", ["genitals", "anus", "full_nudity"])],
      ["c01 false anal tag", mock({ nipples: "yes", genitals: "yes", anus: "yes", bare_buttocks: "yes", full_nudity: "yes", suggestive_pose: "yes" },
        ["solo", "topless", "tits", "pussy", "anal", "ass", "full_nude"], "A tattooed nude woman stands in a bedroom.", "The anal area is visible from behind.", ["genitals", "anus", "full_nudity"])],
    ];
    for (const [name, r] of known) {
      const g = await gate(r);
      assert.equal(g.status, "needs_review", `${name}: not analysed`);
      assert.match(g.error ?? "", /review/i, `${name}: reason recorded`);
      assert.ok(g.fields && g.fields.tags.length > 0, `${name}: the model's fields are kept for the reviewer`);
      assert.equal(g.fields?.caption, null, `${name}: no send caption`);
      assert.equal(priceForAnalysis(guide, g), 2000, `${name}: priced at the guide maximum like any non-analysed item`);
    }
    // c13: nipple missed, everything "no": stays analysed. This is the documented residual risk of the gate.
    const c13 = await gate(mock({ swimwear: "yes", suggestive_pose: "yes" }, ["solo", "bikini"], "A woman in a yellow bikini poses on a couch.", "She sits on a grey couch."));
    assert.equal(c13.status, "analysed", "all gate keys no: cannot be detected by code");
    // each gate key alone: yes or unclear -> needs_review
    for (const k of ["nipples", "genitals", "anus", "bare_buttocks", "full_nudity", "sexual_activity", "sex_toy"]) {
      for (const v of ["yes", "unclear"]) {
        const tagless = { identifying: "A woman sits on a bed.", details: "She sits on a white sheet.", short_label: "woman on bed", visible: ["white sheet"], tags: [] };
        const r = replying(answer({ [k]: v }, tagless), JSON.stringify({ [k]: "yes" }));
        const g = await gate(r);
        assert.notEqual(g.status, "analysed", `video ${k}=${v} must not be analysed`);
      }
    }
    // a clearly clean video and a merely suggestive one stay analysed; photos are not gated
    assert.equal((await gate(replying(answer()))).status, "analysed");
    assert.equal((await gate(replying(answer({ lingerie: "yes", suggestive_pose: "yes" }, { tags: ["lingerie"], identifying: "A woman in black lingerie sits on a bed.", details: "She sits on a white sheet." })))).status, "analysed");
    const ph = await analysePhoto(photo, null, undefined, { call: replying(answer({ nipples: "yes" }, { tags: ["topless"], identifying: "A topless woman sits on a bed.", details: "She sits on a white sheet.", visible: ["white sheet"] })).call, writeCaption: captionOk });
    assert.equal(ph.status, "analysed", "photos keep their behaviour");

    // no trigger key, no extra call; and photos never pay for one
    const sl5 = replying(answer({ nipples: "yes" }, { ...bare, tags: [] }));
    await analyseVideo(readFileSync(clip), null, undefined, { call: sl5.call, writeCaption: captionOk });
    assert.equal(sl5.calls.length, 1, "nipples yes is not a trigger");
    const sl6 = replying(answer({ genitals: "yes" }, bare));
    const p6 = await analysePhoto(photo, null, undefined, { call: sl6.call, writeCaption: captionOk });
    assert.equal(sl6.calls.length, 1, "photos have no second look");
    assert.equal(p6.status, "analysed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---- wiring in the dashboard action (source-level: the action needs a live Supabase to run) ----
{
  const actions = readFileSync(new URL("../app/media/actions.ts", import.meta.url), "utf8");
  assert.match(actions, /analysePhoto\(jpeg, model\)/);
  assert.match(actions, /analyseVideo\(bytes, model\)/);
  assert.equal((actions.match(/\.\.\.analysisRowFields\(analysis\)/g) ?? []).length, 2, "photo and video inserts both write the analysis state");
  assert.equal((actions.match(/await markIfFactsEdited\(/g) ?? []).length, 2, "updatePhoto and updateVideo both read before they write");
  // every new-video path analyses through analyseVideo, where the video review gate lives (videoReviewReason in observe)
  const caption = readFileSync(new URL("../lib/caption.ts", import.meta.url), "utf8");
  assert.match(caption, /kind === "video" \? videoReviewReason\(/, "the gate sits inside the shared analyser");
  for (const f of ["import-videos.ts", "import-video-media.ts"]) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
    assert.match(src, /analyseVideo\(/, `${f} analyses through analyseVideo`);
    assert.match(src, /\.\.\.analysisRowFields\(analysis\)/, `${f} writes the analysis state`);
    assert.doesNotMatch(src, /status: "analysed"|analysis_status: "analysed"/, `${f} never forces analysed`);
  }
  assert.match(actions, /priceForAnalysis/, "pricing goes through the conservative rule");
  assert.doesNotMatch(actions, /captionPhoto|captionVideo|EMPTY_CAPTION|UPLOAD_ANALYSIS_TIMEOUT_MS/);
  assert.match(actions, /visual_description/, "the photo-flow editable visual_description is preserved");
}

console.log("Media analysis checks passed: status, failure, retries, timeouts, conservative pricing, row state, edited-at, deploy-order fallback, video contact sheet.");
}

main().catch((e) => { console.error(e); process.exit(1); });
