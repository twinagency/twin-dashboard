// Offline integration: actual image preparation, analyser and OpenRouter transport; HTTP responses are simulated.
import assert from "node:assert/strict";
import sharp from "sharp";
import { analysePhoto, analyseVideo } from "../lib/caption";
import { orVisionDetailed } from "../lib/openrouter";
import { PHOTO_ANALYSIS_SELECTED_MODEL as selected, VISION_ANALYSIS_DEFAULT_MODEL as previous, visionProfile, configuredVisionModel, resolveVisionAnalysisModel, describeVisionAnalysisModels } from "../lib/vision-model";
import { withPhotoVisionColumn } from "../lib/photo-vision-config";
import { FACT_KEYS } from "../lib/media-analysis-contract";
import { MEDIA_CLASSIFICATION_PROMPT } from "../lib/media-classification";
import { analysisRowFields, priceForAnalysis, correctedFacts } from "../lib/media-analysis-row";
import { acceptCaption } from "../lib/send-caption";
import { PRICING_CATEGORIES } from "../lib/pricing";

async function main() {
  const mixed = { vision_model: "mistralai/mistral-small-3.2-24b-instruct", photo_vision_model: selected };
  assert.equal(configuredVisionModel(mixed, "photo"), selected);
  assert.equal(configuredVisionModel(mixed, "video"), mixed.vision_model);
  assert.equal(configuredVisionModel({ vision_model: mixed.vision_model }, "photo"), mixed.vision_model);
  assert.equal(configuredVisionModel({ ...mixed, photo_vision_model: "" }, "photo"), mixed.vision_model);
  assert.match(describeVisionAnalysisModels(mixed.vision_model, selected), /photos:.*DeepInfra.*videos:.*mistral-small/);
  const projections: boolean[] = [];
  const legacy = await withPhotoVisionColumn(async include => {
    projections.push(include);
    return include ? { data: null, error: { code: "42703", message: "column photo_vision_model does not exist" } } : { data: { vision_model: mixed.vision_model }, error: null };
  });
  assert.equal(legacy.error, null); assert.deepEqual(projections, [true, false]);
  projections.length = 0;
  const denied = await withPhotoVisionColumn(async include => { projections.push(include); return { error: { code: "42501", message: "permission denied" } }; });
  assert.equal(denied.error?.code, "42501"); assert.deepEqual(projections, [true]);
  const photo = await sharp({ create: { width: 1000, height: 800, channels: 3, background: "#888" } }).jpeg().toBuffer();
  const facts = (evidence = {}, identifying = "A woman in a grey sweatshirt stands near a window.") => ({
    evidence: { ...Object.fromEntries(FACT_KEYS.map(k => [k, "no"])), ...evidence },
    identifying, details: "She wears grey sweatpants.", short_label: "grey sweatshirt portrait", visible: ["grey sweatshirt", "grey sweatpants"], tags: ["solo"],
  });
  const oldFetch = globalThis.fetch, oldKey = process.env.OPENROUTER_API_KEY, oldTimeout = AbortSignal.timeout;
  const requests: any[] = [], timeouts: number[] = [];
  let replies: any[] = [], httpStatus = 200;
  const envelope = (content: unknown, extra = {}) => ({ model: selected, provider: "DeepInfra", usage: { cost: 0.001 }, choices: [{ finish_reason: "stop", message: { content: typeof content === "string" ? content : JSON.stringify(content) } }], ...extra });
  const reset = (...values: unknown[]) => { requests.length = 0; timeouts.length = 0; httpStatus = 200; replies = values.map(v => envelope(v)); };
  const run = (model: string | null = selected) => analysePhoto(photo, model, undefined, { writeCaption: async () => "A grey sweatshirt and matching sweatpants." });
  try {
    process.env.OPENROUTER_API_KEY = "offline-test-placeholder";
    // Capture real deadlines without waiting minutes for a timeout test.
    AbortSignal.timeout = ((ms: number) => { timeouts.push(ms); return oldTimeout(ms); }) as typeof AbortSignal.timeout;
    globalThis.fetch = (async (_input: any, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)));
      if (init?.signal?.aborted) throw init.signal.reason;
      const reply = replies.shift();
      assert.notEqual(reply, undefined, "unexpected request: retries and second looks must be bounded");
      return new Response(JSON.stringify(reply), { status: httpStatus, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    reset(facts());
    const clean = await run();
    assert.equal(clean.status, "analysed");
    assert.equal(clean.model, selected);
    assert.equal(analysisRowFields(clean).analysis_provider, "DeepInfra");
    assert.equal(analysisRowFields(clean).analysis_model, selected);
    assert.equal(requests.length, 1);
    const req = requests[0];
    assert.deepEqual(req.provider, { only: ["deepinfra"], allow_fallbacks: false });
    assert.deepEqual(req.reasoning, { effort: "xhigh", exclude: true });
    assert.equal(req.max_tokens, 16384);
    assert.equal(req.temperature, 0);
    assert.deepEqual(req.response_format, { type: "json_object" });
    assert.equal(req.messages[0].content[0].text, MEDIA_CLASSIFICATION_PROMPT);
    const image = req.messages[0].content[1].image_url.url;
    assert.equal((await sharp(Buffer.from(image.split(",")[1], "base64")).metadata()).width, 768);
    assert.deepEqual(timeouts, [750000, 240000]);

    reset("{broken", facts());
    assert.equal((await run()).status, "analysed");
    assert.equal(requests.length, 2);
    for (const request of requests) { assert.deepEqual(request.provider, req.provider); assert.deepEqual(request.reasoning, req.reasoning); assert.equal(request.max_tokens, 16384); }

    // Old/unexplained uncertainty retains its hold; only explicit crop coverage permits confirmed content.
    reset(facts({ bare_buttocks: "unclear" }));
    const held = await run();
    assert.equal(held.status, "needs_review");
    assert.equal(held.fields?.caption, null);
    assert.equal(held.fields?.visual_facts.evidence.bare_buttocks, "unclear");

    const cropFacts = { ...facts({ bare_buttocks: "unclear" }), uncertainty_reasons: { bare_buttocks: "out_of_frame" } };
    reset(cropFacts);
    const cropped = await run();
    assert.equal(cropped.status, "analysed");
    assert.equal(requests.length, 1, "coverage adds no AI call");
    assert.equal(cropped.fields?.visual_facts.evidence.bare_buttocks, "unclear");
    const saved = analysisRowFields(cropped);
    assert.equal((saved.visual_facts as any).uncertainty_reasons.bare_buttocks, "out_of_frame");
    assert.deepEqual(saved.tags, ["solo"]);
    assert.equal(saved.analysis_status, "analysed");
    assert.equal(priceForAnalysis({ ...Object.fromEntries(PRICING_CATEGORIES.map(k => [k, 600])), ass: 1400 }, cropped), 600);
    assert.equal(acceptCaption("My bare buttocks are visible.", cropped.fields!.visual_facts), null);
    const corrected = correctedFacts(saved, { tags: ["solo", "ass"] }, "2026-10-12T00:00:00Z");
    assert.equal(corrected?.evidence.bare_buttocks, "yes");
    assert.equal(corrected?.uncertainty_reasons?.bare_buttocks, undefined, "an operator correction clears obsolete coverage");

    reset({ ...cropFacts, uncertainty_reasons: { bare_buttocks: "ambiguous_visibility" } });
    assert.equal((await run()).status, "needs_review");

    const positive = facts({ nipples: "yes" }, "A woman with a clearly visible nipple stands near a window.");
    reset(positive, { nipples: "no" });
    const notConfirmed = await run();
    assert.equal(notConfirmed.status, "needs_review");
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1].provider, req.provider);
    assert.deepEqual(requests[1].reasoning, req.reasoning);
    assert.equal(requests[1].max_tokens, 16384);
    assert.deepEqual(timeouts, [750000, 240000, 240000]);
    assert.equal(notConfirmed.fields?.visual_facts.evidence.nipples, "unclear");

    reset(facts()); httpStatus = 403;
    assert.equal((await run()).status, "failed");
    assert.equal(requests.length, 1, "a refusal cannot switch provider or fallback model");

    for (const finishReason of ["length", "content_filter"]) {
      reset(); replies = [envelope(facts(), { choices: [{ finish_reason: finishReason, message: { content: JSON.stringify(facts()) } }] })];
      await assert.rejects(orVisionDetailed({ model: selected, prompt: "factual analysis", dataUrl: image, ...visionProfile(selected).request }), /incomplete or refused/);
    }
    reset(); replies = [envelope("", { choices: [{ finish_reason: "stop", message: { content: "", refusal: "blocked" } }] })];
    await assert.rejects(orVisionDetailed({ model: selected, prompt: "factual analysis", dataUrl: image }), /refused/);

    // An overall deadline reached during the first call fails closed, with no caption or fallback call.
    const overall = new AbortController();
    AbortSignal.timeout = ((ms: number) => ms === 750000 ? overall.signal : new AbortController().signal) as typeof AbortSignal.timeout;
    let calls = 0;
    const timed = await analysePhoto(photo, selected, undefined, { call: async () => { calls++; overall.abort(); throw new Error("timeout"); } });
    assert.equal(timed.status, "failed"); assert.equal(calls, 1); assert.equal(timed.fields, undefined);
    AbortSignal.timeout = oldTimeout;

    reset(facts());
    assert.equal((await run(null)).model, previous, "deploying code alone must not activate the new model");
    assert.equal(requests[0].max_tokens, 1500);
    assert.equal(requests[0].provider, undefined);
    assert.equal(requests[0].reasoning, undefined);
    assert.equal(requests[0].messages[0].content[0].type, "image_url");
    reset(facts());
    const isolated = await run(configuredVisionModel(mixed, "photo"));
    assert.equal(isolated.model, selected); assert.deepEqual(requests[0].provider, req.provider);
    assert.equal((await analyseVideo(Buffer.from("unreadable"), configuredVisionModel(mixed, "video"))).model, mixed.vision_model);
    assert.equal(resolveVisionAnalysisModel(selected, "video"), previous);
    assert.equal((await analyseVideo(Buffer.from("unreadable"), selected)).model, previous);
    assert.match(describeVisionAnalysisModels(selected), /photos:.*DeepInfra.*videos:.*235b/);
    assert.equal(resolveVisionAnalysisModel("custom/model", "photo"), "custom/model");
    assert.equal(resolveVisionAnalysisModel("custom/model", "video"), "custom/model");
  } finally {
    globalThis.fetch = oldFetch; AbortSignal.timeout = oldTimeout;
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldKey;
  }
  console.log("vision profile integration checks passed (offline; no model or database calls)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
