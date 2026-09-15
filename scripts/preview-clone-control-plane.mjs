// Local-only browser harness for the production clone control plane.
//
// Start a visual review server:
//   node scripts/preview-clone-control-plane.mjs
//   node scripts/preview-clone-control-plane.mjs --port 4180
//
// Run the isolated Playwright smoke check and exit:
//   node scripts/preview-clone-control-plane.mjs --check
//
// The bundle is built in memory, binds only to loopback, has a restrictive CSP,
// and replaces every server action/API dependency with local fixture behavior.
// It never imports credentials, Supabase, or a production data client.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
const portArg = process.argv.findIndex((arg) => arg === "--port");
const inlinePort = process.argv.find((arg) => arg.startsWith("--port="));
const requestedPort = Number(
  inlinePort?.slice("--port=".length) ?? (portArg >= 0 ? process.argv[portArg + 1] : 4179),
);
if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
  throw new Error("--port must be an integer from 1 to 65535");
}

const navigationFixture = `
import { useSyncExternalStore } from "react";
const subscribe = (listener) => {
  addEventListener("popstate", listener);
  return () => removeEventListener("popstate", listener);
};
export const usePathname = () => useSyncExternalStore(subscribe, () => location.pathname, () => "/");
export const useSearchParams = () => new URLSearchParams(location.search);
export const useRouter = () => ({
  refresh() {},
  replace(path) { history.replaceState({}, "", path); dispatchEvent(new PopStateEvent("popstate")); },
  push(path) { history.pushState({}, "", path); dispatchEvent(new PopStateEvent("popstate")); },
  back() { history.back(); },
});
`;

const linkFixture = `
import React from "react";
const hrefText = (href) => typeof href === "string" ? href : (href?.pathname || "#");
export default function Link({ children, href, onClick, ...props }) {
  return <a href={hrefText(href)} {...props} onClick={(event) => {
    onClick?.(event);
    event.preventDefault();
  }}>{children}</a>;
}
`;

const actionFixture = `
export async function updateClone() {
  window.__LOCAL_CONTROL_PLANE_NOOP_SAVES__ = (window.__LOCAL_CONTROL_PLANE_NOOP_SAVES__ || 0) + 1;
}
export async function deleteClone() {
  throw new Error("Delete is disabled in the local fixture");
}
`;

const mediaFixture = `
import React from "react";
export default function MediaManager() {
  return <div data-local-media-fixture className="rounded-2xl border border-line bg-panel p-6 text-sm text-muted">Media is intentionally omitted from this Configuration fixture.</div>;
}
`;

const flowFixture = `
import React from "react";
export default function FlowGraph() {
  return <div data-local-flow-fixture className="rounded-2xl border border-line bg-panel p-6 text-sm text-muted">Flow rendering is intentionally omitted from this Configuration fixture.</div>;
}
`;

const modelResponse = [
  { id: "x-ai/grok-4.20", name: "Grok 4.20", prompt: 0.000002, completion: 0.000010 },
  { id: "deepseek/deepseek-v3.2", name: "DeepSeek V3.2", prompt: 0.00000025, completion: 0.0000004 },
  { id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro", prompt: 0.0000004, completion: 0.0000012 },
  { id: "thedrummer/cydonia-24b-v4.1", name: "Cydonia 24B v4.1", prompt: 0.0000002, completion: 0.0000006 },
  { id: "mistralai/mistral-small-3.2-24b-instruct", name: "Mistral Small 3.2 24B", prompt: 0.0000001, completion: 0.0000003 },
  { id: "qwen/qwen3-30b-a3b-instruct-2507", name: "Qwen3 30B A3B", prompt: 0.00000008, completion: 0.0000003 },
  { id: "qwen/qwen3-vl-32b-instruct", name: "Qwen3 VL 32B", prompt: 0.0000002, completion: 0.0000006 },
  { id: "qwen/qwen3-vl-8b-instruct", name: "Qwen3 VL 8B", prompt: 0.00000005, completion: 0.00000015 },
  { id: "google/gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", prompt: 0.0000001, completion: 0.0000004 },
  { id: "inclusionai/ling-2.6-flash", name: "Ling 2.6 Flash", prompt: 0.00000005, completion: 0.00000015 },
];

const browserEntry = `
import React from "react";
import { createRoot } from "react-dom/client";
import DashboardAccessProvider from "./components/DashboardAccessProvider";
import CloneForm from "./components/CloneForm";

if (!new URLSearchParams(location.search).has("tab")) {
  history.replaceState({}, "", location.pathname + "?tab=config");
}
document.documentElement.dataset.localControlPlanePreview = "true";

const models = [
  ["x-ai/grok-4.20", "Grok 4.20", 0.000002, 0.000010],
  ["deepseek/deepseek-v3.2", "DeepSeek V3.2", 0.00000025, 0.0000004],
  ["deepseek/deepseek-v4-pro", "DeepSeek V4 Pro", 0.0000004, 0.0000012],
  ["thedrummer/cydonia-24b-v4.1", "Cydonia 24B v4.1", 0.0000002, 0.0000006],
  ["mistralai/mistral-small-3.2-24b-instruct", "Mistral Small 3.2 24B", 0.0000001, 0.0000003],
  ["qwen/qwen3-30b-a3b-instruct-2507", "Qwen3 30B A3B", 0.00000008, 0.0000003],
  ["qwen/qwen3-vl-32b-instruct", "Qwen3 VL 32B", 0.0000002, 0.0000006],
  ["qwen/qwen3-vl-8b-instruct", "Qwen3 VL 8B", 0.00000005, 0.00000015],
  ["google/gemini-2.5-flash-lite", "Gemini 2.5 Flash Lite", 0.0000001, 0.0000004],
  ["inclusionai/ling-2.6-flash", "Ling 2.6 Flash", 0.00000005, 0.00000015],
].map(([id, name, prompt, completion]) => ({ id, name, prompt, completion }));
window.__LOCAL_CONTROL_PLANE_MODELS__ = models;

const clone = {
  id: "11111111-2222-4333-8444-555555555555",
  slug: "ava-vale-local-preview",
  name: "Ava Vale",
  updated_at: "2026-09-15T11:45:00.000Z",
  bot_token: "0000000000:LOCAL_FIXTURE_TOKEN_NEVER_SENT",
  business_username: "ava_vale_preview",
  status: "active",
  uses_default_config: false,
  ai_mode: "smart",
  smart_split: true,
  intent_classic_promotions_enabled: true,
  intent_classic_promotion_version: 2,

  photos_enabled: true,
  videos_enabled: true,
  bundles_enabled: true,
  voice_enabled: true,
  photo_vision_enabled: true,
  video_vision_enabled: true,
  video_sequences_enabled: false,
  media_allow_resend: false,
  media_match_strict: true,
  live_captions_enabled: true,
  media_caption_mode: "separate",
  thank_you_enabled: true,
  charge_messages: true,
  tips_enabled: true,

  sexual_level: "medium",
  nsfw_level: "explicit",
  push_level: "high",
  tip_push_level: "medium",
  warmth_level: "high",
  curiosity_level: "high",
  playfulness_level: "medium",
  attentiveness_level: "high",
  greeting_ask_age: false,
  emojis_enabled: true,
  emoji_amount: "medium",
  emoji_allowlist: "💕 😏 🥹 ❤️",
  language_lock: true,
  languages: ["English"],
  reactions_enabled: true,
  read_receipts_enabled: true,
  message_effects_enabled: true,
  realism_effects_enabled: true,
  ai_disclosure: false,
  strict_minor_gate: true,

  discounts_enabled: true,
  discount_max_photo: 20,
  discount_max_video: 15,
  discount_max_bundle: 20,
  discount_max_credits: 10,
  discount_level_light_pct: 34,
  discount_level_medium_pct: 67,
  discount_level_max_pct: 100,
  discount_tier_share_none_pct: 50,
  discount_tier_share_low_pct: 60,
  discount_tier_share_mid_pct: 75,
  discount_tier_share_high_pct: 90,
  discount_tier_share_whale_pct: 100,
  discount_absolute_max_pct: 60,
  offer_pending_minutes: 15,
  discount_slowdown_minutes: 30,
  offer_redirect_cap: 2,
  offer_decline_cap: 3,
  spoil_options: [
    { stars: 1000, label: "Coffee" },
    { stars: 2500, label: "Spoil me" },
    { stars: 5000, label: "Make my night" },
  ],
  category_pricing: { selfie: 350, lingerie: 900, topless: 1500, nude: 2500, explicit: 4000 },
  subscription_tiers: [{ name: "VIP", price_stars: 5000, monthly_credits: 100, priority: true, exclusive: true, unlimited: false, discount_boost: 10 }],

  random_voice_enabled: true,
  random_voice_chance: 12,
  gap_awareness_enabled: true,
  match_user_length: true,
  message_catch_wait_seconds: 3,
  response_wait_min: 4,
  response_wait_max: 12,
  max_response_words: 90,
  target_response_words: 38,
  timezone: "Australia/Sydney",
  fan_time_mode: "never_assume",
  memory_window: 28,
  variety_guard: "normal",
  silence_fallback_mode: "on",
  silence_fallback_cooldown_seconds: 300,
  price_guard_mode: "block",
  bubble_delay_min_ms: 600,
  bubble_delay_max_ms: 1400,
  llm_max_tries: 3,
  onboarding_collect_fields: ["name", "country", "interests"],
  strict_onboarding_steps: true,
  drip_enabled: true,

  lowercase_level: "often",
  punctuation_drop_level: "often",
  typo_level: "sometimes",
  double_text_level: "sometimes",
  voice_id: "local-fixture-voice-id",
  eleven_model: "eleven_multilingual_v2",
  voice_stability: 0.46,
  voice_similarity: 0.78,
  voice_style: 0.32,
  voice_speaker_boost: true,
  voice_speed: 0.96,
  voice_cooldown_turns: 3,

  text_model: "x-ai/grok-4.20",
  voice_model: "deepseek/deepseek-v4-pro",
  media_model: "mistralai/mistral-small-3.2-24b-instruct",
  routing_model: "qwen/qwen3-30b-a3b-instruct-2507",
  voice_enhance_model: "google/gemini-2.5-flash-lite",
  photo_reply_model: "qwen/qwen3-vl-32b-instruct",
  vision_model: "qwen/qwen3-vl-32b-instruct",

  starting_credits: 50,
  credit_pack_size: 50,
  credit_pack_price_stars: 199,
  tip_credits_per_100_stars: 2,
  tip_reask_after_paid: false,
  tip_reask_cooldown_seconds: 180,
  smart_paywall_enabled: true,
  paywall_as_voice: false,
  paywall_default_message: "you're out of messages baby, grab some more to keep chatting with me 💕",
  paywall_button_label: "Continue 💕",
  paywall_prime_enabled: true,
  paywall_prime_before: 2,
  paywall_prime_as_voice: false,
  paywall_resume_enabled: true,
  paywall_resume_free: true,
  paywall_resume_media_id: null,

  intake: {
    fields: {
      example_texts: "heyy what are you up to 💕\\nlol stoppp you're making me blush",
      voice_notes: "soft Australian accent; laughs mid-sentence",
      life_tastes: "morning pilates, late coffee, beach walks with Luna",
      quirks: "turns bad puns into running jokes",
      notes: "grew up near the coast and still calls every weekend trip a mini holiday",
    },
    appearance: { color: "#e95296", profile_image_path: null },
  },
  stage_name: "Ava Vale",
  real_name: "Ava",
  name_shared_with_fans: "stage",
  date_of_birth: "1998-11-07",
  gender: "female",
  height: "5'6 (168cm)",
  sexuality: "bisexual",
  hometown: "Gold Coast",
  current_city: "Sydney",
  creator_type: "content_creator",
  known_for: "Playful lifestyle and behind-the-scenes content",
  career_start_year: 2021,
  admits_platforms: true,
  platforms: ["Instagram", "TikTok", "Telegram"],
  hair_length: "long",
  hair_color: "brunette",
  eye_color: "brown",
  body_type: "athletic",
  tattoos: true,
  tattoo_details: ["small wave on left wrist"],
  piercings: true,
  piercing_details: ["ears", "navel"],
  enhancements: "natural",
  voice_accent: "Australian",
  voice_pace: "relaxed",
  voice_texture: "soft",
  socials: [{ platform: "Instagram", handle: "@ava_preview", followers: "420k" }],
  fan_nicknames: ["babe", "handsome"],
  vibe_preset: "sweet_tease",
  turn_ons: ["confidence", "kindness"],
  turn_offs: ["rudeness", "pressure"],
  relationship_canon: "single",
  meeting_policy: "soft_deflect",
  love_policy: "deflects_warmly",
  acknowledges_other_fans: true,
  wake_time: "08:00",
  sleep_time: "00:30",
  daily_blocks: [{ time: "09:00", activity: "Pilates" }, { time: "15:00", activity: "Content shoot" }],
  living_situation: "alone",
  has_pets: true,
  pet_details: ["Luna, a cheeky rescue cavoodle"],
  hobbies: ["pilates", "beach walks", "cooking"],
  favorite_things: ["iced oat latte", "R&B", "sunset swims"],
  dislikes: ["cold coffee", "pushy people"],
  saving_goal: "a coastal apartment",
  content_done: ["lingerie", "topless"],
  content_hard_nos: ["meetups", "custom content involving other people"],
  hard_limits: ["MINORS", "MEETUPS", "PERSONAL_CONTACT"],
  hard_limits_extra: "Never share a home address or promise an in-person meeting.",
  reaction_to_rudeness: "playful_scold",
  reaction_to_compliments: "accepts_warmly",
  burst_style: "short_bursts",
  text_prompt: null,
  voice_prompt: null,
  routing_prompt: null,
  photo_reply_prompt: null,
};

const promptPreview = {
  mode: "smart",
  smartSplit: true,
  blocks: [
    { key: "writer", label: "Writer", hint: "Local fixture prompt", content: "You are Ava Vale. Be warm, playful and concise. This is local fixture text only." },
    { key: "decider", label: "Decider", hint: "Local fixture routing prompt", content: "Choose no paid action unless the fan clearly asks. Prices are always handled in code." },
  ],
};

function PreviewApp() {
  return <DashboardAccessProvider>
    <div data-control-plane-preview className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-50 border-b border-line bg-panel/95 px-4 py-3 shadow-sm backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-warn/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-warn">Local fixture</span>
              <span className="text-xs font-medium text-muted">Read-only services, in-memory interactions</span>
            </div>
            <h1 className="creator-name mt-1 truncate text-2xl font-semibold tracking-tight">Ava Vale</h1>
            <p className="text-sm text-muted">Operator clone control plane · Configuration review</p>
          </div>
          <div className="rounded-xl border border-good/25 bg-good/10 px-3 py-2 text-right">
            <div className="text-xs font-semibold text-good">No live services</div>
            <div className="text-[11px] text-muted">Save is a local no-op</div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1500px] px-3 py-5 sm:px-8">
        <CloneForm clone={clone} promptPreview={promptPreview} photos={[]} videos={[]} bundles={[]} appearanceColor="#e95296" />
      </main>
    </div>
  </DashboardAccessProvider>;
}

createRoot(document.getElementById("root")).render(<PreviewApp />);
`;

const fixtureModules = new Map([
  ["next/navigation", { loader: "js", contents: navigationFixture }],
  ["next/link", { loader: "jsx", contents: linkFixture }],
  ["@/app/clones/actions", { loader: "js", contents: actionFixture }],
  ["@/app/media/MediaManager", { loader: "jsx", contents: mediaFixture }],
  ["./flow/FlowGraph", { loader: "jsx", contents: flowFixture }],
]);

const bundle = await build({
  stdin: {
    contents: browserEntry,
    resolveDir: root,
    sourcefile: "local-clone-control-plane-fixture.tsx",
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  alias: { "@": root },
  define: { "process.env.NODE_ENV": '"production"' },
  banner: { js: 'var process={env:{NODE_ENV:"production"},browser:true};' },
  plugins: [{
    name: "local-control-plane-fixtures",
    setup(builder) {
      builder.onResolve({ filter: /^(next\/navigation|next\/link|@\/app\/clones\/actions|@\/app\/media\/MediaManager|\.\/flow\/FlowGraph)$/ }, (args) => ({
        path: args.path,
        namespace: "local-control-plane-fixture",
      }));
      builder.onLoad({ filter: /.*/, namespace: "local-control-plane-fixture" }, (args) => ({
        resolveDir: root,
        ...fixtureModules.get(args.path),
      }));
    },
  }],
});

const stylesheet = await postcss([tailwind()]).process('@import "./app/globals.css";', {
  from: join(root, "local-clone-control-plane-preview.css"),
});

const requests = [];
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:">
    <title>Twin local clone control plane</title>
    <link rel="stylesheet" href="/styles.css">
    <style>html{--font-sans:Arial,sans-serif;--font-display:Arial,sans-serif;--font-heading:Arial,sans-serif;--font-mono:ui-monospace,monospace}body{margin:0}</style>
  </head>
  <body><div id="root"></div><script src="/bundle.js"></script></body>
</html>`;

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  requests.push({ method: request.method ?? "GET", path: url.pathname });
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (url.pathname === "/styles.css") {
    response.setHeader("Content-Type", "text/css; charset=utf-8");
    response.end(stylesheet.css);
    return;
  }
  if (url.pathname === "/bundle.js") {
    response.setHeader("Content-Type", "application/javascript; charset=utf-8");
    response.end(bundle.outputFiles[0].text);
    return;
  }
  if (url.pathname === "/api/models") {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify(modelResponse));
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    response.statusCode = 403;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: "Live services are disabled in this local fixture" }));
    return;
  }
  if (url.pathname === "/favicon.ico") {
    response.statusCode = 204;
    response.end();
    return;
  }
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(html);
});

await new Promise((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(checkOnly ? 0 : requestedPort, "127.0.0.1", resolveListen);
});

const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not resolve local preview address");
const origin = `http://127.0.0.1:${address.port}`;

async function runCheck() {
  const browserCandidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env["PROGRAMFILES(X86)"] && join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
  ].filter(Boolean);
  const executablePath = browserCandidates.find((candidate) => existsSync(candidate));
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const externalRequests = [];
  try {
    for (const viewport of [
      { width: 390, height: 900 },
      { width: 1440, height: 1000 },
      { width: 1720, height: 1050 },
    ]) {
      const context = await browser.newContext({ viewport, colorScheme: "light", reducedMotion: "reduce" });
      await context.route("**/*", async (route) => {
        const requestUrl = new URL(route.request().url());
        if (requestUrl.origin !== origin) {
          externalRequests.push(requestUrl.href);
          await route.abort("blockedbyclient");
          return;
        }
        await route.continue();
      });
      const page = await context.newPage();
      const pageErrors = [];
      const consoleErrors = [];
      page.on("pageerror", (error) => pageErrors.push(String(error)));
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });

      await page.goto(`${origin}/?tab=config`, { waitUntil: "networkidle" });
      await page.locator("[data-control-plane-preview]").waitFor();
      const visibleText = await page.locator("body").innerText();
      for (const expected of [
        "Local fixture",
        "Ava Vale",
        "Operator clone control plane",
        "Creator control plane",
        "Domain 02",
        "Configuration",
        "Configuration workspace",
        "Runtime & connection",
        "Media & delivery capabilities",
        "Response calibration",
        "Interaction policy",
        "No live services",
      ]) assert.ok(visibleText.toLowerCase().includes(expected.toLowerCase()), `${viewport.width}px missing ${expected}`);

      if (viewport.width >= 1536) {
        await page.getByText("Context inspector", { exact: true }).waitFor();
        await page.getByText("Execution context", { exact: true }).waitFor();
      } else {
        assert.equal(
          await page.getByText("Context inspector", { exact: true }).isVisible(),
          false,
          `${viewport.width}px should reserve width for the configuration workspace`,
        );
      }
      const controlNav = page.getByRole("navigation", { name: "Control plane domains" });
      const configTab = controlNav.getByRole("button", { name: /Configuration/, exact: false });
      assert.equal(await configTab.getAttribute("aria-current"), "page", "Configuration domain should be active initially");
      await controlNav.getByRole("button", { name: /Identity/, exact: false }).click();
      await page.getByRole("heading", { name: "Identity", exact: true }).waitFor();
      await configTab.click();
      await page.getByText("Configuration workspace", { exact: true }).waitFor();

      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${viewport.width}px horizontal overflow`);
      assert.deepEqual(pageErrors, [], `${viewport.width}px page errors`);
      assert.deepEqual(consoleErrors, [], `${viewport.width}px console errors`);
      await context.close();
    }

    assert.deepEqual(externalRequests, [], "The preview attempted an external request");
    const unsafe = requests.filter(({ method, path }) =>
      !["GET", "HEAD"].includes(method) || (path.startsWith("/api/") && path !== "/api/models"),
    );
    assert.deepEqual(unsafe, [], "The preview attempted a write or an unexpected API call");
    console.log(`LOCAL CONTROL PLANE PREVIEW PASSED: ${origin}, mobile + laptop + wide desktop, no runtime errors, no external requests, no writes.`);
  } finally {
    await browser.close();
  }
}

if (checkOnly) {
  try {
    await runCheck();
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
} else {
  console.log(`Twin local clone control plane: ${origin}/?tab=config`);
  console.log("Fixture-only. Loopback bound. Live services and writes are disabled. Press Ctrl+C to stop.");
  await new Promise((resolveStop) => {
    const stop = () => server.close(resolveStop);
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}
