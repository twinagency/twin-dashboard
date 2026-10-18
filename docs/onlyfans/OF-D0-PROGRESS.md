# OF-D0 progress and verification

Package: OF-D0 only. Architecture, contracts, typed view models, one
data-source interface with deterministic fixtures, and an isolated accounts and
inbox preview. Stopped for review. No later stage has been started.

Date: 17 October 2026.

Checkout: `twin-dashboard-of-d0`, a worktree of `twin-dashboard`
(`origin https://github.com/ronan-com/twin-dashboard.git`), branch
`codex/onlyfans-dashboard-foundation`, base `fb6b345` (the same commit as
`main`). This worktree already existed with an incomplete scaffold when this
package began; it was inspected first and then completed here. See section 6.

## 1. What was delivered

1. **Architecture, screen map, ownership and proposed API contracts.**
   `ARCHITECTURE.md`, `API_CONTRACTS.md`, `NAVIGATION_INTEGRATION.md`.
2. **Typed view models and one data-source interface with deterministic
   fixtures.** `lib/onlyfans-preview/*`.
3. **A working accounts and inbox preview using the existing Twin
   presentation.** `components/onlyfans-preview/*`, mounted by the isolated
   harness in `preview/onlyfans/`.
4. **Dashboard-specific progress, dependencies and conflicts.** This file.

## 2. How to run it

Two processes: the preview harness, then the checks against it.

```powershell
# 1. The isolated preview (its own Next.js project root; port 3017 was free).
cd twin-dashboard-of-d0
node node_modules/next/dist/bin/next dev preview/onlyfans -p 3017

# 2. Fixture contract checks (offline, no server needed).
npm run test:onlyfans-preview

# 3. Browser isolation checks and the review screenshots (needs the server up).
node preview/onlyfans/scripts/check-isolation.mjs
node preview/onlyfans/scripts/shots.mjs
```

Local URL while the server is running: `http://localhost:3017/`.

Screenshots land in `preview/onlyfans/shots/`, which is git-ignored because it is
regenerated output rather than source.

Both browser scripts reuse the same Chromium resolver
(`preview/onlyfans/scripts/chromium.mjs`). It tries the Chromium builds already
installed on the machine and downloads nothing; on this machine the full
Chromium build fails to start for a missing side-by-side runtime, so the
headless shell is what runs.

## 3. Verification actually performed

All commands were run from `twin-dashboard-of-d0` on 17 October 2026.

| # | Command | Result |
|---|---|---|
| 1 | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | exit 0, no diagnostics |
| 2 | `npm run test:onlyfans-preview` | exit 0, **99/99** checks passed |
| 3 | `node preview/onlyfans/scripts/check-isolation.mjs` | exit 0, **34/34** browser checks passed |
| 4 | `Invoke-WebRequest http://localhost:3017/` | HTTP 200, 36,594 bytes |
| 5 | `node preview/onlyfans/scripts/shots.mjs` | 10 desktop + 3 mobile captures written |

### 3.1 What the fixture contract checks cover

`scripts/check-onlyfans-preview.ts`, 99 checks in eleven groups:

1. **Account isolation.** Selecting another account leaves the first account's
   entry untouched; the other account starts with nothing selected; a
   conversation id from another account never resolves as this account's thread;
   a cached thread is never shown under the account next to it; caches stay
   separate.
2. **Out-of-order responses.** A late list read is dropped and only the newest
   page is on screen; a late read of the same thread cannot replace a newer one;
   a thread read does not invalidate the list's own in-flight read, and the list
   settles rather than staying on loading.
3. **Read-only controls.** The operator may send; a read-only viewer may not,
   including when the guard is called directly rather than through the UI; the
   refusal carries a reason; no action is offered; the scope is narrower.
4. **Unknown-delivery holds.** `unknown` and `dispatching` count as unresolved;
   no resend is offered; the evidence path is offered instead and says why;
   without a recorded attempt nothing is offered at all; a partial send still
   offers the evidence path.
5. **No live transport fallback.** A live source identifies itself as live and
   every read refuses rather than returning fixtures; a production build cannot
   serve fixture data; fixture mode labels itself as sample data; a submitted
   command reports `applied: false`; the idempotency key is deterministic and a
   retry reuses the same command identity; an out-of-scope account read is
   refused without describing what exists.
6. **Import audit.** Walks the module graph from the preview page and from
   `OnlyFansPreview.tsx` and asserts that no live root layout, database client,
   production data provider, `components/Sidebar` or `components/TopBar` is
   reachable.

The five groups added in the OF-D0 repair pass (section 9):

7. **Scope generation.** A scope reset restarts the read counters, so a late
   response and a new request can carry the same sequence number; the
   generation, not the number, is what separates them. Asserted for the list
   read and, because it is the security-shaped case, for the accounts read —
   a late wide response must never restore a scope the operator narrowed.
8. **Paging and staleness.** Appending a page never relabels a stale list as
   current, a stale page makes the whole list stale, and a failed page adds
   nothing without blanking what is already on screen.
9. **Command contract.** Two different messages at the same revision are two
   different commands and carry different idempotency keys; the account is part
   of the identity; the typed text and the delivery decision survive into the
   modelled command; an empty, over-long or wrong-account command is refused
   with a reason; sending against an unresolved conversation is refused.
10. **Delivery coherence.** For every outcome, the rollup, every outbound
    bubble receipt and the recorded attempt agree, and the controls follow.
11. **Scanner self-test.** The import audit proves it can see side-effect,
    multi-line, re-export, dynamic and CommonJS imports, and the walk is asserted
    to include the preview's own layout, because that is where a live provider
    or initializer would be added.

### 3.2 What the browser checks cover

`preview/onlyfans/scripts/check-isolation.mjs`, 34 checks in seven groups, in a
real browser against the running preview. Every wait is on a real condition
rather than a timeout: the fixture reads are resolved promises, not network
requests, so `networkidle` carries no information about whether a pane has
finished loading.

Two of the seven groups are new in the repair pass:

6. **Empty reads.** An empty conversation list takes the open thread, its
   composer and its action column with it; an empty account scope takes the
   account, its thread and its composer too; and the surface comes back when the
   scope returns.
7. **Mobile layout.** At 390x844 the channel navigation the sidebar used to own
   is reachable and opens Accounts, the desktop sidebar is not rendered, nothing
   overflows the viewport horizontally, and the sample-data badge stays inside
   the header.

The file also waits for hydration before it touches a control. The fixture reads
run in an effect, so clicking server-rendered markup before that point is
silently a no-op that looks exactly like a broken control — which is how the
collapsed-by-default panel first appeared to fail this suite.

1. **Account isolation.** Switching accounts replaces the conversation list and
   the new list is the second account's own.
2. **Draft isolation.** A reply typed in one conversation does not appear after
   switching conversation, and does not appear after switching account.
3. **Unknown delivery.** The send control is disabled, the evidence path is
   offered, and no resend control exists.
4. **Read-only viewer.** The banner is shown, the composer is disabled, no
   action control is offered, and the reason is stated on screen.
5. **Simulated send.** The send reports that nothing was performed, says no
   message was sent, and no message's delivery state changes as a result.

A wait that times out fails the run with a non-zero exit and names the locator it
was waiting for, so a broken preview cannot pass silently.

### 3.2.1 Were these checks proven able to fail?

Yes, on three separate occasions during this package:

- The two defects in `selection.ts` described in section 6 were each **found by
  a failing check** and are now pinned by the ones that failed.
- The account-isolation browser check was re-run with a deliberate bug planted
  (the fixture conversation list made to ignore the account id). It failed with
  a non-zero exit and a timeout naming the expected second-account conversation,
  then passed again once the bug was removed.

One honest limitation, found by planting the bug back: removing the
`key={detail.conversationId}` from the composer did **not** fail the draft
isolation checks. Opening a conversation replaces the thread with its loading
state, which unmounts the composer and discards the draft, so the draft stays
isolated with or without the key. The key is therefore defence in depth rather
than the load-bearing guard, and the checks verify the behaviour the handover
asks for (a draft cannot travel) rather than that one line.

### 3.3 What these checks do NOT establish

These prove the fixture frontend's contract and the rendered surface's
behaviour. They do not prove backend security, backend correctness, production
reliability, capacity, or that any OnlyFans API returns anything at all. There
is no backend for them to reach.

### 3.4 Pre-existing failures in the wider dashboard suite

`npm test` in this checkout stops on two **pre-existing** failures in the
MTProto package, before reaching anything in this package:

```
2 of 105 CHECKS FAILED
  ✗ J1 every exported server action calls guardDashboardAction before doing anything
      previewAudienceAction must call guardDashboardAction as its FIRST statement
  ✗ L8 the resume gate is wired in the lib function, the server action and the API route (source)
```

Reproduced identically on the untouched `twin-dashboard` worktree checked out at
`main` (`npm run test:mtproto` there also exits 1 with the same two failures), so
they are not caused by this package.

Consequence, stated plainly: the new check is registered as its own script,
`npm run test:onlyfans-preview`, and deliberately appended to nothing. It was
**not** added to the aggregate `npm test` chain, because that chain is currently
red before it would reach the end, and adding a line to a shared file for
coverage that never runs would be churn. It should be appended to the `test`
chain once J1 and L8 are repaired.

## 4. Changed files

### 4.1 Modified in the shared codebase

| File | Change |
|---|---|
| `components/crm/CrmPreview.tsx` | Six presentational helpers exported (`TONE`, `Tone`, `Dot`, `Avatar`, `Metric`, `QuietLabel`) with a comment saying why. No behaviour change, no visual change, no route change. This is the existing CRM visual language being shared, not a second design system |
| `package.json` | One script added: `test:onlyfans-preview`. No dependency changes, and the aggregate `test` chain is unchanged |
| `.gitignore` | One entry added: `preview/onlyfans/shots/` |

### 4.2 Added

| Area | Files |
|---|---|
| View models and contracts | `lib/onlyfans-preview/types.ts`, `fixtures.ts`, `data-source.ts`, `fixture-data-source.ts`, `selection.ts`, `actions.ts`, `scenarios.ts`, `workspace.ts` |
| Preview surfaces | `components/onlyfans-preview/`: `OnlyFansPreview.tsx`, `WorkspaceShell.tsx`, `WorkspaceSwitcher.tsx`, `AccountsView.tsx`, `InboxView.tsx`, `SurfaceNote.tsx`, `PreviewControlsPanel.tsx`, `PreviewChrome.tsx`, `RequestStateBlock.tsx`, `labels.tsx` |
| Isolated harness | `preview/onlyfans/`: `package.json`, `next.config.mjs`, `postcss.config.mjs`, `tsconfig.json`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `scripts/chromium.mjs`, `scripts/shots.mjs`, `scripts/check-isolation.mjs` |
| Checks | `scripts/check-onlyfans-preview.ts` |
| Documentation | `docs/onlyfans/ARCHITECTURE.md`, `API_CONTRACTS.md`, `NAVIGATION_INTEGRATION.md`, `OF-D0-PROGRESS.md` |

## 5. Protected files left untouched

Nothing in the live operator shell, the shared engine, sending, database,
authentication, media or model configuration was modified.

| Protected area | Files | State |
|---|---|---|
| Root layout and shell | `app/layout.tsx`, `components/MainShell.tsx`, `middleware.ts` | untouched |
| Shared navigation | `components/Sidebar.tsx`, `components/TopBar.tsx`, `components/MobileMenu.tsx`, `lib/page-meta.ts` | untouched |
| Existing routes | every file under `app/` | untouched. No route added, changed or removed |
| Identity and access | `lib/dashboard-access.ts`, `lib/agency-identity.ts`, `lib/creator-dashboard-identity.ts`, `lib/creator-session.ts`, `lib/clone-scope.ts`, `lib/agency-policy.ts` | untouched |
| Data plumbing | `lib/query-cache.ts`, `lib/dashboard-data.ts`, `app/api/**` | untouched |
| Presentation reused as-is | `components/ui/card.tsx`, `components/TwinWordmark.tsx`, `components/IntelligenceCoreIcon.tsx`, `components/crm/CrmPreview.tsx` (exports only) | reused, not restyled |
| Design tokens | `app/globals.css`, `app/jess-kate-theme.css`, `app/creator-workspace.css` | untouched and imported by the preview |

Repositories outside the dashboard were not written to. Verified after the work:

| Repository | Branch | Working tree |
|---|---|---|
| `twin-sexbot` | `codex/onlyfans-integration` | unchanged, still dirty as handed over |
| `inflowwkiller` | `codex/onlyfans-integration` | unchanged, still dirty as handed over |
| `bot` | `codex/telegram-fastt` | unchanged, still dirty as handed over |

No other dashboard worktree contains an `onlyfans-preview` directory, so nothing
was copied between checkouts.

## 6. What was inherited, and what was changed in it

The OF-D0 scaffold already existed in this worktree and was inspected before
being reused. It contained the view models, fixtures, data-source interface,
selection module, action module, and three presentation components; it had no
harness, no checks and no documentation.

Kept as designed: the state model, the action gating rules, the fixture
determinism, the request-state rendering, the label vocabulary, and the
`PreviewChrome` shell pieces.

Two genuine defects were found and fixed, both in the existing modules:

1. **`selection.ts` used one sequence counter per account for both reads.**
   An in-flight conversation-list read was invalidated by any thread read issued
   afterwards, so the list sat on its loading state with its data already on the
   way. This was reproduced in the browser and is now pinned by the check
   "a thread read does not invalidate the in-flight list read". The counter is
   now split: the list, and each thread, are sequenced separately.
2. **`requestConversation` derived its sequence from the newest request
   *applied* rather than the newest *issued*.** Two outstanding reads of the same
   thread were handed the same number, so the older one looked current and could
   overwrite the newer. Pinned by "a late thread read of the same thread is
   dropped".

One shape correction was made to the existing live source:

3. **`createLiveOnlyFansDataSource`'s refusal threw synchronously.** A caller
   that only attached a rejection handler would have seen an unhandled throw
   rather than a refused promise. The refusal is now async and returns a rejected
   promise, matching the interface's `Promise` signature.

Additive changes to existing modules: `PreviewChrome.tsx` gained
`whitespace-nowrap` on the badge so the sample-data label does not wrap on a
phone; `labels.tsx` gained `SimulatedTag`; `fixtures.ts` gained two accounts
(one disconnected, one second account for the same creator), their
conversations and their threads; `types.ts` gained the workspace navigation
model; `fixture-data-source.ts` had the view-as viewer label changed from
"Viewing as creator (read only)" to "Creator (read only)" because the shell
already prints "Viewing as" above it and the two stuttered.

## 7. Prototype behaviour versus implemented backend capability

This is the distinction the whole package turns on.

| Looks like | Actually is |
|---|---|
| Two connected accounts with health, modes and capabilities | Two synthetic accounts in `fixtures.ts`. No provider was contacted |
| A conversation list with cursor paging and a thread | Synthetic rows. The cursor path is real in the fixture source and exercised by the preview |
| Per-bubble receipts (`of-receipt-ava-7001`, `of-attempt-ava-6001`) | Invented strings. They correspond to nothing |
| "Send as creator" | A modelled command. `applied: false`, nothing sent, no provider call |
| "Take over", "Pause replies", "Mark no further contact" | Modelled. The server answers `{ simulated: true, applied: false }` |
| "Reconnect account" | Disabled, tagged Simulated, and explained. No session exists to open |
| "Owned items" and "Paid total" | Synthetic media rows and `USD` minor units. No commerce integration exists |
| The All-channels overview | A labelled outline of a future surface. No screen behind it |
| Telegram Fans and Messages | A pointer to the existing `/users` screen. Not reproduced |

Every simulated control is tagged in the interface, and the sidebar carries a
"Preview: Sample data" badge on every surface.

## 8. Outstanding dependencies and conflicts

### 8.1 Blocking later stages

1. **The scoped server API does not exist.** OF-D2 cannot start until the read
   families in `API_CONTRACTS.md` are real, authorised and account-scoped.
2. **The delivery and control authority is not built.** OF-D3 needs the
   single-authority work from the consolidation plan's milestone 3, including
   retries, revisions, late receipts and unknown-outcome holds.
3. **Commerce, catalogue and configuration contracts are not agreed.** OF-D4
   needs canonical offers, purchases, refunds, ownership and capability
   contracts.
4. **The shared shell change is undecided.** The workspace switcher cannot be
   wired for real until the Option A / Option B choice in
   `NAVIGATION_INTEGRATION.md` is made. This is a product decision, not a
   technical blocker.
5. **The Telegram track is mid-repair.** Telegram P1-R is not accepted; its P1-R
   review lists C1 to C4. This package reads that work but does not touch it.
   Before either track edits shared dashboard configuration or media code, the
   exact file ownership in `DASHBOARD_HANDOVER.md` section 10 still needs to be
   reserved.

### 8.2 Conflicts identified, and how they were handled

| Conflict | Handling |
|---|---|
| The handover forbids modifying the live root layout; a fixture page inside `app/` would run the layout's real identity, fleet and financial reads | The preview was built as a separate Next.js project root that imports presentational components and the shared stylesheet only. `NAVIGATION_INTEGRATION.md` records the shell change that a later package would make |
| `npm test` is red before it reaches any new check | Reported, reproduced on clean `main`, and the new check was kept out of the aggregate chain rather than hiding the problem behind a passing line |
| The rejected `twin-crm-concept.html` mockup had an accepted navigation idea and a rejected appearance | The navigation idea was rebuilt using the dashboard's own tokens, classes and components. Nothing was copied from the mockup, and no competing design system was introduced |
| `docs/onlyfans/IMPLEMENTATION_PLAN.md` describes the historical Twin V2 bridge | Treated as historical, per the handover. `CONSOLIDATION_PLAN.md` is the OnlyFans architecture reference |

### 8.3 Unverified, and honestly so

- The preview has not been run against any OnlyFans account, and no account
  connection, session material or credential was read at any point.
- No browser check has been run against a mobile physical device. The mobile
  captures are a 390x844 viewport in headless Chromium.
- Accessibility has had a structural pass only (labelled controls, `aria-*` on
  the switcher and the composer, `sr-only` labels, decorative canvases marked
  `aria-hidden`). No automated accessibility audit and no screen-reader session
  has been run. That belongs in the OF-D1 review.

## 9. The OF-D0 repair pass

An independent review of the delivered package found seven defects that the
passing checks did not cover, plus two design adjustments. This section records
what changed and what was decided. The package is still OF-D0: no backend, no
live read and no command was introduced.

### 9.1 The seven repairs

1. **Mobile navigation.** The shell's sidebar is `hidden` below `lg`, so Accounts
   and Inbox disappeared with it and a phone had no way to reach either. The
   shell now renders the channel's own navigation as a horizontally scrollable
   row inside the mobile header, including the inert `Planned` entries, because
   a chip that looks tappable and does nothing is the same defect on a phone as
   on a desktop. The sample-data badge moved into that row and wraps, so it no
   longer runs past the header at 390px. `WorkspaceShell.tsx`,
   `WorkspaceSwitcher.tsx` (new), `PreviewChrome.tsx` unchanged.
2. **Empty reads left stale content actionable.** The list already dropped a
   selection its newest read could not vouch for, but an *empty account scope*
   kept the previous account, its thread cache and its selected conversation,
   so the old thread stayed on screen with a live composer. `applyAccounts` now
   treats an empty or failed accounts read as "no account is confirmed" and
   clears the account, the cache and the selection with it. `selection.ts`.
3. **Delivery states contradicted their controls.** Selecting the partial
   outcome used to leave an outbound bubble saying "unknown" beside no attempt,
   with sending enabled. The override now derives the rollup, every outbound
   bubble receipt and the recorded attempt from one outcome, so the three cannot
   drift apart. `scenarios.ts`.
4. **Delayed responses survived a scope reset.** A creator or permission change
   restarted the read counters, so a late response and a new request could carry
   the same sequence number and the old response looked current. Every read now
   also carries the scope generation it was issued under, and a response from a
   previous generation is refused. `selection.ts`, `OnlyFansPreview.tsx`.
5. **Paging relabelled stale data as current.** Appending a page always produced
   `ready` and discarded the freshness metadata. Appending now merges
   freshness: a fresh page onto a stale list stays stale, and when both sides
   are stale the older reading wins. `selection.ts`.
6. **The command contract was incomplete.** Typed text was discarded, commands
   carried no account and no command-specific payload, and two different
   messages at the same revision shared one identity. `CommandPayload` is a
   discriminated union, `CommandRequest` carries `accountId` and `payload`, and
   the idempotency key digests the payload, so two different messages are two
   different commands and a retry of one reuses its own identity. The composer
   submits the text it holds and the resolution control submits the decision it
   recorded. `types.ts`, `actions.ts`, `InboxView.tsx`, `OnlyFansPreview.tsx`.
7. **The import audit was not covering the whole graph.** The walk skipped the
   preview's own `layout.tsx`, which is exactly where a live provider or
   initializer would be added, and its scanner did not see side-effect,
   multi-line, re-export, dynamic or CommonJS imports. The walk now includes the
   layout and asserts it did, and the scanner is self-tested against every one of
   those import forms. `scripts/check-onlyfans-preview.ts`.

### 9.2 The two design adjustments

- **The channel switch moved into the top bar** from `lg` up, where the sidebar
  and its navigation are also visible. Below `lg` exactly one switcher is on
  screen, in the mobile header. A top-bar switcher and bookmarkable channel
  routes are complementary, and `NAVIGATION_INTEGRATION.md` proposes the route
  pairing that would make the scope server-derivable.
- **The developer controls are collapsed by default** and, collapsed, are a
  single right-aligned "Show controls" affordance rather than a full-width band
  above the page title. The product surface is what a reviewer meets first.

### 9.3 One decision worth recording

The unresolved-send row in `ARCHITECTURE.md` said an unresolved send withholds
send, pause/resume *and* takeover. The implementation withheld only the two
actions that could dispatch another message, and left pause, takeover and
no-contact available. The consolidation plan is explicit that unresolved
delivery "blocks conflicting **sends** regardless of mode" and that "unknown
outcomes pause conflicting work" — not that it freezes the conversation — and
withdrawing pause from an operator during an uncertain send is the unsafe
direction. The implementation's reading is the one that matches the plan, so
the table in `ARCHITECTURE.md` now states it explicitly and the contract check
pins the exact withheld set. This is a documentation change plus a check, not a
behaviour change, and it is reversible if the stricter reading is preferred.

### 9.4 Verification of the repair pass

All commands run from `twin-dashboard-of-d0` on 17 October 2026, against a dev
server started after the edits:

| # | Command | Result |
|---|---|---|
| 1 | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | exit 0, no diagnostics |
| 2 | `npm run test:onlyfans-preview` | exit 0, **99/99** checks passed |
| 3 | `node preview/onlyfans/scripts/check-isolation.mjs` | exit 0, **34/34** browser checks passed |
| 4 | `node preview/onlyfans/scripts/shots.mjs` | 10 desktop + 3 mobile captures written |

One operational note found the hard way: a dev server left running across the
edits served a stale client chunk, which made a correctly wired control appear
dead. The browser suite now waits for hydration before it touches a control, so
a click against server-rendered markup can no longer be mistaken for a broken
control.

### 9.5 Still unverified after the repair pass

- Everything in section 8.3 still holds. No account, session or provider was
  touched; the mobile capture is a headless 390x844 viewport, not a physical
  device; accessibility remains a structural pass only.
- That directory is git-ignored regenerated output. Superseded captures from
  earlier passes (`mobile-02-inbox-collapsed.png`) may still be on disk; shell
  deletion is blocked in this environment, so they were left in place rather
  than worked around. The current capture set is listed in section 10.6.

## 10. The frontend implementation step

OF-D0 originally shipped a preview that *mirrored* the dashboard's shell: the
same class names and row geometry, rebuilt by hand, and its pages composed from
CRM preview helpers. That was rejected as the wrong visual baseline, correctly —
the design source of truth is the real creator-facing dashboard, not a
reconstruction of it or a set of presentation helpers.

This step replaces the presentation and keeps the foundation. The view models,
fixtures, selection logic, action gating, scenario injection and their checks are
untouched; the preview now mounts the dashboard's own shell and composes its two
OnlyFans pages the way real dashboard pages are composed.

### 10.1 What was replaced

| Removed | Replaced by |
|---|---|
| `components/onlyfans-preview/WorkspaceShell.tsx` (hand-mirrored shell) | The real `components/Sidebar.tsx`, `TopBar.tsx`, `MobileMenu.tsx` and `MainShell.tsx`, mounted by `preview/onlyfans/app/layout.tsx` |
| `components/onlyfans-preview/WorkspaceSwitcher.tsx` | `components/ChannelSwitch.tsx`, in the real top bar and in the mobile drawer |
| `components/onlyfans-preview/OnlyFansPreview.tsx` | `components/onlyfans-preview/OnlyFansWorkspace.tsx`: the same state and data-source wiring, minus the channel/shell responsibilities, which now belong to the routes and the shell |
| `lib/onlyfans-preview/workspace.ts` nav model | `lib/channel-nav.ts`, which the dashboard's own shell reads, so the channel split has one definition |
| The hand-built page headers and card grids | The dashboard's own composition: `dashboard-page` + `h1 text-2xl font-semibold` + a `p-4` stat-card row, and for the inbox the three-column `users-panel` layout `app/users/page.tsx` uses |
| A bespoke bubble renderer | The dashboard's own thread styling — `tg-thread`, `tg-bubble`, `tg-tail-in/out`, `tg-meta`, `tg-newline` — with the same run grouping and the same rule marking the newest message |
| `CrmPreview` helper imports for rows and pills | `components/ui/card.tsx`, `components/FanAvatar.tsx`, the `users-panel` classes and the shared labels |

### 10.2 The shell extension is additive

Three new files (`lib/channel-nav.ts`, `components/ChannelSwitch.tsx`, and the
preview's `PreviewNotice`) and four shared files gained a total of: one guard in
the sidebar's nav body, two optional props (`lockCreatorScope` on `TopBar`,
`showAssistant` on `MainShell`), one slot (`channelSwitch` on `SidebarContent`),
seven page labels in `lib/page-meta.ts`, and the withholding of the Telegram
Stars pill on the OnlyFans channel.

Every one of them defaults to today's behaviour, and
`scripts/check-sidebar-layout.tsx` — the dashboard's own sidebar regression test —
still passes unchanged. `NAVIGATION_INTEGRATION.md` records the full change set
and the decisions a reviewer may want to overturn.

### 10.3 Why the shared thread component is not reused

`components/users/ChatThread.tsx` is the real Fans and Messages thread, and it
was the obvious thing to reuse. Its footer renders
`{spentStars.toLocaleString()}★ spent`, and its bubbles carry Stars-shaped
content (`LOCKED {stars}★`, `💰 {stars}★`). OnlyFans money is USD in integer
minor units, and the handover is explicit that OnlyFans money must never be put
into Stars columns or silently aggregated with them. Reusing the component would
have printed an OnlyFans amount with a Stars glyph.

So the component is not reused and its **styling** is: the preview's thread
renders the same bubble classes, the same run grouping, the same tail rule and
the same "latest message" divider, and opens pinned to the newest message the way
`ChatThread` does. The receipt under each outbound bubble is the OnlyFans part.
This is recorded in `NAVIGATION_INTEGRATION.md` section 4 as a decision, not an
oversight.

### 10.4 The harness now has real routes

`preview/onlyfans/app/` is a route tree rather than one page, because the channel
switch needs somewhere to go and the shell links to real routes:

| Route | Renders |
|---|---|
| `/` | Redirects to `/onlyfans/inbox` |
| `/onlyfans/inbox`, `/onlyfans/accounts` | `OnlyFansWorkspace` |
| `/onlyfans/content`, `/onlyfans/sales`, `/onlyfans/settings` | The planned-surface note, naming its gate |
| `/overview` | The All channels outline |
| `/telegram` | A note pointing at the existing `/users` screen |
| `/*` (catch-all) | A named note for any other dashboard route the real sidebar links to, instead of a 404 |
| `/api/fx` | The preview's own static rate, so `CurrencyProvider` makes no external call |

### 10.5 Verification of this step

All commands run from `twin-dashboard-of-d0` on 17 October 2026, against a dev
server restarted after the edits.

| # | Command | Result |
|---|---|---|
| 1 | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | exit 0, no diagnostics |
| 2 | `node node_modules/typescript/bin/tsc --noEmit -p preview/onlyfans/tsconfig.json` | exit 0, no diagnostics |
| 3 | `npm run test:onlyfans-preview` | exit 0, **100/100** checks passed |
| 4 | `node preview/onlyfans/scripts/check-isolation.mjs` | exit 0, **52/52** browser checks passed |
| 5 | `npx tsx scripts/check-sidebar-layout.tsx` | exit 0 — the dashboard's own sidebar test, unmodified expectations |
| 6 | `node preview/onlyfans/scripts/shots.mjs` | 10 desktop + 3 mobile captures written |

The browser suite gained five checks that only make sense against a real shell:
the product's own sidebar and top bar render; the switch marks the current
channel; **the Telegram Stars pill is withheld on the OnlyFans channel and comes
back on Telegram**; the sidebar is scoped to the channel and returns to the
operator navigation on All channels; and the mobile drawer carries both the
switch and the channel nav.

### 10.6 Current screenshots

`preview/onlyfans/shots/`: `desktop-01-inbox`, `02-accounts`,
`03-unknown-delivery`, `04-read-only`, `05-stale`, `06-session-expired`,
`07-all-channels`, `08-telegram-fans`, `09-second-account`, `10-paginated`;
`mobile-01-inbox`, `02-drawer`, `03-accounts`.

### 10.7 Protected areas, and the one that changed

Sections 8 and 9 record that no shared shell, engine, sending, database,
authentication, media or model configuration component was modified. **That is
no longer accurate for the shared navigation**, and it is the one thing this step
must be reviewed on:

| Area | State |
|---|---|
| Root layout (`app/layout.tsx`), every existing route, middleware | untouched |
| Identity, access, scope, policy | untouched |
| Data plumbing (`lib/query-cache.ts`, `lib/dashboard-data.ts`, `app/api/**`) | untouched |
| Engine, sending, media, model configuration | untouched |
| **Shared navigation** (`components/Sidebar.tsx`, `TopBar.tsx`, `MobileMenu.tsx`, `MainShell.tsx`, `lib/page-meta.ts`) | **gained the channel extension described in section 10.2** |
| `scripts/check-sidebar-layout.tsx` | one import-map entry, for the new pure module |
| Repositories outside the dashboard | unchanged |

### 10.8 Still outstanding

1. **Route integration.** Done in the next step — see section 11. The routes now
   exist in the real app and are gated server-side.
2. **Account scope in the URL.** "Open inbox" on the Accounts page lands on the
   inbox with the first account selected, because the selection lives in memory.
   Carrying it in the query string or the scope cookie is the right fix and is
   not done.
3. **Creator switching in the preview** is locked; the real switcher writes a
   scope cookie through a server action.
4. **Accessibility** is still a structural pass only (labelled controls,
   `aria-current` on the channel switch and nav, `sr-only` labels). No automated
   audit and no screen-reader session has been run.
5. Everything in section 8.3 about the backend still holds: no account, session
   or provider has been touched at any point.

## 11. The route-integration step

OF-D0's presentation lives in the real app now. This step added the channel routes
to `app/`, moved the channel decision to the server, gated the workspaces, and
closed the one hole the preview had left open: its sign-out control reached the
live login action.

The full record is `NAVIGATION_INTEGRATION.md`. What matters here:

### 11.1 What changed

| Area | Change |
|---|---|
| Routes | `/overview`, `/telegram`, `/onlyfans/inbox`, `/onlyfans/accounts` and the three planned OnlyFans sections are real routes |
| Server-derived scope | `lib/channel-scope.ts` decides which channels a request may open, from middleware's `x-pathname` and the verified identity; a refused workspace is a 404 |
| Navigation gating | The switch offers only the allowed channels, and renders nothing below two options; an omitted list means "no switch" |
| Preview logout isolation | `TopBar` takes the signed-in action as a prop instead of importing it, and renders a disabled, labelled control in the preview |

### 11.2 What deliberately did not change

- `lib/agency-policy.ts` — agencies are still refused the new routes by the
  existing policy and still allowed everything they were allowed before. No
  permission was widened.
- Every Telegram route, the shared engine, sending, the database, media and model
  configuration.
- `components/Sidebar.tsx`, `components/MainShell.tsx` and `components/MobileMenu.tsx`
  are unchanged by this step (they were already changed by the shell step and
  recorded in section 10).

### 11.3 Verification

Offline only: two typechecks, `test:channel-integration` (97/97),
`test:onlyfans-preview` (100/100), the browser suite (59/59), the sidebar, LYNQ
management, creator-workspace and creator-routing regression scripts, and the
regenerated screenshots. No dashboard server was started, so **no live route has
been rendered**; the routes are verified by typecheck, by structural assertions
and by the fixture surfaces they compose. No account, session, provider or
database was touched.

One pre-existing failure was found and fixed on the way: `check-creator-workspace.ts`
had been failing since the shell step, because that step added `lockCreatorScope`
to `TopBar` and the assertion pinned the exact string `locked={isCreator}`. The
guarantee was never broken; the assertion was too literal and now pins the
guarantee instead. See `NAVIGATION_INTEGRATION.md` section 7.2.

### 11.4 Still outstanding

At the end of this step two things were still open. **Both were closed by the next
step, which is section 12:** the selected account now travels in the URL, and the
channel is now visible to a data layer. The remainder of this section is kept as
the record of what this step left behind.

- Account scope was not carried in the URL — closed in section 12.1.
- The channel was not visible to a data layer, because there was none — closed in
  section 12.3.
- The next stage is OF-D1: the content, sales and settings screens against
  reviewed contracts. Nothing here authorises a backend connection, a send, an
  activation or a deployment, and nothing in section 12 changes that.

## 12. The scoped read-only integration

This is the step that turned the fixture surface into something that can be
pointed at the consolidated backend without pretending that backend exists. It
adds scope, an authenticated read boundary and a live adapter. It adds **no**
screen, **no** write path and **no** second store.

**Backend consolidation is not complete, and this step does not claim it is.**
What exists on the Twin side is a port and three read handlers. What does not
exist is the service behind them; section 12.6 is the exact list.

### 12.1 Creator and account scope travel in the URL

`lib/onlyfans-preview/scope.ts` is the whole of it, and it is pure: no React, no
router, no fetch, so the workspace and the checks read the same code.

| Concern | Decision |
|---|---|
| Where scope lives | `?creator=` and `?account=` on the OnlyFans routes |
| What an id is | A bounded opaque token. Empty, over-long or carrying anything that would need escaping parses to `null` — a malformed URL selects nothing rather than being forwarded |
| What scope grants | Nothing. Both ids are a *request*. The server's authorized account list is the only thing that decides, and the workspace reconciles the URL against the answer it actually received |
| Accounts → inbox | `workspaceHref` puts both ids on the link, so "Open inbox" opens **that** account rather than whichever one the inbox would default to |
| Refresh and Back | Both land on the same account, because the scope is in the address bar rather than in component state |
| Switching accounts | `router.replace`, not `push`: a change of scope within one page should not make Back mean "the previous account" |
| Changing creator | Drops the account selected under the previous creator, rather than asking the server for an account in the wrong scope and relying on a refusal to clean up |
| An id the read did not return | Not selected. The URL is only rewritten when it asked for something this session may not select — a URL that asked for nothing is left alone, which is also how a correction cannot race a click |

### 12.2 The authenticated read boundary

Three handlers, one rule, no writes.

| Piece | File | What it does |
|---|---|---|
| Route gate | `lib/onlyfans/route.ts` | `requireOnlyFansRead()` — verifies the internal operator session positively, refuses an agency and a view-as session, resolves the configured backend |
| Read service | `lib/onlyfans/reads.ts` | Pure. Takes the authorization facts and a backend, returns a result. Reads no cookie, header or environment variable, which is what makes the flow testable offline |
| Backend port | `lib/onlyfans/backend.ts` | The HTTP implementation and the configuration check. Read-only by construction: it has no write method |
| Handlers | `app/api/onlyfans/accounts/route.ts` and the two nested under `accounts/[accountId]` | Each is three lines after the gate |

Two traps are handled explicitly, because both are live in this repository:

- **A null `getDashboardAccess()` is not authentication.** It means "independently
  gated", and `lib/api-auth.ts` documents the trap at length. The gate requires
  `isAuthed()` to be true *on this request*, and nothing in the boundary consults
  `NODE_ENV` or the dashboard's no-auth switch — which matters because
  `middleware.ts` returns early with no auth at all outside production.
- **A browser id is not a grant.** The backend owns creator and account bindings,
  so it answers what this operator may read. On top of that the service refuses
  any answer that crosses a scope: an account from another creator, a conversation
  from another account, or a conversation other than the one asked for is a
  `scope_violation` rather than a row rendered under the wrong heading. The
  refusal does not name the record it refused, so it cannot become a read.

Nothing was widened to make this work. `lib/agency-policy.ts` is untouched: an
agency is refused OnlyFans data exactly as it is refused the channel workspace,
and a view-as session cannot read another account's private conversations.

### 12.3 The frontend adapter

The real routes pass `source="server"` and the isolated preview passes
`source="fixture"`; `OnlyFansWorkspace` requires the prop rather than defaulting
it, so a new surface that forgets it fails the typecheck instead of quietly
rendering sample data.

`lib/onlyfans-preview/server-data-source.ts` speaks to the dashboard's own
handlers and nothing else. Its transport is a **constructor argument**, injected
by the checks and defaulting to `fetch` in the dashboard; there is no environment
flag anywhere in the path, so no configuration exists that makes production read
from a fake. The module imports no fixture and has no fallback branch.

`lib/onlyfans-preview/sources.ts` is the only place that chooses between the two,
and it refuses fixture mode outright in a production build.

Transport outcomes map onto the vocabulary the components already render:
`unavailable` (nothing to read from), `denied` and `failed` (both an error the
operator sees) and `ok` — which becomes `empty` rather than a zero-row list when
the answer really is empty.

### 12.4 Production behaviour

| Situation | What the operator sees |
|---|---|
| No backend configured | `unavailable`, with the reason, on Accounts and Inbox. Never sample data, never an empty list |
| Backend rejected our credential | `unavailable` — an operational problem on our side, not a refusal of the operator |
| Backend 503 or unreachable | `unavailable` |
| Backend 403 or 404 | A refusal |
| Anything else | An error, labelled as one |
| Live surface | No sample-data badge and no developer controls, because both would describe something untrue |
| Any mutation | Not offered. `submitCommand` on the live source throws, and the routes expose no write handler |

An unconfigured route renders rather than throwing: that is asserted, not
assumed — see `npm run test:onlyfans-unconfigured` in 12.5.

### 12.5 Verification

All commands run from `twin-dashboard-of-d0` on 18 October 2026. Everything is
offline: no dashboard server was started, no account, session, provider or
database was contacted, and no live route was fetched.

| # | Command | Result |
|---|---|---|
| 1 | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | exit 0, no diagnostics |
| 2 | `node node_modules/typescript/bin/tsc --noEmit -p preview/onlyfans/tsconfig.json` | exit 0, no diagnostics |
| 3 | `npm run test:onlyfans-read` | exit 0, **103** checks, 0 failed |
| 4 | `npm run test:onlyfans-unconfigured` | exit 0, **39** checks, 0 failed |
| 5 | `npm run test:onlyfans-preview` | exit 0, **101/101** |
| 6 | `npm run test:channel-integration` | exit 0, **97** checks, 0 failed |
| 7 | `node preview/onlyfans/scripts/check-isolation.mjs` | exit 0, **70/70** browser checks |
| 8 | `check-sidebar-layout`, `check-lynq-management`, `check-creator-workspace`, `check-creator-routing` | exit 0 each |
| 9 | `node preview/onlyfans/scripts/shots.mjs` | exit 0, 14 captures written |

What the read checks actually drive, in eight groups: the operator session being
verified positively and nothing else admitted; an answer crossing a creator or
account boundary being refused; the selected account surviving a reload and a
Back; paging keeping its cursor, its rows and its scope; a late response unable
to overwrite a newer selection; failures staying visible with no fixture
fallback; the backend client mapping every answer honestly; and the transport
reading the handlers' envelopes and only those.

`test:onlyfans-unconfigured` is new in this step and closes a gap the read checks
left open: they prove the *state* is produced, and it proves the surface *renders*
it — transport to adapter to request state to markup — with no account card, no
zero and no sample-data badge invented, and no composer, send, thread or action
column left over. Group 5 of that file renders the same components against a
fixture source and shows the cards, the badge, the composer and the send control,
so the absence on the live surface is demonstrably the state and not the
component.

One observation from this run, recorded rather than hidden: `shots.mjs` failed
twice at the Accounts step while the dev server was recompiling (the log shows a
transient 500 on an inbox read), then completed on the third run with all 14
captures. The Accounts surface itself was verified independently at the same URL
before and after: 2 cards, no console errors, both belonging to the creator the
header names. The screenshot directory also still holds three files from an older
naming scheme (`mobile-02-accounts`, `mobile-02-inbox-collapsed`,
`mobile-03-controls-open`); they are stale review artifacts, and they were left
in place because deletion is outside this step's boundaries.

### 12.6 Remaining backend dependencies

These are the exact things that must exist before a live read returns anything
other than `unavailable`. None of them is implemented by this step.

1. **A running service** exposing the three documented reads —
   `GET /onlyfans/accounts`, `GET /onlyfans/accounts/{accountId}/conversations`,
   `GET /onlyfans/accounts/{accountId}/conversations/{conversationId}`.
2. **The envelopes the port parses.** The account read must answer
   `{ accounts: [...] }`; the list read `{ page: { items: [...], nextCursor } }`;
   the conversation read `{ conversation: {...} }`. Anything else is reported as
   `backend_malformed_response` rather than guessed at. The port validates
   **shape, not `schemaVersion`** — that assertion should be added when a real
   backend exists, since a payload that keeps the same field names but changes
   meaning would pass today.
3. **A service credential** the backend accepts as a bearer token, and the two
   environment variables set for the environment: `ONLYFANS_API_BASE_URL` and
   `ONLYFANS_API_TOKEN`. Absent, blank or malformed, the live path stays disabled
   by design.
4. **The binding store**, on the backend side, as the authority for creator-to-
   account binding and for this operator's authorization over an account. The
   dashboard cannot verify a binding itself, and does not try: it forwards the
   request and checks the answer does not cross scopes.
5. **The projection fields the view models already declare** — connection health
   and its reason, automation mode, takeover state, capabilities, and explicit
   freshness on every read. A backend that omits freshness makes a cached answer
   indistinguishable from a current one.
6. **Conversation detail with messages**, including each message's delivery
   outcome and the conversation revision a command would be decided against.
7. **A delivery authority** for family 7. Until it exists, every mutation —
   send, takeover, reconnect, pause — is unavailable outside the isolated
   preview, and this step added no route that could pretend otherwise.

Two further notes for whoever wires this up. Account scope reaches the backend as
a request parameter, so the backend must answer a creator or account this operator
may not read with a refusal rather than an empty list — an empty list is rendered
as "no accounts", which would be a different, wrong story. And the cursors are
opaque passthrough: the dashboard neither mints nor bounds them.

### 12.7 Protected, and one thing to review

| Area | State |
|---|---|
| Existing Telegram routes, identity, access, agency policy, view-as | untouched |
| Engine, sending, database, authentication, media and model configuration | untouched |
| `lib/query-cache.ts`, `lib/dashboard-data.ts`, every pre-existing `app/api/**` route | untouched |
| Shared navigation (`Sidebar`, `TopBar`, `MobileMenu`, `MainShell`, `lib/page-meta.ts`) | unchanged by this step; the extension was made in section 10 and is already recorded there |
| Added by this step | `lib/onlyfans/`, `lib/onlyfans-preview/server-data-source.ts` and `scope.ts`, `app/api/onlyfans/**`, `scripts/check-onlyfans-read.ts`, `scripts/check-onlyfans-unconfigured.tsx`, two `package.json` entries |

The one thing that needs a human decision rather than a check: `?account=` now
appears in the address bar on the OnlyFans routes, which means an account id is
in the browser's history and in anything that copies a URL. It is an opaque
internal id and it grants nothing — the server still decides — but it is a
deliberate change in what is visible, and it should be accepted or rejected
explicitly.

### 12.8 What this step explicitly did not do

No new login system, no full database port, no delivery engine, no media
pipeline, and no screen beyond the Accounts and Inbox surfaces that already
existed. No private conversation, live account or provider session was reached at
any point, no send was issued, and nothing was activated, deployed, committed or
pushed. OF-D1 remains the next stage, and it still needs the contracts in
`API_CONTRACTS.md` families 3 to 7 reviewed and a backend to talk to.
