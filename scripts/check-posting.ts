// Offline checks for the posting API (app/api/admin/v1/posting/*).
// No network, no database: lib/posting-validate.ts is pure, and the route
// files are read as source to pin the safety properties.
import { readFileSync } from "node:fs";
import {
  PostingInputError,
  cleanText,
  checkUrl,
  mediaKindFor,
  normalizeChannelRef,
  parseActivePeriod,
  parseButtons,
  parseStarPrice,
  planChannelPost,
} from "../lib/posting-validate";

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

check("P13 the recent-posts route is read only and gated", () => {
  const r = src("../app/api/admin/v1/posting/recent/route.ts");
  assert(r.includes("withAdmin") && r.includes("export const GET") && !r.includes("export const POST"), "recent GET only");
  const s = src("../lib/posting.ts");
  const fn = s.slice(s.indexOf("export async function listRecentPosts"));
  for (const w of [".insert(", ".update(", ".upsert(", ".delete("]) assert(!fn.includes(w), `listRecentPosts must not call ${w}`);
});

const total = passed + failures.length;
if (failures.length) {
  console.error(`\n  ${failures.length} of ${total} POSTING CHECKS FAILED\n`);
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  process.exit(1);
}
console.log(`\n  ALL ${total} POSTING CHECKS PASSED\n`);
