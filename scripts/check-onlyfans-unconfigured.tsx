// Offline proof that an unconfigured OnlyFans surface *renders* an explicit
// unavailable state instead of throwing during render.
//
// check-onlyfans-read.ts proves the states the read boundary produces. This file
// proves what the operator sees for the one state the real routes are in today —
// no backend configured — by running the same chain the dashboard runs:
//
//   fake transport -> live read adapter -> request state -> component -> markup
//
// Nothing is bypassed and nothing is reached. There is no network, no database,
// no provider and no account: the transport is a fake handed in at the test
// boundary, exactly as the adapter's design intends, and renderToStaticMarkup
// runs the real presentational components the routes mount.
//
// The contrast matters as much as the assertion: the same components *do* render
// cards, a composer and the sample-data badge when a fixture source feeds them,
// so "no sample data on a live surface" is checked against a component that is
// demonstrably capable of showing it.

import React from "react";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { createServerOnlyFansDataSource } from "../lib/onlyfans-preview/server-data-source";
import type { OnlyFansTransport } from "../lib/onlyfans-preview/server-data-source";
import {
  createFixtureOnlyFansDataSource,
  operatorViewer,
} from "../lib/onlyfans-preview/fixture-data-source";
import type { OnlyFansDataSource } from "../lib/onlyfans-preview/data-source";
import type {
  ConversationDetail,
  ConversationSummary,
  CursorPage,
  OfAccount,
  RequestState,
} from "../lib/onlyfans-preview/types";

// The dashboard's components are compiled by Next, whose JSX runtime is
// automatic, so they never have to import `React`. This check is compiled by
// tsx against the repository's tsconfig (`jsx: preserve`, i.e. the classic
// transform), which emits `React.createElement` and therefore needs `React` in
// scope. Putting it on the global before the components load is the whole fix,
// and it lives here rather than in a product file: nothing the dashboard ships
// is changed to suit a test. The components are therefore loaded inside `main`,
// after that assignment, rather than imported at the top of the file.
type AccountsViewComponent = (typeof import("../components/onlyfans-preview/AccountsView"))["default"];
type InboxViewComponent = (typeof import("../components/onlyfans-preview/InboxView"))["default"];

let AccountsView: AccountsViewComponent;
let InboxView: InboxViewComponent;

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

function group(title: string) {
  console.log("\n" + title);
}

/** The message the read service uses when this environment has no backend. */
const NOT_CONFIGURED =
  "The OnlyFans backend is not configured for this environment. No account, session or " +
  "conversation can be read until it is.";

/** A transport that says, for every read, that there is nothing to read from. */
const unconfigured: OnlyFansTransport = {
  kind: "fake",
  readAccounts: async () => ({ outcome: "unavailable", message: NOT_CONFIGURED }),
  readConversations: async () => ({ outcome: "unavailable", message: NOT_CONFIGURED }),
  readConversation: async () => ({ outcome: "unavailable", message: NOT_CONFIGURED }),
};

/** A transport that fails: attempted, and did not succeed. Not the same thing. */
const failing: OnlyFansTransport = {
  kind: "fake",
  readAccounts: async () => ({
    outcome: "failed",
    message: "The OnlyFans backend failed to answer.",
  }),
  readConversations: async () => ({
    outcome: "failed",
    message: "The OnlyFans backend failed to answer.",
  }),
  readConversation: async () => ({
    outcome: "failed",
    message: "The OnlyFans backend failed to answer.",
  }),
};

const live = (transport: OnlyFansTransport): OnlyFansDataSource =>
  createServerOnlyFansDataSource({ transport });

const fixture = (): OnlyFansDataSource =>
  createFixtureOnlyFansDataSource({ viewer: operatorViewer() });

const ACCOUNT_AVA = "of-acc-ava-001";

function renderAccounts(state: RequestState<OfAccount[]>, sourceLabel: string, chrome = false) {
  return renderToStaticMarkup(
    <AccountsView
      accountsState={state}
      activeAccountId={null}
      onSelectAccount={() => {}}
      readOnly={false}
      creatorName={null}
      sourceLabel={sourceLabel}
      showPreviewChrome={chrome}
    />,
  );
}

function renderInbox(options: {
  accounts: RequestState<OfAccount[]>;
  activeAccount: OfAccount | null;
  conversations: RequestState<CursorPage<ConversationSummary>>;
  selectedConversationId: string | null;
  detail: RequestState<ConversationDetail> | null;
  chrome?: boolean;
}) {
  return renderToStaticMarkup(
    <InboxView
      accountsState={options.accounts}
      activeAccount={options.activeAccount}
      activeAccountId={options.activeAccount?.accountId ?? null}
      onSelectAccount={() => {}}
      conversations={options.conversations}
      selectedConversationId={options.selectedConversationId}
      onSelectConversation={() => {}}
      detailState={options.detail}
      viewer={operatorViewer()}
      onCommand={() => {}}
      commandResult={null}
      nextCursor={null}
      loadingMore={false}
      onLoadMore={() => {}}
      showPreviewChrome={options.chrome ?? false}
    />,
  );
}

async function main() {
  (globalThis as unknown as { React: typeof React }).React = React;
  // Next handles CSS modules in production. This markup-only Node check
  // leaves styling to the production build, just like the other UI fixtures.
  const requireNative = createRequire(import.meta.url);
  requireNative.extensions[".css"] = (module) => { module.exports = {}; };
  ({ default: AccountsView } = await import("../components/onlyfans-preview/AccountsView"));
  ({ default: InboxView } = await import("../components/onlyfans-preview/InboxView"));

  group("1. The unconfigured chain produces `unavailable`, not an empty list");
  {
    const accounts = await live(unconfigured).listAccounts({});
    check(
      "an unconfigured transport reads as unavailable",
      accounts.status === "unavailable",
      JSON.stringify(accounts.status),
    );
    check(
      "and it carries the read service's own explanation",
      accounts.status === "unavailable" && accounts.message === NOT_CONFIGURED,
    );

    const conversations = await live(unconfigured).listConversations(ACCOUNT_AVA);
    check("so does a conversation list", conversations.status === "unavailable");
    const detail = await live(unconfigured).getConversation(ACCOUNT_AVA, "of-conv-anything");
    check("so does a single conversation", detail.status === "unavailable");
  }

  group("2. The Accounts surface renders that state instead of throwing");
  {
    const state = await live(unconfigured).listAccounts({});
    let markup = "";
    let threw: unknown = null;
    try {
      markup = renderAccounts(state, "Live");
    } catch (error) {
      threw = error;
    }
    check("rendering does not throw", threw === null, String(threw));
    check(
      "the surface is the OnlyFans accounts surface",
      markup.includes('data-of-surface="onlyfans-accounts"'),
    );
    check("it names the missing backend", markup.includes("No OnlyFans backend is connected"));
    check("and repeats the read's own reason", markup.includes(NOT_CONFIGURED));
    check("the state is rendered as a warning, not as an error", markup.includes('data-of-state="warn"'));
    check("no error tone is used for an unconfigured environment", !markup.includes('data-of-state="crit"'));
    check("no account card is invented", !markup.includes("data-of-account-id"));
    check("no zero is shown where the truth is unknown", !markup.includes(">0<"));
    check("no sample-data badge appears over a live read", !markup.includes("Sample data"));
    check(
      "and no sample-data notice — which is what carries the controls — appears",
      !markup.includes("data-of-preview-notice"),
    );
  }

  group("3. The Inbox surface renders it too, with nothing actionable left over");
  {
    const state = await live(unconfigured).listAccounts({});
    let markup = "";
    let threw: unknown = null;
    try {
      markup = renderInbox({
        accounts: state,
        activeAccount: null,
        conversations: { status: "loading" },
        selectedConversationId: null,
        detail: null,
      });
    } catch (error) {
      threw = error;
    }
    check("rendering does not throw", threw === null, String(threw));
    check("the surface is the OnlyFans inbox surface", markup.includes('data-of-surface="onlyfans-inbox"'));
    check("it says there is no backend", markup.includes("No OnlyFans backend is connected"));
    check("no composer is offered", !markup.includes("data-of-composer"));
    check("no send control is offered", !markup.includes("data-of-send"));
    check("no thread is rendered", !markup.includes("data-of-thread"));
    check("no conversation rows are rendered", !markup.includes("data-of-conversation-id"));
    check("and no action column is rendered", !markup.includes("data-of-actions"));
  }

  group("4. A failed read is an error, and empty is neither");
  {
    const failed = await live(failing).listAccounts({});
    check("a failed read is an error, not an absence", failed.status === "error");
    const errorMarkup = renderAccounts(failed, "Live");
    check("the Accounts surface shows the error tone", errorMarkup.includes('data-of-state="crit"'));
    check("it says the view could not be loaded", errorMarkup.includes("This view could not be loaded"));
    check(
      "and it does not claim the backend is missing",
      !errorMarkup.includes("No OnlyFans backend is connected"),
    );

    const emptyMarkup = renderAccounts({ status: "empty" }, "Live");
    check("an empty read is its own state", emptyMarkup.includes("Nothing here yet"));
    check("and it is neither an error", !emptyMarkup.includes("This view could not be loaded"));
    check("nor a missing backend", !emptyMarkup.includes("No OnlyFans backend is connected"));
  }

  group("5. The same components do show sample data when a fixture source feeds them");
  {
    const source = fixture();
    const accounts = await source.listAccounts({});
    check("the fixture source is labelled as sample data", source.label === "Sample data");
    check("and it reads ready", accounts.status === "ready", JSON.stringify(accounts.status));

    const ready = accounts.status === "ready" ? accounts.data : [];
    const accountsMarkup = renderAccounts(accounts, source.label, true);
    check("the fixture surface renders account cards", accountsMarkup.includes("data-of-account-id"));
    check("and the sample-data badge", accountsMarkup.includes("Sample data"));
    check("and the sample-data notice, where the controls sit", accountsMarkup.includes("data-of-preview-notice"));
    check(
      "and none of that is present when the surface is not told to show it",
      !renderAccounts(accounts, source.label, false).includes("data-of-preview-notice"),
    );

    const active = ready.find((account) => account.accountId === ACCOUNT_AVA) ?? null;
    const conversations = await source.listConversations(ACCOUNT_AVA);
    const rows = conversations.status === "ready" ? conversations.data.items : [];
    const first = rows[0] ?? null;
    const detail = first ? await source.getConversation(ACCOUNT_AVA, first.conversationId) : null;
    const inboxMarkup = renderInbox({
      accounts,
      activeAccount: active,
      conversations,
      selectedConversationId: first?.conversationId ?? null,
      detail,
      chrome: true,
    });
    check("the fixture inbox renders a thread", inboxMarkup.includes("data-of-thread"));
    check("with a composer", inboxMarkup.includes("data-of-composer"));
    check("and a send control", inboxMarkup.includes("data-of-send"));
    check(
      "so the absence of those on the live surface is the state, not the component",
      !inboxMarkup.includes("No OnlyFans backend is connected"),
    );
  }

  console.log("\n" + checks + " checks, " + failures + " failed.");
  if (failures > 0) {
    console.log(failures + " unconfigured-surface check(s) failed.");
    process.exitCode = 1;
  } else {
    console.log("OnlyFans unconfigured-surface checks passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
