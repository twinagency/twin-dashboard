# Channel integration into the dashboard shell

Status: **applied in the isolated checkout, reviewed here, not merged and not
deployed.** The channel workspaces are real routes in the real app, the scope
that gates them is the server's, and the isolated preview can no longer reach
the live sign-out. `main` is untouched, and no backend, account, session or send
exists behind any of it.

Superseded content: earlier revisions of this file described the shell change as
*proposed* and the routes as preview-only. Both are recorded below as what
actually shipped.

## 1. What shipped, and where

### 1.1 New routes in the real app

| Route | Renders | Gate |
|---|---|---|
| `/onlyfans/inbox`, `/onlyfans/accounts` | `components/onlyfans-preview/OnlyFansWorkspace` | `app/onlyfans/layout.tsx` → `requireChannel("onlyfans")` |
| `/onlyfans/content`, `/onlyfans/sales`, `/onlyfans/settings` | The planned-surface note for that stage | inherited from the segment layout; an unknown section 404s |
| `/overview` | The All-channels outline | `requireOperatorSurface()` |
| `/telegram` | A pointer at the existing `/users` screen | `requireChannel("telegram")` |

The OnlyFans gate is in the **segment layout**, so a new OnlyFans screen inherits
it and cannot be added without one. There is deliberately no catch-all: an
unknown path in the real app is still a 404. The isolated preview keeps its own
catch-all so the real sidebar's links do not all break inside the preview.

### 1.2 The channel scope is the server's (`lib/channel-scope.ts`, new)

`lib/channel-nav.ts` answers *which channel a path is*. `lib/channel-scope.ts`
answers *which channels this request may open*, and it is the only place allowed
to decide that:

- the path comes from middleware's `x-pathname` header, not from a client hook,
  so a request cannot claim to be a different channel than it is;
- the audience is the verified identity from `lib/dashboard-access`, not a cookie
  a page chose to read;
- a refusal is a 404 at the route, so no channel page renders at all.

`app/layout.tsx` resolves it once per request and passes the allowed channel list
into the shell. Resolving it there costs nothing extra: the layout already holds
both facts it needs, and `getDashboardAccess()` is request-cached.

**Why the *active* channel is still read from the pathname inside the shell.** The
root layout does not re-render on client-side navigation — that is why the
breadcrumb is a client component in the first place, and `components/TopBar.tsx`
records the bug that caused. A channel frozen in the server layout would go stale
the moment the operator clicked a channel link. So the shell derives the active
channel through the same pure function the server uses, and the server keeps the
authority over what is *allowed*. One definition, one function: the two cannot
disagree.

### 1.3 Files touched

| File | Change |
|---|---|
| `lib/channel-nav.ts` | Two pure helpers: `offeredChannels` and `shouldShowChannelSwitch`, so the control and its checks read one definition |
| `lib/channel-scope.ts` (new) | The server's channel authority: access, verdict, allowed list, `requireChannel`, `requireOperatorSurface` |
| `app/onlyfans/layout.tsx`, `app/onlyfans/{inbox,accounts,[section]}/page.tsx` (new) | The OnlyFans workspace routes and their segment gate |
| `app/overview/page.tsx`, `app/telegram/page.tsx` (new) | The combined overview and the Telegram pointer, each gated |
| `app/layout.tsx` | Resolves the channel scope and passes the allowed list into the shell |
| `components/ChannelSwitch.tsx` | Offers only the allowed channels; renders nothing below two options |
| `components/MobileMenu.tsx` | Forwards the same list to the drawer's switch |
| `components/TopBar.tsx` | Two new props (`channels`, `signOutAction`); no longer imports the login action |
| `components/SignOutButton.tsx` (new) | The sign-out markup, pure, with a `simulated` mode |
| `preview/onlyfans/app/layout.tsx` | Passes the three channels explicitly and asks for the simulated sign-out |
| `components/onlyfans-preview/SurfaceNote.tsx` | Copy made neutral ("this build", "linked") now that the same components serve real routes |

### 1.4 Shared tests touched

| File | Change |
|---|---|
| `scripts/check-creator-workspace.ts` | One assertion loosened from `/locked=\{isCreator\}/` to `/locked=\{isCreator\b/`. See 7.2 — it was already failing, and its guarantee is unchanged |
| `scripts/check-onlyfans-preview.ts` | The preview's reached-server-action set is now exactly `app/actions/clone-scope.ts`; the `sign out` action is asserted gone |
| `preview/onlyfans/scripts/check-isolation.mjs` | Seven new browser checks for the inert sign-out |
| `package.json` | One script added: `test:channel-integration`. The aggregate `test` chain is unchanged |

## 2. The gate rule

```
all        every session            it IS the existing dashboard
telegram   operator only            an operator workspace
onlyfans   operator only            an operator workspace
```

`operator` is the internal operator (`getDashboardAccess()` returns null and no
view-as is live). An agency is not the internal operator, and a view-as session
is never one — viewing as somebody is a look, never an administration, which is
the same rule the dashboard already applies when it forces view-as read-only.

The rule is a pure function (`channelVerdict`) so it is asserted without a
request, and `lib/channel-scope.ts` is the only place that decides it.

## 3. What the gate does not change

- **Agency access is untouched.** `lib/agency-policy.ts` has no entry for the new
  routes, so an agency is still refused them by the existing policy and still
  allowed everything it was allowed before. `scripts/check-channel-integration.ts`
  asserts both halves against the real function. Widening this is a deliberate
  product decision, not a side effect: add the routes to `agencyDashboardPath`.
- **Telegram routes are untouched.** `/users`, `/flows`, `/media` and `/business`
  are the same files they were; the Telegram channel links to them and reproduces
  none of them. There is still exactly one Fans and Messages screen.
- **The creator workspace is untouched.** `CreatorWorkspaceShell` passes no
  channel list, so the switch's default applies and no channel switch renders
  there. The assertion in `check-creator-workspace.ts` that the shared shell is
  not forked still passes.
- **Every existing route is still "All channels".** `channelForPath` returns
  `all` for everything that is not `/telegram` or `/onlyfans/*`, so the sidebar's
  channel branch cannot run on any existing page and the operator navigation
  renders exactly as before.

## 4. Navigation gating

The switch offers only what the server allowed, and it renders **nothing at all**
unless at least two channels are available: a one-option segmented control is a
control that does nothing, which is the defect class this codebase already treats
as worse than an absent control. A session with no channel workspace therefore
sees exactly the top bar this feature found.

An omitted `channels` prop defaults to "no switch" rather than "all channels",
so forgetting the prop on a new surface cannot hand a channel workspace to a
surface that should not have one.

Every navigation entry — including the planned ones — is asserted to point at a
route that exists, served literally or by a dynamic sibling. The sidebar cannot
offer a screen that is not there.

## 5. Preview logout isolation

The preview mounts the real top bar, so it rendered the real sign-out control,
which was wired to the live login action. Clicking it in a fixture surface would
have cleared a real session.

Two changes fix that structurally rather than cosmetically:

1. `components/TopBar.tsx` no longer imports `@/app/login/actions`. The signed-in
   action arrives as a prop from the server layout (`signOutAction={logout}` in
   `app/layout.tsx`), so the live action is not in the module graph of any
   surface that mounts the bar. The preview's import audit asserts the reached
   set is now exactly `app/actions/clone-scope.ts`.
2. `components/SignOutButton.tsx` renders the identical control in a `simulated`
   mode, which is disabled, labelled as simulated, and cannot submit. The preview
   asks for that mode; the dashboard does not.

Agency and creator sign-out are unchanged: they still post to their own portal
logout routes, and the check that pins that behaviour still passes.

## 6. Division of labour with the other tracks

Nothing here touches the Telegram migration's files, the shared engine, sending,
the database, media or model configuration. The one shared-navigation change is
the one this document records, and it is where it was already recorded before
this step.

## 7. Verification of this step

All commands were run from `twin-dashboard-of-d0` on 17 October 2026, **offline**:
no provider, no database, no account and no session was contacted. The preview
harness was restarted after the edits so the browser checks ran against the
current source.

| # | Command | Result |
|---|---|---|
| 1 | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | exit 0, no diagnostics |
| 2 | `node node_modules/typescript/bin/tsc --noEmit -p preview/onlyfans/tsconfig.json` | exit 0, no diagnostics |
| 3 | `npm run test:channel-integration` | exit 0, **97/97** checks passed |
| 4 | `npm run test:onlyfans-preview` | exit 0, **100/100** checks passed |
| 5 | `node preview/onlyfans/scripts/check-isolation.mjs` | exit 0, **59/59** browser checks passed |
| 6 | `npx tsx scripts/check-sidebar-layout.tsx` | exit 0 |
| 7 | `npx tsx scripts/check-lynq-management.tsx` | exit 0 — 104 guarded server actions, TopBar still routes agency sign-out to `/agency/logout` |
| 8 | `npx tsx scripts/check-creator-workspace.ts` | exit 0 (after 7.2) |
| 9 | `npx tsx scripts/check-creator-routing.ts` | exit 0 |
| 10 | `node preview/onlyfans/scripts/shots.mjs` | 10 desktop + 3 mobile captures regenerated |

### 7.1 The new checks cover

`scripts/check-channel-integration.ts`, 97 checks in five groups:

1. **Route integration.** Every route exists, the OnlyFans gate is in the segment
   layout rather than repeated per page, the planned sections are an allow-list,
   and the routes render the shared surfaces rather than a second design.
2. **Server-derived scope.** The access truth table, the verdict per channel, the
   allowed list per audience, the fact that the path and identity come from the
   request, the route/path agreement assertion, and the layout passing the scope
   into the shell.
3. **Navigation gating.** Canonical order, the single-option case rendering
   nothing, the "no switch by default" rule, the creator shell offering none, and
   every navigation entry resolving to a route that exists.
4. **Preview logout isolation.** `TopBar` has no login-action import and still
   routes agency and creator sign-out through their own portals; the action comes
   in as a prop; the button is pure markup; the preview asks for the simulated
   mode and the dashboard does not.
5. **Telegram and agency access preserved.** The existing routes still exist, the
   Telegram channel reproduces none of them, and the real `agencyDashboardPath`
   still refuses the new routes while still allowing today's.

### 7.2 One pre-existing failure found and fixed

`scripts/check-creator-workspace.ts` asserted the literal string
`locked={isCreator}` in `components/TopBar.tsx`. The previous step changed that
line to `locked={isCreator || lockCreatorScope}` when it pinned the creator scope
for the isolated preview, so **this test had been failing in this checkout since
that step**, unnoticed because it is not part of the aggregate `npm test` chain
that currently stops earlier on the known MTProto failures.

The guarantee — the creator's chip is locked — was never broken. The assertion
was too literal, and it now pins the guarantee (`/locked=\{isCreator\b/`) so a
second reason to lock is allowed while a missing creator lock still fails.

### 7.3 What these checks do NOT establish

- **No live route has been rendered.** The check suite never starts the dashboard
  (starting it would read real fleet, version and financial data), so the new
  routes are verified by typecheck, by structural assertions and by the fixture
  surfaces they compose, not by a fetch of `/overview` on a running dashboard.
- No backend, account, session or provider was contacted at any point, and the
  OnlyFans workspace behind the gate is still fixtures labelled as sample data.
- Accessibility remains a structural pass only.
- The known pre-existing MTProto failures (J1, L8) in the aggregate `npm test`
  chain are unchanged and were not re-investigated here.

## 8. Decisions a reviewer may overturn

1. **Channel workspaces are operator-only, and agencies are refused by the
   existing policy.** Widening it is one list in `lib/agency-policy.ts`. It was
   left alone so this step cannot be read as a permission change.
2. **The active channel stays path-derived in the shell** (see 1.2). The
   alternative is a channel that goes stale on client-side navigation.
3. **The overview and the planned OnlyFans sections are real routes** that answer
   with an honest note, rather than 404s. A bookmarked section should not look
   like a broken link.
4. **The preview's sign-out is visible but inert**, rather than hidden. It keeps
   the bar's geometry identical to the dashboard while being unable to act, and
   the label says so.

## 9. Still outstanding

1. **Account scope in the URL.** "Open inbox" on the Accounts page lands on the
   inbox with the first account selected, because the selection lives in memory.
   Carrying it in the query string or the scope cookie is the right fix and is not
   done.
2. **The channel is not yet server-visible to the data layer.** The scope gates
   routes today; when OF-D2 adds real reads, the same module should scope them,
   rather than each page re-deriving the channel.
3. **Creator switching in the preview** is still locked.
4. Then OF-D1: the content, sales and settings screens against reviewed contracts.
