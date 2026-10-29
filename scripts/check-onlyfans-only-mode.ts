// OnlyFans-only mode checks (TWIN_APP_MODE=onlyfans).
//
// Offline: pure functions, the real middleware called with synthetic requests,
// and source assertions. Nothing contacts Supabase, the OnlyFans backend or a
// server. It proves, with the variable set:
//   - the nav has no Telegram entry and the channel switch is not offered;
//   - Telegram pages redirect to the OnlyFans home and Telegram APIs 404;
//   - OnlyFans, sign-in and permission routes still pass;
// and with the variable unset: the middleware behaves exactly as before.
//
// Run: npm run test:onlyfans-only

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { ONLYFANS_CHANNEL, shouldShowChannelSwitch } from "../lib/channel-nav";
import { isOnlyFansOnly, onlyFansOnlyVerdict, ONLYFANS_ONLY_HOME, ONLYFANS_ONLY_CREATOR_HOME } from "../lib/app-mode";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (file: string) => readFileSync(join(root, file), "utf8");
let checks = 0, failures = 0;
function check(name: string, ok: boolean, detail = "") {
  checks++;
  if (ok) console.log("  ok   " + name);
  else { failures++; console.log("  FAIL " + name + (detail ? "  " + detail : "")); }
}

// ── 1. The switch itself ────────────────────────────────────────────────
console.log("mode switch");
check("unset env is off", !isOnlyFansOnly({}));
check("other values are off", !isOnlyFansOnly({ TWIN_APP_MODE: "telegram" }) && !isOnlyFansOnly({ TWIN_APP_MODE: "" }) && !isOnlyFansOnly({ TWIN_APP_MODE: "1" }));
check("onlyfans is on (case and space tolerant)", isOnlyFansOnly({ TWIN_APP_MODE: "onlyfans" }) && isOnlyFansOnly({ TWIN_APP_MODE: " OnlyFans " }));
check("variable is server-side, never NEXT_PUBLIC", !/NEXT_PUBLIC_TWIN_APP_MODE/.test(src("lib/app-mode.ts") + src("middleware.ts") + src("app/layout.tsx")));

// ── 2. Route verdicts ───────────────────────────────────────────────────
console.log("route verdicts (mode on)");
const telegramPages = ["/dashboard", "/overview", "/revenue", "/clones", "/clones/0a1b2c3d-0a1b-0a1b-0a1b-0a1b2c3d4e5f", "/users", "/media", "/flows", "/business", "/telegram",
  "/payouts", "/mtproto-campaign", "/campaigns", "/crm", "/crm/platforms", "/settings", "/drip", "/sequences", "/posting", "/catalogue-funnel", "/miniapp-rollout",
  "/storage", "/logs", "/jarvis", "/ai", "/tsocial", "/tracker", "/agency-admin", "/agency/creators", "/agency/creator-invites", "/agency/setup", "/fans", "/moxy", "/link", "/sim", "/bot-v2"];
for (const path of telegramPages) {
  const v = onlyFansOnlyVerdict(path, true);
  check(`page ${path} redirects home`, v.kind === "redirect" && v.to === ONLYFANS_ONLY_HOME, JSON.stringify(v));
}
check("/ redirects to the OnlyFans home", JSON.stringify(onlyFansOnlyVerdict("/", true)) === JSON.stringify({ kind: "redirect", to: ONLYFANS_ONLY_HOME }));
const telegramApis = ["/api/dashboard", "/api/users/live", "/api/payouts", "/api/business-account", "/api/business-connection", "/api/catalogue/abc", "/api/combined-earnings",
  "/api/agency-overview", "/api/admin/v1/mtproto/runs", "/api/admin/v1/clones", "/api/v1/revenue", "/api/ai-assistant", "/api/compile", "/api/media-sign", "/api/avatar", "/api/voice", "/api/models", "/api/sim/run"];
for (const path of telegramApis) check(`api ${path} is 404`, onlyFansOnlyVerdict(path, false).kind === "notfound");
check("non-GET to a Telegram page is 404", onlyFansOnlyVerdict("/clones", false).kind === "notfound");
check("server action on a Telegram page is 404", onlyFansOnlyVerdict("/users", false).kind === "notfound");
check("creator Telegram pages go to the creator OnlyFans page", ["/creator", "/creator/payouts", "/creator/ppvs", "/creator/business", "/creator/edit", "/creator/onboarding", "/creator/earnings"]
  .every(p => { const v = onlyFansOnlyVerdict(p, true); return v.kind === "redirect" && v.to === ONLYFANS_ONLY_CREATOR_HOME; }));
const ofPaths = ["/onlyfans", "/onlyfans/overview", "/onlyfans/inbox", "/onlyfans/accounts", "/onlyfans/content", "/onlyfans/sales", "/onlyfans/campaigns", "/onlyfans/settings", "/onlyfans/operations",
  "/onlyfans/launch", "/onlyfans/launch/automation", "/onlyfans/launch/memory",
  "/api/onlyfans/accounts", "/api/onlyfans/earnings", "/api/onlyfans/accounts/a1/conversations/c1/handover",
  "/api/onlyfans-content/accounts/a1/vault", "/api/onlyfans-content/accounts/a1/vault/manage/folders", "/api/onlyfans-campaigns/accounts/a1/campaigns",
  "/api/onlyfans-controls/accounts/a1/conversations/c1", "/api/onlyfans-configuration/accounts/a1", "/api/onlyfans-connections/accounts", "/api/onlyfans-connections/creators/x/sign-in",
  "/api/onlyfans-launch/automation/accounts/a1/settings", "/api/onlyfans-launch/memory/accounts/a1/fans/1",
  "/api/channel-roster", "/api/fx", "/api/health"];
for (const path of ofPaths) check(`${path} is allowed`, onlyFansOnlyVerdict(path, path.startsWith("/api/") ? false : true).kind === "allow");
const signIn = ["/twin", "/login", "/admin-auth", "/agency/login", "/agency/auth", "/agency/logout", "/agency/clone-scope", "/agency/join", "/agency/join/accept", "/agency/team",
  "/creator/login", "/creator/signup", "/creator/platforms", "/creator/onlyfans/inbox", "/creator-auth/login", "/creator-auth/logout", "/creator-auth/platforms", "/creator-auth/platforms/onlyfans/sign-in",
  "/creator-auth/onlyfans/accounts", "/admin/view-as", "/brand/logo.png", "/icon.png"];
for (const path of signIn) check(`${path} (sign-in, permissions, static) is allowed`, onlyFansOnlyVerdict(path, true).kind === "allow", path);
check("creator Telegram uploads are not allowed", ["/creator-auth/upload", "/creator-auth/ppv-upload", "/creator-auth/files", "/creator-auth/onboarding"].every(p => onlyFansOnlyVerdict(p, false).kind === "notfound"));
check("a look-alike prefix is not allowed", onlyFansOnlyVerdict("/onlyfansx", true).kind === "redirect" && onlyFansOnlyVerdict("/api/onlyfansx/y", false).kind === "notfound" && onlyFansOnlyVerdict("/catalogue/a.png", true).kind === "redirect");

// ── 3. Navigation ───────────────────────────────────────────────────────
console.log("navigation (mode on)");
check("channel switch not offered with only the onlyfans channel", !shouldShowChannelSwitch(["onlyfans"]));
check("every OnlyFans nav entry stays inside /onlyfans", ONLYFANS_CHANNEL.nav.every(item => item.href.startsWith("/onlyfans/")));
check("no nav entry mentions Telegram", ONLYFANS_CHANNEL.nav.every(item => !/telegram/i.test(item.label + (item.note ?? "") + item.href)));
check("nav keeps Today, Inbox, Creators, Content, Earnings, Campaigns, Settings", ["Today", "Inbox", "Creators", "Content", "Earnings", "Campaigns", "Settings"].every(l => ONLYFANS_CHANNEL.nav.some(item => item.label === l)));
check("every nav entry is allowed by the route policy", ONLYFANS_CHANNEL.nav.every(item => onlyFansOnlyVerdict(item.href, true).kind === "allow"));
const layout = src("app/layout.tsx"), sidebar = src("components/Sidebar.tsx"), topbar = src("components/TopBar.tsx");
check("layout offers only the onlyfans channel in this mode", /ofOnly \? \{ \.\.\.resolvedScope, allowed: \["onlyfans"\]/.test(layout));
check("layout reads the mode on the server and passes it down as a prop", /isOnlyFansOnly\(\)/.test(layout) && /onlyFansOnly=\{ofOnly\}/.test(layout));
check("layout skips the Telegram header total and the changelog popup in this mode", /ofOnly \? Promise\.resolve\(0\) : getHeaderAllTimeStars/.test(layout) && /!agency && !ofOnly && <TwinUpdatePopup/.test(layout));
check("sidebar draws the OnlyFans nav for the operator in this mode", /onlyFansOnly && !isCreator \? "onlyfans"/.test(sidebar));
check("top bar withholds Telegram totals in this mode", /!combined && !onlyFansOnly \?/.test(topbar));
check("no client component reads the env var", !/process\.env\.TWIN_APP_MODE|isOnlyFansOnly\(/.test(sidebar + topbar + src("components/ChannelSwitch.tsx") + src("components/MobileMenu.tsx") + src("components/DashboardAccessProvider.tsx")));
check("creator platform page hides the Telegram card in this mode", /\{!onlyFansOnly && <section className=\{styles\.card\} data-platform-telegram>/.test(src("components/creator-platforms/CreatorPlatforms.tsx")));

// ── 4. The real middleware, with and without the variable ───────────────
async function run(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  const { middleware } = await import("../middleware");
  const response = await middleware(new NextRequest(new URL(path, "http://localhost:3010"), init));
  return { status: response.status, location: response.headers.get("location"), passed: response.headers.get("x-middleware-next") === "1" };
}
async function main() {
const MODE = process.env.TWIN_APP_MODE;
(process.env as Record<string, string | undefined>).NODE_ENV = "development"; // the dev bypass keeps these runs offline
console.log("middleware, TWIN_APP_MODE=onlyfans");
process.env.TWIN_APP_MODE = "onlyfans";
{
  const home = await run("/");
  check("/ -> 307 to the OnlyFans home", home.status === 307 && !!home.location?.endsWith(ONLYFANS_ONLY_HOME), JSON.stringify(home));
  for (const path of ["/revenue", "/clones", "/users", "/dashboard", "/mtproto-campaign", "/campaigns", "/telegram"]) {
    const r = await run(path);
    check(`${path} -> redirect to the OnlyFans home`, r.status === 307 && !!r.location?.endsWith(ONLYFANS_ONLY_HOME), JSON.stringify(r));
  }
  for (const path of ["/api/dashboard", "/api/users/live", "/api/v1/revenue", "/api/admin/v1/clones", "/api/combined-earnings"]) {
    const r = await run(path);
    check(`${path} -> 404`, r.status === 404, JSON.stringify(r));
  }
  const post = await run("/revenue", { method: "POST" });
  check("POST /revenue -> 404", post.status === 404, JSON.stringify(post));
  for (const path of ["/onlyfans/inbox", "/onlyfans/overview", "/api/onlyfans/accounts", "/api/fx"]) {
    const r = await run(path);
    check(`${path} passes through`, r.passed && r.status === 200, JSON.stringify(r));
  }
}
console.log("middleware, TWIN_APP_MODE unset (nothing changed)");
delete process.env.TWIN_APP_MODE;
{
  for (const path of ["/", "/revenue", "/clones", "/users", "/dashboard", "/api/dashboard", "/onlyfans/inbox"]) {
    const r = await run(path);
    check(`${path} is not touched by the mode (no redirect, no 404)`, r.passed && r.status === 200, JSON.stringify(r));
  }
  check("channel switch and all three channels still offered", shouldShowChannelSwitch(["all", "telegram", "onlyfans"]));
  check("layout keeps channelScope.allowed when the mode is off", /: resolvedScope;/.test(layout) && /channels=\{channelScope\.allowed\}/.test(layout));
}
process.env.TWIN_APP_MODE = "telegram";
check("an unrecognised value changes nothing", (await run("/revenue")).passed);
if (MODE === undefined) delete process.env.TWIN_APP_MODE; else process.env.TWIN_APP_MODE = MODE;
}
main().then(() => {
  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures) process.exit(1);
}, error => { console.error(error); process.exit(1); });
