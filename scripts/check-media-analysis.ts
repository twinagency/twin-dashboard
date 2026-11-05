import assert from "node:assert/strict";
import sharp from "sharp";
import { VISUAL_EVIDENCE_KEYS } from "../lib/media-classification";
import { analysePhoto, analysisTimeoutMs, resolveVisionAnalysisModel, sampleOffsets, unanalysed, visionProfile } from "../lib/caption";
import { acceptCaption, fallbackCaption } from "../lib/send-caption";

(async () => {
const no = Object.fromEntries(VISUAL_EVIDENCE_KEYS.map((k) => [k, "no"]));
const good = (features: Record<string, string> = {}, extra: Record<string, unknown> = {}) => JSON.stringify({
  features: { ...no, ...features },
  summary: "A woman in a grey hoodie sits on a sofa.", details: "She holds a phone. A lamp is behind her.",
  short_label: "grey hoodie sofa", clothing: ["grey hoodie"], objects: ["phone"], setting: "living room", tags: ["solo"], ...extra,
});
const meta = (model = "qwen/qwen2.5-vl-72b-instruct", provider: string | null = "DeepInfra") =>
  ({ model, provider, latencyMs: 1200, promptTokens: 900, completionTokens: 300, costUsd: 0.0004, finishReason: "stop" });
const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#888" } }).png().toBuffer();
const writeCaption = async () => "sitting here in my grey hoodie, what do u think? 😏";

// ---- happy path: provenance names the configured and the EFFECTIVE model/provider ----------------------------------------------
{
  const calls: string[] = [];
  const r = await analysePhoto(png, { model: "qwen/qwen2.5-vl-72b-instruct", writeCaption, call: async (a) => { calls.push(a.prompt); return { content: good(), meta: meta("qwen/qwen2.5-vl-72b-instruct", "Hyperbolic") }; } });
  assert.equal(r.analysis.status, "ok");
  assert.equal(r.analysis.model_configured, "qwen/qwen2.5-vl-72b-instruct");
  assert.equal(r.analysis.model_effective, "qwen/qwen2.5-vl-72b-instruct");
  assert.equal(r.analysis.provider, "Hyperbolic");
  assert.equal(r.analysis.attempts, 1);
  assert.equal(r.analysis.caption_source, "written");
  assert.equal(r.caption.caption, "sitting here in my grey hoodie, what do u think? 😏");
  assert.equal(calls.length, 1);
  assert.equal(r.analysis.facts?.scope, "still");
  assert.deepEqual(r.caption.tags, ["solo"]);
}

// ---- configured vs effective differ when the clone's model is replaced ----------------------------------------------------------
{
  assert.equal(resolveVisionAnalysisModel("google/gemini-2.0-flash"), "qwen/qwen2.5-vl-72b-instruct");
  assert.equal(resolveVisionAnalysisModel("qwen/qwen3-vl-32b-instruct"), "qwen/qwen2.5-vl-72b-instruct");
  assert.equal(resolveVisionAnalysisModel("qwen/qwen3-vl-235b-a22b-instruct"), "qwen/qwen3-vl-235b-a22b-instruct");
  let asked = "";
  const r = await analysePhoto(png, { model: "google/gemini-2.0-flash", writeCaption, call: async (a) => { asked = a.model; return { content: good(), meta: meta(a.model) }; } });
  assert.equal(asked, "qwen/qwen2.5-vl-72b-instruct");
  assert.equal(r.analysis.model_configured, "google/gemini-2.0-flash");
  assert.equal(r.analysis.model_effective, "qwen/qwen2.5-vl-72b-instruct");
}

// ---- bounded retry: one contradictory answer, then a clean one -----------------------------------------------------------------
{
  const prompts: string[] = [];
  const answers = [good({}, { summary: "A topless woman sits on a sofa." }), good()];
  const r = await analysePhoto(png, { model: "m", writeCaption, call: async (a) => { prompts.push(a.prompt); return { content: answers[prompts.length - 1], meta: meta() }; } });
  assert.equal(r.analysis.status, "ok");
  assert.equal(r.analysis.attempts, 2);
  assert.match(prompts[1], /previous answer was rejected/);
}

// ---- two bad answers: kept as FAILED, with no confident metadata ----------------------------------------------------------------
{
  let n = 0;
  const r = await analysePhoto(png, { model: "m", writeCaption, call: async () => { n++; return { content: "{not json", meta: meta() }; } });
  assert.equal(n, 2, "retry is bounded to one extra attempt");
  assert.equal(r.analysis.status, "failed");
  assert.equal(r.caption.visual_description, "");
  assert.deepEqual(r.caption.tags, []);
  assert.equal(r.caption.facts, undefined);
  assert.ok(r.analysis.error);
}

// ---- credits/auth failure is not retried -----------------------------------------------------------------------------------------
{
  let n = 0;
  const r = await analysePhoto(png, { model: "m", writeCaption, call: async () => { n++; throw new Error("OpenRouter 402: insufficient credits"); } });
  assert.equal(n, 1);
  assert.equal(r.analysis.status, "failed");
  assert.match(r.analysis.error ?? "", /402/);
}

// ---- an unresolved anatomy answer gets one more look, then is held for review -----------------------------------------------------
{
  let n = 0;
  const r = await analysePhoto(png, { model: "m", writeCaption, call: async () => { n++; return { content: good({ nipples_visible: "unsure" }), meta: meta() }; } });
  assert.equal(n, 2);
  assert.equal(r.analysis.status, "review");
  assert.equal(r.caption.is_nude, false);
  assert.equal(r.caption.explicitness, "suggestive");
  assert.match(r.caption.visual_description, /Unclear: nipples\./);
  // resolved on the second look
  let k = 0;
  const r2 = await analysePhoto(png, { model: "m", writeCaption, call: async () => { k++; return { content: k === 1 ? good({ nipples_visible: "unsure" }) : good(), meta: meta() }; } });
  assert.equal(r2.analysis.status, "ok");
}

// ---- the send caption is guarded against the facts and falls back truthfully ---------------------------------------------------------
{
  const facts = (await analysePhoto(png, { model: "m", writeCaption, call: async () => ({ content: good(), meta: meta() }) })).caption.facts!;
  assert.equal(acceptCaption("mmm my pussy is out for u 😈 want it?", facts), null, "a caption cannot claim anatomy the facts do not confirm");
  assert.equal(acceptCaption("you can unlock it for 50 stars", facts), null);
  assert.ok(acceptCaption("sitting on the sofa in my hoodie, tell me what u want 😏", facts));
  const r = await analysePhoto(png, { model: "m", writeCaption: async () => "my pussy is out for u 😈 want it?", call: async () => ({ content: good(), meta: meta() }) });
  assert.equal(r.analysis.caption_source, "fallback");
  assert.equal(r.caption.caption, fallbackCaption(facts));
  assert.doesNotMatch(r.caption.caption, /pussy/);
  const r2 = await analysePhoto(png, { model: "m", writeCaption: async () => { throw new Error("text model down"); }, call: async () => ({ content: good(), meta: meta() }) });
  assert.equal(r2.analysis.status, "ok", "a caption outage never fails the analysis");
  assert.equal(r2.analysis.caption_source, "fallback");
}

// ---- pending / failed uploads carry no confident classification --------------------------------------------------------------------------
{
  const p = unanalysed("pending", "qwen/qwen2.5-vl-72b-instruct", "deadline");
  assert.equal(p.analysis.status, "pending");
  assert.equal(p.caption.visual_description, "");
  assert.deepEqual(p.caption.tags, []);
}

// ---- request settings: the slow model gets a timeout it can actually meet --------------------------------------------------------------------
assert.ok(analysisTimeoutMs("qwen/qwen3-vl-235b-a22b-instruct") >= 60_000);
assert.ok(analysisTimeoutMs("qwen/qwen2.5-vl-72b-instruct") < analysisTimeoutMs("qwen/qwen3-vl-235b-a22b-instruct"));
assert.deepEqual(visionProfile("qwen/qwen3-vl-235b-a22b-instruct").providerOrder, ["deepinfra"]);

// ---- video sampling is bounded and spread ------------------------------------------------------------------------------------------------------
assert.deepEqual(sampleOffsets(0), [0]);
assert.equal(sampleOffsets(60).length, 5);
assert.deepEqual(sampleOffsets(100), [10, 30, 50, 70, 90]);
assert.equal(sampleOffsets(1.2).length, 2, "a 1 second clip is not sampled five times");
assert.ok(sampleOffsets(3600).length <= 5, "bounded no matter how long the clip is");

console.log("Media analysis checks passed: provenance, configured vs effective model, bounded retry, failure kept as failed, unresolved review, caption guard and fallback, clip sampling.");
})().catch((e) => { console.error(e); process.exit(1); });
