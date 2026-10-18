// Channel-integration checks.
//
// The OF-D0 contract checks prove the fixture frontend's behaviour. These prove
// the step that put the channel workspaces into the *real* app, and the two
// boundaries that came with it:
//
//   1. the routes exist, and each one declares its own channel rather than
//      leaving the channel to be inferred three times in the browser;
//   2. the server decides who may open a workspace, and a session that may not
//      is refused at the route;
//   3. the switch offers only what the server allowed, and renders nothing at
//      all when there is nothing to switch to;
//   4. every navigation entry points at a route that actually exists, so the
//      sidebar cannot offer a screen that is not there;
//   5. the isolated preview cannot reach the live sign-out action;
//   6. Telegram's existing routes and the existing agency route policy are
//      unchanged.
//
// Everything here is offline: source assertions, pure functions and route-file
// existence. Nothing contacts a provider, a database or a running server.
//
// Run: npm run test:channel-integration

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALL_CHANNELS,
  CHANNELS,
  ONLYFANS_CHANNEL,
  TELEGRAM_CHANNEL,
  channelDefinition,
  channelForPath,
  offeredChannels,
  shouldShowChannelSwitch,
} from "../lib/channel-nav";
import { allowedChannels, channelAccess, channelVerdict } from "../lib/channel-scope";
import { agencyDashboardPath } from "../lib/agency-policy";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

let checks = 0;
let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  checks += 1;
  if (condition) {
    console.log("  ok   " + name);
  } else {
    failures += 1;
    console.log("  FAIL " + name + (detail ? "\n       " + detail : ""));
  }
}

function group(name: string) {
  console.log("\n" + name);
}

function source(relative: string): string {
  const path = join(repoRoot, relative);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/**
 * Whether the app serves this path.
 *
 * A literal `page.tsx` is the usual answer, but a section can also be served by
 * a dynamic sibling — the three planned OnlyFans stages are one `[section]`
 * route, not three files — so the dynamic forms count too. Anything else is a
 * link to nowhere.
 */
function routeExists(href: string): boolean {
  const trimmed = href.replace(/^\//, "").replace(/\/$/, "");
  if (!trimmed) return existsSync(join(repoRoot, "app", "page.tsx"));
  const segments = trimmed.split("/");
  const parent = segments.slice(0, -1);
  const candidates = [
    join(repoRoot, "app", ...segments, "page.tsx"),
    join(repoRoot, "app", ...parent, "[section]", "page.tsx"),
    join(repoRoot, "app", ...parent, "[slug]", "page.tsx"),
    join(repoRoot, "app", ...parent, "[...slug]", "page.tsx"),
  ];
  return candidates.some((candidate) => existsSync(candidate));
}

// ── 1. The routes exist and declare their channel ─────────────────────────

group("1. The channel workspaces are real routes in the real app");
{
  const routes = [
    "/overview",
    "/telegram",
    "/onlyfans/inbox",
    "/onlyfans/accounts",
    "/onlyfans/content",
    "/onlyfans/sales",
    "/onlyfans/settings",
  ];

  // The four OnlyFans routes are gated by their segment layout: one gate that a
  // new OnlyFans screen cannot avoid inheriting.
  const onlyFansLayout = source("app/onlyfans/layout.tsx");
  check(
    "the OnlyFans segment declares its channel and gates on it",
    /requireChannel\("onlyfans"\)/.test(onlyFansLayout),
    'app/onlyfans/layout.tsx must call requireChannel("onlyfans")',
  );
  check(
    "the OnlyFans gate sits in the layout, not repeated per page",
    !source("app/onlyfans/inbox/page.tsx").includes("requireChannel") &&
      !source("app/onlyfans/accounts/page.tsx").includes("requireChannel"),
    "the segment layout already refuses before any child renders",
  );

  for (const href of routes) {
    check(
      "app" + href + "/page.tsx exists",
      routeExists(href),
      href,
    );
  }

  const overview = source("app/overview/page.tsx");
  check(
    "the combined overview is gated as an operator surface",
    /requireOperatorSurface\(\)/.test(overview),
    "the All-channels surface is new, so it cannot borrow the existing dashboard's allowance",
  );
  check(
    "/telegram declares the Telegram channel",
    /requireChannel\("telegram"\)/.test(source("app/telegram/page.tsx")),
  );
  check(
    "the planned OnlyFans sections are an allow-list, not a catch-all",
    /notFound\(\)/.test(source("app/onlyfans/[section]/page.tsx")),
    "an unknown section must 404 rather than render a blank planned screen",
  );

  // The routes compose the same surfaces the preview does, so the two cannot
  // drift into two designs.
  check(
    "the routes render the shared workspace rather than a second one",
    /components\/onlyfans-preview\/OnlyFansWorkspace/.test(source("app/onlyfans/inbox/page.tsx")) &&
      /components\/onlyfans-preview\/OnlyFansWorkspace/.test(source("app/onlyfans/accounts/page.tsx")),
  );
  check("the All-channels surface uses the operator-gated combined earnings owner", /CombinedEarnings/.test(overview) && /requireOperatorSurface/.test(overview));
}

// ── 2. The server decides the scope ───────────────────────────────────────

group("2. The server derives the channel scope, and gates on it");
{
  const operator = channelAccess({ hasAgency: false, hasViewAs: false });
  const agency = channelAccess({ hasAgency: true, hasViewAs: false });
  const viewing = channelAccess({ hasAgency: false, hasViewAs: true });

  check("an internal operator is an operator", operator.isOperator);
  check("an agency identity is not treated as the internal operator", !agency.isOperator);
  check("a view-as session is never an operator", !viewing.isOperator);

  check("All channels is allowed for every session", channelVerdict("all", agency).allowed);
  check("only an operator may open the OnlyFans workspace", channelVerdict("onlyfans", operator).allowed);
  check("an agency is refused the OnlyFans workspace", !channelVerdict("onlyfans", agency).allowed);
  check("a view-as session is refused the OnlyFans workspace", !channelVerdict("onlyfans", viewing).allowed);
  check("only an operator may open the Telegram workspace", channelVerdict("telegram", operator).allowed);
  check("an agency is refused the Telegram workspace", !channelVerdict("telegram", agency).allowed);
  check(
    "a refusal carries a reason rather than being silent",
    channelVerdict("onlyfans", agency).reason.includes("operator"),
  );

  const operatorScope = allowedChannels(operator);
  const agencyScope = allowedChannels(agency);
  check("the operator scope is all three channels", operatorScope.length === 3);
  check(
    "the non-operator scope is the existing dashboard only",
    agencyScope.length === 1 && agencyScope[0] === "all",
    agencyScope.join(","),
  );

  // The channel of a request is derived from middleware's header, which the
  // server sets — not from anything the browser sends.
  const scopeSource = source("lib/channel-scope.ts");
  check(
    "the scope is read from the request, not from the client",
    /get\("x-pathname"\)/.test(scopeSource),
    "lib/channel-scope.ts must resolve the path from x-pathname",
  );
  check(
    "the scope is resolved from the verified identity",
    /getDashboardAccess\(\)/.test(scopeSource) && /getViewAsBannerInfo\(\)/.test(scopeSource),
  );

  // A route served at a path belonging to another channel is a mismatch, not a
  // silent success.
  check(
    "a route asserts its path agrees with the channel it declared",
    /scope\.channel !== declared/.test(scopeSource) && /notFound\(\)/.test(scopeSource),
  );
  check("the channel mapping is unchanged for the existing dashboard", channelForPath("/revenue") === "all");
  check("the OnlyFans prefix maps to the OnlyFans channel", channelForPath("/onlyfans/accounts") === "onlyfans");
  check("the Telegram route maps to the Telegram channel", channelForPath("/telegram") === "telegram");
  check(
    "the layout passes the server's scope into the shell",
    /resolveChannelScope\(/.test(source("app/layout.tsx")) &&
      /channels=\{channelScope\.allowed\}/.test(source("app/layout.tsx")),
  );
}

// ── 3. Navigation gating ──────────────────────────────────────────────────

group("3. The switch offers only what the server allowed");
{
  check(
    "an operator is offered all three channels, in display order",
    offeredChannels(allowedChannels(channelAccess({ hasAgency: false, hasViewAs: false })))
      .map((entry) => entry.channel)
      .join(",") === "all,telegram,onlyfans",
  );
  check(
    "a session with no workspace is offered only the existing dashboard",
    offeredChannels(allowedChannels(channelAccess({ hasAgency: true, hasViewAs: false }))).length === 1,
  );
  check(
    "the offered order is canonical, not the caller's order",
    offeredChannels(["onlyfans", "all", "telegram"]).map((entry) => entry.channel).join(",") ===
      "all,telegram,onlyfans",
  );
  check("two channels are enough to be worth a switch", shouldShowChannelSwitch(["all", "telegram"]));
  check(
    "a single option renders no switch at all",
    !shouldShowChannelSwitch(["all"]) && !shouldShowChannelSwitch([]),
    "a one-option segmented control is a control that does nothing",
  );
  check(
    "the switch component filters through the shared rule",
    /offeredChannels\(/.test(source("components/ChannelSwitch.tsx")) &&
      /shouldShowChannelSwitch\(/.test(source("components/ChannelSwitch.tsx")),
  );
  check(
    "an omitted scope defaults to no switch rather than all channels",
    /channels = \["all"\]/.test(source("components/MobileMenu.tsx")) &&
      /channels \?\? \["all"\]/.test(source("components/ChannelSwitch.tsx")),
    "forgetting the prop must not hand a channel workspace to a surface that should not have one",
  );
  check(
    "the creator workspace shell offers no channel switch",
    !/channels=\{/.test(source("components/CreatorWorkspaceShell.tsx")),
  );

  // Every link the sidebar can render must go somewhere that exists.
  for (const channel of CHANNELS) {
    for (const item of channel.nav) {
      if (item.availability === "planned") continue;
      check(
        'the ' + channel.channel + ' entry "' + item.key + '" points at a real route',
        routeExists(item.href),
        item.href,
      );
    }
  }
  check(
    "planned entries also point at routes that exist",
    ONLYFANS_CHANNEL.nav
      .filter((item) => item.availability === "planned")
      .every((item) => routeExists(item.href)),
    "a bookmarked planned section answers honestly instead of 404ing",
  );
  check(
    "the planned entries are still inert in the navigation",
    /item\.availability === "planned"/.test(source("components/Sidebar.tsx")),
  );
}

// ── 4. Preview logout isolation ───────────────────────────────────────────

group("4. The isolated preview cannot reach the live sign-out");
{
  const topBar = source("components/TopBar.tsx");
  const signOutButton = source("components/SignOutButton.tsx");
  const previewLayout = source("preview/onlyfans/app/layout.tsx");

  check(
    "the top bar no longer imports the login action",
    !/app\/login\/actions/.test(topBar),
    "the live action arriving through TopBar is what put it in the preview's module graph",
  );
  check(
    "the top bar still routes agency and creator sign-out through their own portals",
    /isAgency \? "\/agency\/logout"/.test(topBar) && /"\/creator-auth\/logout"/.test(topBar),
  );
  check(
    "the signed-in action arrives as a prop from the server layout",
    /signOutAction\?:/.test(topBar) && /signOutAction=\{logout\}/.test(source("app/layout.tsx")),
  );
  check(
    "the sign-out markup itself imports no server action",
    !signOutButton.includes("app/login") && !signOutButton.includes('"@/app/'),
    "the button must be pure markup: the live form supplies the action",
  );
  check(
    "the simulated control is disabled and labelled rather than merely hidden",
    /data-of-signout=/.test(signOutButton) && /disabled=\{simulated/.test(signOutButton),
  );
  check("the preview asks for the simulated control", /signOut="simulated"/.test(previewLayout));
  check(
    "the dashboard does not ask for it",
    !/signOut="simulated"/.test(source("app/layout.tsx")) &&
      !/signOut="simulated"/.test(source("components/CreatorWorkspaceShell.tsx")),
  );
  check(
    "the preview demonstrates the channels explicitly rather than by default",
    /PREVIEW_CHANNELS/.test(previewLayout) && /channels=\{PREVIEW_CHANNELS\}/.test(previewLayout),
  );
}

// ── 5. Telegram and agency access preserved ───────────────────────────────

group("5. Telegram's routes and the agency policy are unchanged");
{
  // The existing Telegram surfaces the channel links to are still the shipped
  // routes, and the Telegram channel reproduces none of them.
  for (const href of ["/users", "/flows", "/media", "/business", "/revenue", "/clones"]) {
    check("the existing route " + href + " still exists", routeExists(href));
  }
  const telegramPage = source("app/telegram/page.tsx");
  check("the Telegram channel points at /users rather than rebuilding it", /route="\/users"/.test(telegramPage));
  check(
    "the Telegram channel does not import or fork the Fans screen",
    !/app\/users/.test(telegramPage) && !/from "@\/app\//.test(telegramPage),
  );
  check(
    "the Telegram channel nav lists existing routes only",
    TELEGRAM_CHANNEL.nav.every((item) => item.availability === "existing"),
  );

  // The new workspace routes must not have widened agency access: the existing
  // agency policy still refuses them and still allows today's routes.
  for (const path of ["/overview", "/telegram", "/onlyfans/inbox", "/onlyfans/accounts"]) {
    check("agency policy still refuses " + path, !agencyDashboardPath(path, "Lynq", true), path);
    check("agency policy refuses " + path + " for a non-managing agency too", !agencyDashboardPath(path, "Moxy", false));
  }
  for (const path of ["/", "/revenue", "/users", "/media", "/flows", "/business", "/analytics", "/sales-health"]) {
    check("agency policy still allows " + path, agencyDashboardPath(path, "Lynq", true), path);
  }
  check(
    "agency sessions cannot enter any native OnlyFans section",
    ["/onlyfans/content", "/onlyfans/campaigns", "/onlyfans/settings", "/onlyfans/operations"].every(path => ["Lynq", "Moxy", "Twin", "FLIRT"].every(name => !agencyDashboardPath(path, name, true) && !agencyDashboardPath(path, name, false))),
  );

  // Channel definitions stay coherent: `all` is the existing dashboard, and each
  // channel's landing href belongs to that channel.
  check("All channels lands on /overview", ALL_CHANNELS.href === "/overview");
  check("the OnlyFans channel lands in its own inbox", ONLYFANS_CHANNEL.href === "/onlyfans/inbox");
  check("the Telegram channel lands on its own route", TELEGRAM_CHANNEL.href === "/telegram");
  for (const channel of CHANNELS) {
    check(
      "the " + channel.channel + " landing route belongs to the " + channel.channel + " channel",
      channelForPath(channel.href) === channel.channel,
      channel.href + " resolves to " + channelForPath(channel.href),
    );
    check(
      'channelDefinition("' + channel.channel + '") is the same object',
      channelDefinition(channel.channel) === channel,
    );
  }
}

// ── Summary ───────────────────────────────────────────────────────────────

console.log("\n" + checks + " checks, " + failures + " failed.");
if (failures > 0) {
  console.log(failures + " channel-integration check(s) failed.");
  process.exitCode = 1;
} else {
  console.log("Channel-integration checks passed.");
}
