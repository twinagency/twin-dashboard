// Offline checks for the posting API (app/api/admin/v1/posting/*).
// No network, no database: lib/posting-validate.ts is pure, and the route
// files are read as source to pin the safety properties.
import { existsSync, readFileSync } from "node:fs";
import sharp from "sharp";
import {
  PostingInputError,
  STORY_H,
  STORY_W,
  checkOverlayUse,
  contrastRatio,
  overlayLinkArea,
  parseButtonStyle,
  parseHexColor,
  parseOverlay,
  parsePreviewMode,
  cleanText,
  checkUrl,
  mediaKindFor,
  normalizeChannelRef,
  parseActivePeriod,
  parseButtons,
  parseStarPrice,
  planChannelPost,
} from "../lib/posting-validate";
import { LAYOUT, buttonHeight, computeLayout, fontFile, layoutInBounds, renderStoryOverlay } from "../lib/story-overlay";

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}: ${e instanceof Error ? e.message : e}`);
  }
}
const pending: Promise<void>[] = [];
// Async checks (rendering). Queued so every failure is reported together.
function acheck(name: string, fn: () => Promise<void>) {
  pending.push(
    fn().then(
      () => {
        passed++;
      },
      (e) => {
        failures.push(`${name}: ${e instanceof Error ? e.message : e}`);
      },
    ),
  );
}
function assert(c: unknown, m: string) {
  if (!c) throw new Error(m);
}
function throwsInput(fn: () => unknown, m: string) {
  try {
    fn();
  } catch (e) {
    if (e instanceof PostingInputError) return;
    throw new Error(`${m}: threw ${e} instead of PostingInputError`);
  }
  throw new Error(`${m}: did not throw`);
}
const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

check("P1 story period accepts 6/12/24/48h in hours, h-suffix or seconds, default 24h", () => {
  assert(parseActivePeriod(undefined) === 86400, "default");
  assert(parseActivePeriod("6") === 21600, "6");
  assert(parseActivePeriod("12h") === 43200, "12h");
  assert(parseActivePeriod(172800) === 172800, "seconds");
  throwsInput(() => parseActivePeriod("3"), "3h");
  throwsInput(() => parseActivePeriod("abc"), "abc");
});

check("P2 em and en dashes never reach a fan", () => {
  assert(cleanText("hey — text me – now", 100, "c") === "hey, text me, now", "dash strip");
  throwsInput(() => cleanText("x".repeat(11), 10, "c"), "over limit");
});

check("P3 links must be https or tg", () => {
  assert(checkUrl("https://t.me/x", "u") === "https://t.me/x", "https");
  throwsInput(() => checkUrl("http://x.com", "u"), "http");
  throwsInput(() => checkUrl("javascript:alert(1)", "u"), "js");
});

check("P4 buttons: flat list becomes one per row, rows kept, url-only", () => {
  const flat = parseButtons('[{"text":"a","url":"https://t.me/a"},{"text":"b","url":"https://t.me/b"}]')!;
  assert(flat.length === 2 && flat[0].length === 1, "flat → rows");
  const rows = parseButtons([[{ text: "a", url: "https://t.me/a" }, { text: "b", url: "https://t.me/b" }]])!;
  assert(rows.length === 1 && rows[0].length === 2, "rows kept");
  assert(parseButtons(undefined) === null, "none");
  throwsInput(() => parseButtons('[{"text":"a","url":"http://x"}]'), "http url");
  throwsInput(() => parseButtons('[{"text":"","url":"https://t.me/a"}]'), "empty text");
  throwsInput(() => parseButtons("not json"), "bad json");
});

check("P5 media kind from mime, name, or explicit", () => {
  assert(mediaKindFor("image/jpeg", "a.jpg") === "photo", "jpeg");
  assert(mediaKindFor("", "clip.MP4") === "video", "mp4 by name");
  assert(mediaKindFor("application/octet-stream", "x", "video") === "video", "explicit");
  throwsInput(() => mediaKindFor("application/pdf", "x.pdf"), "pdf");
});

check("P6 star price is 1..10000 whole", () => {
  assert(parseStarPrice("") === null, "blank");
  assert(parseStarPrice("250") === 250, "250");
  throwsInput(() => parseStarPrice("0"), "0");
  throwsInput(() => parseStarPrice("1.5"), "1.5");
  throwsInput(() => parseStarPrice("20000"), "20000");
});

check("P7 channel refs normalise, junk refused", () => {
  assert(normalizeChannelRef("mrscallace") === "@mrscallace", "bare");
  assert(normalizeChannelRef("https://t.me/alannapowvip") === "@alannapowvip", "link");
  assert(normalizeChannelRef("-1001234567890") === -1001234567890, "id");
  assert(normalizeChannelRef("") === null, "blank");
  throwsInput(() => normalizeChannelRef("a b"), "space");
});

check("P8 channel plan picks the right Bot API call", () => {
  assert(planChannelPost({ text: "hi", mediaKinds: [], hasButtons: true, starPrice: null }).method === "sendMessage", "text");
  assert(planChannelPost({ text: "", mediaKinds: ["video"], hasButtons: true, starPrice: null }).method === "sendVideo", "video");
  assert(planChannelPost({ text: "", mediaKinds: ["photo", "photo"], hasButtons: false, starPrice: null }).method === "sendMediaGroup", "album");
  assert(planChannelPost({ text: "", mediaKinds: ["photo"], hasButtons: true, starPrice: 200 }).method === "sendPaidMedia", "paid");
  throwsInput(() => planChannelPost({ text: "", mediaKinds: [], hasButtons: false, starPrice: null }), "empty");
  throwsInput(() => planChannelPost({ text: "", mediaKinds: ["photo", "photo"], hasButtons: true, starPrice: null }), "album+buttons");
  throwsInput(() => planChannelPost({ text: "x", mediaKinds: [], hasButtons: false, starPrice: 100 }), "paid no media");
  throwsInput(() => planChannelPost({ text: "x".repeat(1025), mediaKinds: ["photo"], hasButtons: false, starPrice: null }), "long caption");
});

check("P9 the targets route is read only, the write route only POSTs", () => {
  const t = src("../app/api/admin/v1/posting/targets/route.ts");
  assert(t.includes("withAdmin") && t.includes("export const GET") && !t.includes("export const POST"), "targets GET only");
  const w = src("../app/api/admin/v1/posting/write/route.ts");
  assert(w.includes("withAdmin") && w.includes("export const POST"), "write POST behind withAdmin");
});

check("P10 every posting action that reaches Telegram is audited, dry runs are not", () => {
  const w = src("../app/api/admin/v1/posting/write/route.ts");
  for (const a of ["posting:story", "posting:delete_story", "posting:channel_post", "posting:delete_channel_post"]) {
    assert(w.includes(`logAdminWrite("${a}"`), `${a} not audited`);
  }
});

check("P11 every send re-checks its target live, never from the targets cache", () => {
  const s = src("../lib/posting.ts");
  const story = s.slice(s.indexOf("export async function postStory"), s.indexOf("export async function deleteStory"));
  assert(story.includes("liveConnection(c)") && story.includes("canStories"), "postStory must re-check the connection and story right");
  const chan = s.slice(s.indexOf("export async function postToChannel"), s.indexOf("export async function deleteChannelPost"));
  assert(chan.includes("channelRights(c, ch.chatId)") && chan.includes("canPost"), "postToChannel must re-check bot admin rights");
});

check("P12 the bot token never leaves lib/posting.ts in a response or log", () => {
  const s = src("../lib/posting.ts");
  for (const k of ["token:", "bot_token:"]) {
    for (const fn of ["return {", "summary = {"]) {
      const i = s.indexOf(fn);
      assert(i === -1 || !s.slice(i, i + 200).includes(k), `${k} near ${fn}`);
    }
  }
  const w = src("../app/api/admin/v1/posting/write/route.ts");
  assert(!w.includes("token"), "write route must not touch a token");
});

check("P14 catalogue posts can only use the same girl's files, media route is read only", () => {
  const s = src("../lib/posting.ts");
  const fn = s.slice(s.indexOf("export async function mediaFromCatalogue"));
  assert(fn.includes("row.clone_id !== cloneId"), "mediaFromCatalogue must refuse another girl's row");
  const m = src("../app/api/admin/v1/posting/media/route.ts");
  assert(m.includes("withAdmin") && m.includes("export const GET") && !m.includes("export const POST"), "media GET only");
});

check("P15 the Posting page is operator only: every action guarded, route not open to agencies", () => {
  const a = src("../app/posting/actions.ts");
  const exported = [...a.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  assert(exported.length >= 5, "expected the posting actions");
  for (const name of exported) {
    const body = a.slice(a.indexOf(`export async function ${name}`));
    const g = body.indexOf(`await guardDashboardAction("app/posting/actions.ts#${name}"`);
    const r = body.indexOf("return");
    assert(g > 0 && (r === -1 || g < r), `${name} must call its guardDashboardAction before anything else`);
    // (scripts/check-lynq-management.tsx asserts it is the literal first statement, via the TS AST)
  }
  const policy = src("../lib/agency-policy.ts");
  assert(!policy.includes('"/posting"'), "agencyDashboardPath must not list /posting");
  const mgmt = src("../lib/agency-management.ts");
  assert(!mgmt.includes("app/posting/actions.ts"), "the agency action guard must not allow posting actions");
});

check("P16 brand channel bots come from app_settings or env, never from a request", () => {
  const s = src("../lib/posting.ts");
  const fn = s.slice(s.indexOf("async function brandBot"), s.indexOf("async function probeBrand"));
  assert(fn.includes("BRAND_CHANNELS.find") && fn.includes('from("app_settings")'), "brandBot must resolve from the fixed list");
});

check("P13 the recent-posts route is read only and gated", () => {
  const r = src("../app/api/admin/v1/posting/recent/route.ts");
  assert(r.includes("withAdmin") && r.includes("export const GET") && !r.includes("export const POST"), "recent GET only");
  const s = src("../lib/posting.ts");
  const fn = s.slice(s.indexOf("export async function listRecentPosts"));
  for (const w of [".insert(", ".update(", ".upsert(", ".delete("]) assert(!fn.includes(w), `listRecentPosts must not call ${w}`);
});


// ── story overlay (text, button and scrim burned into the photo) ─────────────
const throwsMsg = (fn: () => unknown, re: RegExp, m: string) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof PostingInputError && re.test(e.message)) return;
    throw new Error(`${m}: wrong error ${e instanceof Error ? e.message : e}`);
  }
  throw new Error(`${m}: did not throw`);
};

check("P17 overlay parsing: nothing is null, shorthand and full forms get every default", () => {
  assert(parseOverlay(undefined) === null && parseOverlay("") === null, "none");
  const o = parseOverlay({ caption: "new clips on my app", button: "OPEN MY APP" })!;
  assert(o.button!.label === "OPEN MY APP" && o.button!.background === "#FFFFFF" && o.button!.textColor === "#111111", "button defaults");
  assert(o.button!.shape === "pill" && o.button!.position === "bottom" && o.button!.arrow === true && o.button!.size === 50, "button defaults 2");
  assert(o.caption!.position === "bottom" && o.caption!.size === 62 && o.caption!.shadow === true && o.caption!.strokeWidth === 2, "caption defaults");
  assert(o.scrim === null, "no scrim unless asked");
  const full = parseOverlay(
    JSON.stringify({
      caption: { text: "hi", position: "top", size: 80, color: "#ff0", strokeColor: "#000", strokeWidth: 0, shadow: false },
      button: { label: "GO", position: "middle", size: 60, background: "#ff3b6b", textColor: "#fff", shape: "rounded", arrow: false },
      scrim: { position: "top", heightPct: 20, color: "#001122", opacity: 0.5 },
    }),
  )!;
  assert(full.caption!.color === "#FFFF00" && full.button!.background === "#FF3B6B" && full.button!.shape === "rounded", "colours normalised to #RRGGBB");
  assert(full.scrim!.position === "top" && full.scrim!.opacity === 0.5 && full.caption!.shadow === false, "full form");
  assert(parseOverlay({ scrim: true })!.scrim!.heightPct === 38, "scrim:true");
});

check("P18 overlay validation: colours, lengths, sizes, dashes, links, emoji, unknown keys all 400", () => {
  throwsMsg(() => parseOverlay({ button: { label: "GO", background: "red" } }), /hex colour/, "colour name");
  throwsMsg(() => parseOverlay({ button: { label: "GO", background: "#12345" } }), /hex colour/, "5 digit hex");
  throwsMsg(() => parseOverlay({ button: "X".repeat(25) }), /24/, "25 char label");
  throwsMsg(() => parseOverlay({ button: "" }), /empty/, "empty label");
  throwsMsg(() => parseOverlay({ caption: "x".repeat(121) }), /120/, "121 char caption");
  throwsMsg(() => parseOverlay({ caption: { text: "hi", size: 500 } }), /size/, "huge font");
  throwsMsg(() => parseOverlay({ caption: { text: "hi", size: 3 } }), /size/, "tiny font");
  throwsMsg(() => parseOverlay({ caption: { text: "hi", strokeWidth: 99 } }), /strokeWidth/, "huge stroke");
  throwsMsg(() => parseOverlay({ scrim: { opacity: 2 } }), /opacity/, "scrim opacity");
  throwsMsg(() => parseOverlay({ button: { label: "GO", shape: "star" } }), /shape/, "shape");
  throwsMsg(() => parseOverlay({ button: { label: "GO", position: "left" } }), /position/, "position");
  throwsMsg(() => parseOverlay({ buttons: "x" }), /unknown key/, "unknown top key");
  throwsMsg(() => parseOverlay({ button: { label: "GO", glow: true } }), /unknown key/, "unknown button key");
  throwsMsg(() => parseOverlay("not json"), /JSON/, "bad json");
  throwsMsg(() => parseOverlay({}), /needs a caption/, "empty overlay");
  throwsMsg(() => parseOverlay({ button: "GO \u{1F525}" }), /cannot draw/, "emoji");
  throwsMsg(() => parseOverlay({ button: "OPEN https://x.com" }), /link/, "https link in label");
  throwsMsg(() => parseOverlay({ button: "t.me/alanna" }), /link/, "t.me in label");
  throwsMsg(() => parseOverlay({ caption: "dm @alanna" }), /link/, "@name in caption");
  throwsMsg(() => parseOverlay({ caption: "see site.com" }), /link/, "domain in caption");
  throwsMsg(() => parseOverlay({ button: { label: "GO", background: "#FFFFFF", textColor: "#FAFAFA" } }), /unreadable/, "white on white");
  assert(parseOverlay({ caption: "new clips — now – here" })!.caption!.text === "new clips, now, here", "em/en dashes become commas");
  assert(parseHexColor("#abc", "c") === "#AABBCC", "short hex");
  assert(contrastRatio("#FFFFFF", "#000000") > 20 && contrastRatio("#FFFFFF", "#FFFFFF") === 1, "contrast math");
});

check("P19 overlay use: photos only, a button needs a link", () => {
  const spec = parseOverlay({ caption: "hi", button: "GO" })!;
  throwsMsg(() => checkOverlayUse(spec, { kind: "video", linkUrl: "https://t.me/x" }), /photos only/, "video");
  throwsMsg(() => checkOverlayUse(spec, { kind: "photo", linkUrl: null }), /needs linkUrl/, "button without link");
  checkOverlayUse(parseOverlay({ caption: "hi" }), { kind: "photo", linkUrl: null });
  checkOverlayUse(spec, { kind: "photo", linkUrl: "https://t.me/x" });
  checkOverlayUse(null, { kind: "video", linkUrl: null });
});

check("P20 link area: the exact button rectangle in Bot API percentages, centre based, never short", () => {
  const rect = { x: 289, y: 1670, w: 503, h: 120 };
  const a = overlayLinkArea(rect, 60, "https://t.me/x").position;
  const px = (pct: number, total: number) => (pct / 100) * total;
  const left = px(a.x_percentage, STORY_W) - px(a.width_percentage, STORY_W) / 2;
  const right = px(a.x_percentage, STORY_W) + px(a.width_percentage, STORY_W) / 2;
  const top = px(a.y_percentage, STORY_H) - px(a.height_percentage, STORY_H) / 2;
  const bottom = px(a.y_percentage, STORY_H) + px(a.height_percentage, STORY_H) / 2;
  assert(left <= rect.x + 1e-9 && rect.x - left < 0.5, `left ${left}`);
  assert(right >= rect.x + rect.w - 1e-9 && right - (rect.x + rect.w) < 0.5, `right ${right}`);
  assert(top <= rect.y + 1e-9 && rect.y - top < 0.5, `top ${top}`);
  assert(bottom >= rect.y + rect.h - 1e-9 && bottom - (rect.y + rect.h) < 0.5, `bottom ${bottom}`);
  assert(Math.abs(a.corner_radius_percentage - (60 / 1080) * 100) < 0.01, "radius is % of media WIDTH");
  assert(a.rotation_angle === 0, "no rotation");
  for (const v of [a.x_percentage, a.y_percentage, a.width_percentage, a.height_percentage]) assert(v > 0 && v < 100, "within 0-100");
  // far smaller than the old fixed 70% x 8% area
  assert(a.width_percentage < 70 && a.height_percentage < 8, "tighter than the default area");
  assert(overlayLinkArea(rect, 60, "tg://resolve?domain=x").type.url === "tg://resolve?domain=x", "url carried");
});

check("P21 layout math: the finished look (pill 1670-1790, caption 40px above, centred), slots, bounds", () => {
  const spec = parseOverlay({ caption: "new clips on my app", button: "OPEN MY APP" })!;
  const l = computeLayout(spec, { label: { w: 386, h: 36 }, caption: { w: 600, h: 54 } }, { button: 50, caption: 62 });
  const b = l.button!;
  const c = l.caption!;
  assert(b.h === 120 && b.y === 1670 && b.y + b.h === LAYOUT.bottomEdge, `pill y ${b.y} h ${b.h}`);
  assert(b.w === 386 + 2 * 60 && b.x === Math.round((STORY_W - b.w) / 2), "pill width = label + 60 padding each side, centred");
  assert(b.radius === 60, "pill radius is half the height");
  assert(c.y + c.h + LAYOUT.gap === b.y, "caption sits 40px above the pill");
  assert(c.x === Math.round((STORY_W - 600) / 2), "caption centred");
  assert(b.textY === b.y + Math.round((b.h - 36) / 2) && b.textX === b.x + 60, "label centred in the pill");
  assert(buttonHeight(50) === 120, "50px font gives the 120px pill");
  assert(layoutInBounds(l) === null, "in bounds");
  // slots
  const mid = computeLayout(parseOverlay({ button: { label: "GO", position: "middle" } })!, { label: { w: 80, h: 36 } }, {});
  assert(Math.abs(mid.button!.y + mid.button!.h / 2 - 960) <= 1, "middle slot is centred on the canvas");
  const top = computeLayout(parseOverlay({ caption: { text: "x", position: "top" } })!, { caption: { w: 100, h: 54 } }, {});
  assert(top.caption!.y === LAYOUT.topEdge, "top slot starts under the Telegram header");
  const split = computeLayout(parseOverlay({ caption: { text: "x", position: "top" }, button: "GO" })!, { label: { w: 80, h: 36 }, caption: { w: 100, h: 54 } }, {});
  assert(split.caption!.y === LAYOUT.topEdge && split.button!.y + split.button!.h === LAYOUT.bottomEdge, "caption and button in different slots do not stack");
  const sq = computeLayout(parseOverlay({ button: { label: "GO", shape: "square" } })!, { label: { w: 80, h: 36 } }, {});
  assert(sq.button!.radius === 6, "square keeps a 6px corner");
  const wide = computeLayout(spec, { label: { w: 1050, h: 36 }, caption: { w: 600, h: 54 } }, { button: 50, caption: 62 });
  assert(layoutInBounds(wide) !== null, "an over-wide button is reported");
  const scrim = computeLayout(parseOverlay({ scrim: { heightPct: 25 } })!, {}, {}).scrim!;
  assert(scrim.h === 480 && scrim.y === 1440, "scrim hugs the bottom edge");
});

check("P22 route and posting wiring: overlay parsed, area follows the button, preview is render only", () => {
  const w = src("../app/api/admin/v1/posting/write/route.ts");
  const story = w.slice(w.indexOf('case "story": {'), w.indexOf('case "story_preview"'));
  assert(story.includes('parseOverlay(b.get("overlay"))') && story.includes("overlay:"), "story passes the parsed overlay");
  const prev = w.slice(w.indexOf('case "story_preview"'), w.indexOf('case "delete_story"'));
  assert(prev.includes("previewStory(") && !prev.includes("logAdminWrite") && !prev.includes("postStory("), "story_preview renders only, no post, no audit");
  for (const bad of [".insert(", ".update(", ".upsert(", ".delete(", ".rpc("]) assert(!w.includes(bad), `route must not call ${bad}`);
  const s = src("../lib/posting.ts");
  const post = s.slice(s.indexOf("export async function postStory"), s.indexOf("export async function deleteStory"));
  assert(post.indexOf("checkOverlayUse(") > 0 && post.indexOf("checkOverlayUse(") < post.indexOf("cloneBot("), "overlay input rules run before any Telegram call");
  assert(post.includes("img.geometry?.linkArea ?? storyLinkArea("), "link area comes from the button geometry, default area otherwise");
  assert(post.indexOf("storyImage(r)") > 0 && post.indexOf("storyImage(r)") < post.indexOf('tg(c.token, "postStory"'), "overlay is rendered before the post");
  assert(post.indexOf("storyImage(r)") < post.indexOf("if (r.dryRun)"), "a dry run renders the real overlay too");
  assert(post.includes("previewOut(bytes"), "dry run can return the preview");
  const so = src("../lib/story-overlay.ts");
  assert(/const oob = layoutInBounds\(layout\);\s*if \(oob\) throw new PostingInputError/.test(so), "the renderer must refuse a layout that leaves the canvas");
  const prevFn = s.slice(s.indexOf("export async function previewStory"), s.indexOf("export async function postStory"));
  assert(!prevFn.includes("tg(") && !prevFn.includes("cloneBot(") && !prevFn.includes("liveConnection("), "previewStory never touches Telegram");
});

check("P23 channel button style: Telegram's blue/green/red only, aliases ok, other colours refused", () => {
  assert(parseButtonStyle(undefined) === undefined && parseButtonStyle("") === undefined, "none");
  assert(parseButtonStyle("Primary") === "primary" && parseButtonStyle("green") === "success" && parseButtonStyle("red") === "danger", "names and aliases");
  throwsMsg(() => parseButtonStyle("#FF0000"), /no other button colours/, "hex colour");
  throwsMsg(() => parseButtonStyle("purple"), /no other button colours/, "purple");
  const rows = parseButtons([{ text: "a", url: "https://t.me/a", style: "success" }, { text: "b", url: "https://t.me/b" }])!;
  assert(rows[0][0].style === "success" && !("style" in rows[1][0]), "style kept only when set");
  throwsInput(() => parseButtons([{ text: "a", url: "https://t.me/a", style: "#fff" }]), "bad style in buttons");
  assert(parsePreviewMode(undefined) === "none" && parsePreviewMode(true) === "base64" && parsePreviewMode("file") === "file", "preview mode");
  throwsInput(() => parsePreviewMode("png"), "bad preview mode");
});

check("P24 the font ships in public/fonts, which the Dockerfile copies into the alpine image", () => {
  assert(existsSync(fontFile()), "bundled TTF resolves");
  assert(fontFile().endsWith("LiberationSans-Bold.ttf"), "Liberation Sans Bold");
  assert(existsSync(new URL("../public/fonts/LiberationSans-LICENSE.txt", import.meta.url)), "licence shipped with the font");
  assert(src("../Dockerfile").includes("COPY --from=builder /app/public ./public"), "Dockerfile must copy public/ into the runner image");
});

// Rendering: synthetic flat grey photo (never a real person's picture).
const GREY = { r: 120, g: 120, b: 120 };
const photo = () => sharp({ create: { width: STORY_W, height: STORY_H, channels: 3, background: GREY } }).jpeg({ quality: 95 }).toBuffer();
async function raw(buf: Buffer) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, at: (x: number, y: number) => [data[(y * info.width + x) * 3], data[(y * info.width + x) * 3 + 1], data[(y * info.width + x) * 3 + 2]] };
}
const nearWhite = (p: number[]) => p.every((v) => v > 235);
const LINK = "https://t.me/alannapow";

acheck("R1 render: 1080x1920 JPEG under 10MB, finished-look geometry, drawn pixels", async () => {
  const r = await renderStoryOverlay(await photo(), parseOverlay({ caption: "new clips on my app", button: "OPEN MY APP" })!, { fit: true, linkUrl: LINK });
  const meta = await sharp(r.bytes).metadata();
  assert(meta.format === "jpeg" && meta.width === 1080 && meta.height === 1920, `format ${meta.format} ${meta.width}x${meta.height}`);
  assert(r.bytes.length < 10 * 1024 * 1024, "under the Telegram limit");
  const b = r.geometry.button!;
  assert(b.h === 120 && b.y === 1670, `pill y ${b.y} h ${b.h}`);
  assert(b.w > 440 && b.w < 580, `pill width ${b.w} should be near the finished look's 508`);
  assert(Math.abs(b.x + b.w / 2 - 540) <= 1, "pill centred");
  const px = await raw(r.bytes);
  // pill body (left of the label, inside the rounded ends) is white, top-left is untouched grey
  assert(nearWhite(px.at(b.x + 30, b.y + b.h / 2)), "pill body is white");
  const tl = px.at(5, 5);
  assert(Math.abs(tl[0] - GREY.r) <= 3, `top-left changed: ${tl}`);
  // label glyphs are dark somewhere inside the pill
  let dark = 0;
  for (let y = b.y + 20; y < b.y + b.h - 20; y++) for (let x = b.x + 60; x < b.x + b.w - 60; x++) if (px.at(x, y).every((v) => v < 90)) dark++;
  assert(dark > 400, `label text not drawn, ${dark} dark px`);
  // caption glyphs are white above the pill
  let white = 0;
  const c = r.geometry.caption!;
  for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) if (nearWhite(px.at(x, y))) white++;
  assert(white > 300, `caption not drawn, ${white} white px`);
  assert(c.y + c.h <= b.y - 30, "caption clear of the pill");
});

acheck("R2 the drawn pill and the tappable area line up to the pixel", async () => {
  const r = await renderStoryOverlay(await photo(), parseOverlay({ button: { label: "TEXT ME", background: "#FFFFFF" } })!, { fit: true, linkUrl: LINK });
  const px = await raw(r.bytes);
  const b = r.geometry.button!;
  // measure the white region on a row above the label (inside the pill's flat part)
  const y = b.y + b.h / 2 - 40 >= b.y + 20 ? b.y + 22 : b.y + Math.round(b.h / 2);
  let l = -1;
  let rr = -1;
  for (let x = 0; x < STORY_W; x++) if (nearWhite(px.at(x, y))) { if (l < 0) l = x; rr = x; }
  const cut = Math.round(b.radius - Math.sqrt(Math.max(0, b.radius ** 2 - (b.radius - 22) ** 2)));
  assert(Math.abs(l - (b.x + cut)) <= 3 && Math.abs(rr - (b.x + b.w - 1 - cut)) <= 3, `white spans ${l}-${rr}, rect says ${b.x + cut}-${b.x + b.w - 1 - cut}`);
  // vertical extent at the centre column
  const cx = b.x + 40;
  let t = -1;
  let bt = -1;
  for (let yy = 0; yy < STORY_H; yy++) if (nearWhite(px.at(cx, yy))) { if (t < 0) t = yy; bt = yy; }
  assert(Math.abs(t - b.y) <= 4 && Math.abs(bt - (b.y + b.h - 1)) <= 4, `white spans y ${t}-${bt}, rect ${b.y}-${b.y + b.h - 1}`);
  // the area sent to Telegram covers exactly that rectangle
  const a = r.geometry.linkArea!.position;
  const aL = ((a.x_percentage - a.width_percentage / 2) / 100) * STORY_W;
  const aR = ((a.x_percentage + a.width_percentage / 2) / 100) * STORY_W;
  const aT = ((a.y_percentage - a.height_percentage / 2) / 100) * STORY_H;
  const aB = ((a.y_percentage + a.height_percentage / 2) / 100) * STORY_H;
  assert(Math.abs(aL - b.x) < 1 && Math.abs(aR - (b.x + b.w)) < 1 && Math.abs(aT - b.y) < 1 && Math.abs(aB - (b.y + b.h)) < 1, `area ${aL},${aT},${aR},${aB} vs ${b.x},${b.y}`);
  assert(r.geometry.linkArea!.type.url === LINK, "area carries the link");
});

acheck("R3 colours, shape and slots are honoured", async () => {
  const r = await renderStoryOverlay(await photo(), parseOverlay({ button: { label: "GO", background: "#FF0000", textColor: "#FFFFFF", position: "top", shape: "square" } })!, { fit: true, linkUrl: LINK });
  const b = r.geometry.button!;
  assert(b.y === LAYOUT.topEdge && b.radius === 6, "top slot, square corner");
  const px = await raw(r.bytes);
  const p = px.at(b.x + 12, b.y + 12);
  assert(p[0] > 240 && p[1] < 20 && p[2] < 20, `button background should be red, got ${p}`);
  const sq = px.at(b.x + 3, b.y + 3);
  assert(sq[0] > 200 && sq[1] < 60, `a square button has a filled corner, got ${sq}`);
});

acheck("R4 caption only: no button, no pill, default link area stays the caller's", async () => {
  const r = await renderStoryOverlay(await photo(), parseOverlay({ caption: { text: "hi there", color: "#FF0000", strokeColor: "#000000" } })!, { fit: true, linkUrl: null });
  assert(r.geometry.button === null && r.geometry.linkArea === null, "no button geometry");
  const px = await raw(r.bytes);
  let white = 0;
  for (let y = 1500; y < STORY_H; y++) for (let x = 0; x < STORY_W; x += 2) if (nearWhite(px.at(x, y))) white++;
  assert(white === 0, `a caption-only overlay drew ${white} white pixels`);
});

acheck("R5 long text shrinks to fit, absurd text is refused, nothing leaves the canvas", async () => {
  const img = await photo();
  const r = await renderStoryOverlay(img, parseOverlay({ button: { label: "WWWWWWWWWWWWWWWWWWWWWWWW", size: 90 } })!, { fit: true, linkUrl: LINK });
  const b = r.geometry.button!;
  assert(b.fontPx < 90 && b.w <= LAYOUT.maxButtonW, `button should shrink, font ${b.fontPx} width ${b.w}`);
  const cap = await renderStoryOverlay(img, parseOverlay({ caption: { text: "a ".repeat(55).trim(), size: 120 } })!, { fit: true, linkUrl: null });
  assert(cap.geometry.caption!.fontPx < 120 && cap.geometry.caption!.w <= LAYOUT.maxCaptionW, "caption shrinks and wraps");
  let threw = false;
  try {
    await renderStoryOverlay(img, parseOverlay({ button: { label: "W".repeat(24), size: 90 } })!, { fit: true, linkUrl: LINK }).then((x) => {
      if (x.geometry.button!.w > LAYOUT.maxButtonW) throw new Error("overflow");
    });
  } catch (e) {
    threw = e instanceof Error && e.message === "overflow";
  }
  assert(!threw, "never wider than 90% of the story");
});

acheck("R6 same input gives identical bytes, scrim darkens only its own edge", async () => {
  const img = await photo();
  const spec = parseOverlay({ caption: "x", button: "GO", scrim: { opacity: 0.8, heightPct: 30 } })!;
  const a = await renderStoryOverlay(img, spec, { fit: true, linkUrl: LINK });
  const b = await renderStoryOverlay(img, spec, { fit: true, linkUrl: LINK });
  assert(a.bytes.equals(b.bytes), "deterministic");
  const px = await raw(a.bytes);
  assert(px.at(5, 1915)[0] < 60, `bottom corner should be dark, got ${px.at(5, 1915)}`);
  assert(Math.abs(px.at(5, 100)[0] - GREY.r) <= 3, "top of the photo untouched by a bottom scrim");
  const mid = px.at(5, 1920 - 576 + 60)[0];
  assert(mid > px.at(5, 1915)[0] && mid <= GREY.r, "the scrim fades, it is a gradient");
});

acheck("R7 fit=false needs an exact 1080x1920 image, fit=true crops anything", async () => {
  const small = await sharp({ create: { width: 400, height: 300, channels: 3, background: GREY } }).jpeg().toBuffer();
  const spec = parseOverlay({ caption: "hi" })!;
  let msg = "";
  try {
    await renderStoryOverlay(small, spec, { fit: false, linkUrl: null });
  } catch (e) {
    msg = e instanceof PostingInputError ? e.message : `wrong error ${e}`;
  }
  assert(/exact 1080x1920/.test(msg), `fit=false on a small image: "${msg}"`);
  const ok = await renderStoryOverlay(small, spec, { fit: true, linkUrl: null });
  assert((await sharp(ok.bytes).metadata()).width === 1080, "cropped to 1080");
  const exact = await renderStoryOverlay(await photo(), spec, { fit: false, linkUrl: null });
  assert((await sharp(exact.bytes).metadata()).height === 1920, "exact image passes with fit=false");
});

void (async () => {
  await Promise.all(pending);
  const total = passed + failures.length;
  if (failures.length) {
    console.error(`\n  ${failures.length} of ${total} POSTING CHECKS FAILED\n`);
    for (const f of failures) console.error(`  ✗ ${f}\n`);
    process.exit(1);
  }
  console.log(`\n  ALL ${total} POSTING CHECKS PASSED\n`);
})();
