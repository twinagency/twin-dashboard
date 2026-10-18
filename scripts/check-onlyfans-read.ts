// Checks for the scoped, read-only OnlyFans read boundary.
//
// These drive the real handler/adapter flow offline. The backend is a fake
// injected at the transport boundary, and the caller identity is supplied
// explicitly, so every case below is exercised without a session, a database, a
// provider or a running server.
//
// What they establish:
//
//   1. the internal operator session must be verified POSITIVELY — a null
//      `getDashboardAccess()` is not authentication, an agency is not the
//      operator, and a view-as session is refused;
//   2. an answer can never cross a creator or an account boundary;
//   3. the selected account travels in the URL, and a refresh or a Back press
//      lands on it, while an unauthorized id selects nothing;
//   4. paging keeps its cursor and its rows, and a late response cannot
//      overwrite a newer selection;
//   5. backend failures produce a visible state, and an unconfigured backend
//      produces `unavailable` — never fixtures.
//
// Run: npm run test:onlyfans-read

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ONLYFANS_PREVIEW_SCHEMA_VERSION } from "../lib/onlyfans-preview/types";
import type {
  ConversationDetail,
  ConversationSummary,
  CursorPage,
  OfAccount,
  RequestState,
} from "../lib/onlyfans-preview/types";
import { authorizeRead, readAccounts, readConversation, readConversations } from "../lib/onlyfans/reads";
import type { ReadAuth, ReadDenial } from "../lib/onlyfans/reads";
import {
  createHttpOnlyFansBackend,
  configuredOnlyFansBackend,
  ONLYFANS_API_BASE_ENV,
  ONLYFANS_API_TOKEN_ENV,
  ONLYFANS_SCHEMA_VERSION_HEADER,
} from "../lib/onlyfans/backend";
import type { BackendResult, OnlyFansBackend } from "../lib/onlyfans/backend";
import {
  createFetchOnlyFansTransport,
  createServerOnlyFansDataSource,
} from "../lib/onlyfans-preview/server-data-source";
import type { OnlyFansTransport } from "../lib/onlyfans-preview/server-data-source";
import { createOnlyFansDataSource } from "../lib/onlyfans-preview/sources";
import { OnlyFansApiNotConfiguredError } from "../lib/onlyfans-preview/data-source";
import {
  parseWorkspaceScope,
  scopeId,
  scopeQueryString,
  scopeWithAccount,
  scopeWithCreator,
  workspaceHref,
} from "../lib/onlyfans-preview/scope";
import {
  appendConversations,
  applyConversations,
  beginScope,
  initialSelectionState,
  nextConversationCursor,
  requestConversations,
  requestMoreConversations,
  selectConversation,
} from "../lib/onlyfans-preview/selection";
import { accounts as fixtureAccounts, conversationDetails } from "../lib/onlyfans-preview/fixtures";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

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

function source(relative: string): string {
  const path = join(repoRoot, relative);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/**
 * Source with comments removed, so a comment can neither satisfy an assertion
 * nor trip one. The `[^:]` guard keeps `https://` out of the comment rule.
 */
function code(relative: string): string {
  return source(relative)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const OPERATOR: ReadAuth = { operatorSession: true, agency: false, viewAs: false };

const AVA = "of-acc-ava-001";
const AVA_SECOND = "of-acc-ava-005";
const NOVA = "of-acc-nova-002";
const CREATOR_AVA = "creator-ava-0001";
const CREATOR_NOVA = "creator-nova-0002";

function account(id: string): OfAccount {
  const found = fixtureAccounts.find((candidate) => candidate.accountId === id);
  if (!found) throw new Error("Fixture account " + id + " is missing.");
  return found;
}

/** A backend whose answers are supplied per case. Nothing else is reachable. */
function fakeBackend(handlers: {
  accounts?: () => Promise<BackendResult<OfAccount[]>>;
  conversations?: (
    accountId: string,
    cursor: string | null,
  ) => Promise<BackendResult<CursorPage<ConversationSummary>>>;
  conversation?: (
    accountId: string,
    conversationId: string,
  ) => Promise<BackendResult<ConversationDetail>>;
}): OnlyFansBackend {
  return {
    label: "fake",
    listAccounts: handlers.accounts ?? (async () => ({ ok: true, data: [] })),
    listConversations:
      handlers.conversations ?? (async () => ({ ok: true, data: { items: [], nextCursor: null } })),
    getConversation:
      handlers.conversation ??
      (async () => ({
        ok: false,
        status: 404,
        code: "backend_404",
        error: "That record is not available.",
      })),
  };
}

/**
 * The read service behind the transport, so the checks drive the same path the
 * dashboard does: route handler -> read service -> adapter -> request state.
 *
 * Nothing is bypassed: the authorization rule and every scope invariant run on
 * each call, and an outcome the service refuses arrives at the adapter as a
 * denial rather than as data.
 */
function serviceTransport(auth: ReadAuth, backend: OnlyFansBackend | null): OnlyFansTransport {
  const failure = (result: ReadDenial): { outcome: "unavailable" | "denied" | "failed"; message: string } =>
    result.state === "unavailable"
      ? { outcome: "unavailable", message: result.error }
      : result.state === "denied"
        ? { outcome: "denied", message: result.error }
        : { outcome: "failed", message: result.error };

  return {
    kind: "fake",
    async readAccounts(scope) {
      const result = await readAccounts(
        { auth, backend },
        { creatorId: scope.creatorId ?? null, accountId: scope.accountId ?? null },
      );
      return result.ok ? { outcome: "ok", data: result.body.accounts } : failure(result);
    },
    async readConversations(accountId, cursor) {
      const result = await readConversations({ auth, backend }, { accountId, cursor });
      return result.ok ? { outcome: "ok", data: result.body.page } : failure(result);
    },
    async readConversation(accountId, conversationId) {
      const result = await readConversation({ auth, backend }, { accountId, conversationId });
      return result.ok ? { outcome: "ok", data: result.body.conversation } : failure(result);
    },
  };
}

async function main() {
// ── 1. Positive authorization ─────────────────────────────────────────────

group("1. The operator session is verified positively, and nothing else is admitted");
{
  check(
    "a request with no verified session is refused",
    authorizeRead({ operatorSession: false, agency: false, viewAs: false })?.status === 401,
  );
  check(
    "an agency identity alone does not authorize an OnlyFans read",
    authorizeRead({ operatorSession: false, agency: true, viewAs: false })?.status === 401,
  );
  check(
    "an agency session is refused even with a verified session behind it",
    authorizeRead({ operatorSession: true, agency: true, viewAs: false })?.status === 403,
  );
  check(
    "a view-as session is refused",
    authorizeRead({ operatorSession: true, agency: false, viewAs: true })?.status === 403,
  );
  check("the verified internal operator is admitted", authorizeRead(OPERATOR) === null);

  // The wrapper is the only thing that builds the context, and it must ask for a
  // real session rather than treating a null dashboard access as identity.
  const wrapper = source("lib/onlyfans/route.ts");
  check("the route wrapper verifies the session cookie itself", /isAuthed\(\)/.test(wrapper));
  check(
    "and it does not treat a null dashboard access as authentication",
    /operatorSession:\s*await isAuthed\(\)/.test(wrapper),
  );
  check(
    "it consults neither the environment nor the dashboard's no-auth switch",
    !/process\.env/.test(code("lib/onlyfans/route.ts")) &&
      !/DASHBOARD_NO_AUTH/.test(code("lib/onlyfans/route.ts")),
  );
  check(
    "nor does the read service",
    !/process\.env|DASHBOARD_NO_AUTH/.test(code("lib/onlyfans/reads.ts")),
  );
  check(
    "every OnlyFans route calls it before doing anything",
    [
      "app/api/onlyfans/accounts/route.ts",
      "app/api/onlyfans/accounts/[accountId]/conversations/route.ts",
      "app/api/onlyfans/accounts/[accountId]/conversations/[conversationId]/route.ts",
    ].every((file) => /requireOnlyFansRead\(\)/.test(source(file))),
  );
  check(
    "and the read-only boundary exposes no write handler",
    [
      "app/api/onlyfans/accounts/route.ts",
      "app/api/onlyfans/accounts/[accountId]/conversations/route.ts",
      "app/api/onlyfans/accounts/[accountId]/conversations/[conversationId]/route.ts",
    ].every((file) => !/export async function (POST|PUT|PATCH|DELETE)/.test(source(file))),
  );
}

// ── 2. Cross-account and cross-creator denial ─────────────────────────────

group("2. An answer can never cross a creator or an account boundary");
{
  const crossingCreator = await readAccounts(
    {
      auth: OPERATOR,
      backend: fakeBackend({ accounts: async () => ({ ok: true, data: [account(NOVA)] }) }),
    },
    { creatorId: CREATOR_AVA, accountId: null },
  );
  check(
    "an account belonging to another creator is refused",
    !crossingCreator.ok && crossingCreator.status === 502 && crossingCreator.code === "scope_violation",
  );
  check(
    "and the refusal does not repeat the record it refused",
    !crossingCreator.ok && !JSON.stringify(crossingCreator).includes(NOVA),
  );

  const ownCreator = await readAccounts(
    {
      auth: OPERATOR,
      backend: fakeBackend({
        accounts: async () => ({ ok: true, data: [account(AVA), account(AVA_SECOND)] }),
      }),
    },
    { creatorId: CREATOR_AVA, accountId: null },
  );
  check("the creator's own accounts are returned", ownCreator.ok && ownCreator.body.accounts.length === 2);
  check(
    "and the read model carries the requested scope rather than a guess",
    ownCreator.ok && ownCreator.body.scope.creatorId === CREATOR_AVA,
  );
  check(
    "the read model is stamped with the schema version",
    ownCreator.ok && ownCreator.body.schemaVersion === ONLYFANS_PREVIEW_SCHEMA_VERSION,
  );

  const detail = conversationDetails["of-conv-ava-1001"];
  const crossingAccount = await readConversation(
    { auth: OPERATOR, backend: fakeBackend({ conversation: async () => ({ ok: true, data: detail }) }) },
    { accountId: AVA_SECOND, conversationId: detail.conversationId },
  );
  check(
    "a conversation belonging to another account is refused",
    !crossingAccount.ok && crossingAccount.code === "scope_violation",
  );

  const mismatchedId = await readConversation(
    { auth: OPERATOR, backend: fakeBackend({ conversation: async () => ({ ok: true, data: detail }) }) },
    { accountId: AVA, conversationId: "of-conv-ava-9999" },
  );
  check(
    "a backend answering with a different conversation than the one asked for is refused",
    !mismatchedId.ok && mismatchedId.code === "scope_violation",
  );

  const listCrossing = await readConversations(
    {
      auth: OPERATOR,
      backend: fakeBackend({
        conversations: async () => ({ ok: true, data: { items: [detail.summary], nextCursor: null } }),
      }),
    },
    { accountId: NOVA, cursor: null },
  );
  check(
    "a list carrying another account's rows is refused",
    !listCrossing.ok && listCrossing.code === "scope_violation",
  );

  const refused = await readConversation(
    {
      auth: OPERATOR,
      backend: fakeBackend({
        conversation: async () => ({
          ok: false,
          status: 404,
          code: "backend_404",
          error: "That record is not available.",
        }),
      }),
    },
    { accountId: AVA, conversationId: "of-conv-ava-1001" },
  );
  check(
    "a backend refusal is passed through as a denial",
    !refused.ok && refused.status === 404 && refused.state === "denied",
  );
}

// ── 3. The selected account travels in the URL ────────────────────────────

group("3. The selected account is carried in the URL and survives a reload");
{
  const params = new URLSearchParams();
  check("an empty URL asks for nothing", parseWorkspaceScope(params).accountId === null);
  check("and names no creator", parseWorkspaceScope(params).creatorId === null);

  const scoped = { creatorId: CREATOR_AVA, accountId: AVA };
  const href = workspaceHref("/onlyfans/inbox", scoped);
  check(
    "a scoped link carries both ids",
    href === "/onlyfans/inbox?creator=" + CREATOR_AVA + "&account=" + AVA,
    href,
  );
  check(
    "and reloading that link restores the same scope",
    JSON.stringify(parseWorkspaceScope(new URL(href, "https://x").searchParams)) ===
      JSON.stringify(scoped),
  );
  check(
    "the query string is empty when nothing is selected",
    scopeQueryString({ creatorId: null, accountId: null }) === "",
  );

  // A Back press restores the previous URL, and the account scope is read from
  // the URL, so this is the same case as the reload above. What matters is that
  // no component state can disagree with the address bar.
  const back = workspaceHref("/onlyfans/inbox", { creatorId: CREATOR_AVA, accountId: AVA_SECOND });
  check(
    "a Back to another account reads that account out of the URL",
    parseWorkspaceScope(new URL(back, "https://x").searchParams).accountId === AVA_SECOND,
  );

  check("a path-traversal id is not a request", scopeId("../../etc/passwd") === null);
  check("an over-long id is not a request", scopeId("a".repeat(65)) === null);
  check("an empty id is not a request", scopeId("") === null && scopeId(null) === null);
  check(
    "a malformed id in the URL selects nothing rather than being forwarded",
    parseWorkspaceScope(new URLSearchParams({ account: "<script>", creator: CREATOR_AVA }))
      .accountId === null,
  );

  check(
    "changing the creator drops the account selected under the old one",
    scopeWithCreator({ creatorId: CREATOR_AVA, accountId: AVA }, CREATOR_NOVA).accountId === null,
  );
  check(
    "and keeping the creator keeps the account",
    scopeWithCreator({ creatorId: CREATOR_AVA, accountId: AVA }, CREATOR_AVA).accountId === AVA,
  );
  check(
    "selecting an account keeps the creator",
    scopeWithAccount({ creatorId: CREATOR_AVA, accountId: null }, AVA).creatorId === CREATOR_AVA,
  );

  // The workspace is wired to the URL, and to the server's answer rather than to
  // its own idea of who is authorized.
  const workspace = source("components/onlyfans-preview/OnlyFansWorkspace.tsx");
  check("the workspace parses its scope from the URL", /parseWorkspaceScope\(searchParams\)/.test(workspace));
  check("the workspace writes the scope back to the URL", /router\.replace\(/.test(workspace));
  check("an account the read did not return is not selected", /authorized\.includes\(requestedId\)/.test(workspace));
  check(
    "the requested account is passed to the read as a scope, not as an assertion",
    /listAccounts\(\{ creatorId: requestedScope\.creatorId, accountId: requestedScope\.accountId \}\)/.test(
      workspace,
    ),
  );
  check("no fixture creator is hardcoded in the workspace", !/PREVIEW_CREATORS\[0\]/.test(workspace));
  check(
    "and the workspace does not build a second, local account filter",
    !/creatorAccountIds/.test(workspace),
  );

  const accountsView = source("components/onlyfans-preview/AccountsView.tsx");
  check(
    "Accounts -> Open inbox scopes the link to that account",
    /workspaceHref\("\/onlyfans\/inbox", \{/.test(accountsView) &&
      /accountId: account\.accountId/.test(accountsView),
  );
  check(
    "and takes the creator from the server's binding rather than a fixture index",
    /creatorId: account\.binding\.creatorId/.test(accountsView),
  );
}

// ── 4. Paging ─────────────────────────────────────────────────────────────

group("4. Paging keeps its cursor, its rows and its scope");
{
  const cursors: (string | null)[] = [];
  const pageTwo: CursorPage<ConversationSummary> = {
    items: [{ ...conversationDetails["of-conv-ava-1001"].summary, conversationId: "of-conv-ava-1004" }],
    nextCursor: null,
  };
  const backend = fakeBackend({
    conversations: async (accountId, cursor) => {
      check("the page read is scoped to " + AVA, accountId === AVA, accountId);
      cursors.push(cursor);
      const items = cursor ? pageTwo.items : [conversationDetails["of-conv-ava-1001"].summary];
      return { ok: true, data: { items, nextCursor: cursor ? null : "page-2" } };
    },
  });

  // Driven through the handler and the adapter, exactly as the dashboard does.
  const source = createServerOnlyFansDataSource({ transport: serviceTransport(OPERATOR, backend) });

  let selection = initialSelectionState();
  const pending = requestConversations(selection, AVA);
  selection = pending.state;
  const firstPage = await source.listConversations(AVA);
  check("the first page arrives as ready data", firstPage.status === "ready");
  selection = applyConversations(selection, AVA, pending.generation, pending.seq, firstPage).state;
  check("the first page lands on the list", selection.byAccount[AVA].conversations.status === "ready");
  check(
    "and it tells the client where the next page is",
    nextConversationCursor(selection, AVA) === "page-2",
    String(nextConversationCursor(selection, AVA)),
  );

  // The components' own "load more": ask with the list's cursor, then append.
  const cursor = nextConversationCursor(selection, AVA);
  const more = requestMoreConversations(selection, AVA);
  selection = more.state;
  const secondPage = await source.listConversations(AVA, cursor);
  check("the cursor is forwarded to the backend", cursors[1] === "page-2", String(cursors[1]));
  check("and the second page is the backend's second page", secondPage.status === "ready");
  selection = appendConversations(selection, AVA, more.generation, more.seq, secondPage).state;
  const list = selection.byAccount[AVA].conversations;
  check(
    "appending the next page keeps the rows that were already there",
    list.status === "ready" && list.data.items.length === 2,
    list.status === "ready" ? String(list.data.items.length) : list.status,
  );
  check(
    "and the list now says there is no further page",
    list.status === "ready" && list.data.nextCursor === null,
  );
}

// ── 5. Stale and out-of-order responses ───────────────────────────────────

group("5. Incomplete synchronization stays stale, and late responses cannot overwrite newer selections");
{
  const unverified = { asOf: null, maxAgeSeconds: 60, stale: true };
  const older = { asOf: "2026-10-17T09:00:00.000Z", maxAgeSeconds: 60, stale: true };
  const current = { asOf: "2026-10-18T09:00:00.000Z", maxAgeSeconds: 60, stale: false };
  const detail = conversationDetails["of-conv-ava-1001"];
  const source = createServerOnlyFansDataSource({
    transport: serviceTransport(OPERATOR, fakeBackend({
      accounts: async () => ({ ok: true, data: [
        { ...account(AVA), syncFreshness: unverified },
        { ...account(NOVA), syncFreshness: current },
      ] }),
      conversations: async () => ({ ok: true, data: { items: [
        { ...detail.summary, freshness: older },
        { ...detail.summary, conversationId: "of-conv-ava-1004", freshness: unverified },
      ], nextCursor: null } }),
      conversation: async () => ({ ok: true, data: { ...detail, freshness: unverified } }),
    })),
  });
  const accounts = await source.listAccounts({});
  check("successful account reads preserve unknown synchronization", accounts.status === "stale" && accounts.freshness.asOf === null);
  const selected = await source.getAccount(AVA, {});
  check("selecting an unverified account keeps it stale", selected.status === "stale");
  check("a current account is not made stale by another account", (await source.getAccount(NOVA, {})).status === "ready");
  const page = await source.listConversations(AVA);
  check("unknown synchronization wins over an older known timestamp", page.status === "stale" && page.freshness.asOf === null && page.data.items.length === 2);
  check("a successful detail read preserves its incomplete synchronization", (await source.getConversation(AVA, detail.summary.conversationId)).status === "stale");
}
{
  // The slow backend answers after a delay, so the newer read of the same list
  // can be applied first and the late one has something to lose to.
  const slowSource = createServerOnlyFansDataSource({
    transport: serviceTransport(
      OPERATOR,
      fakeBackend({
        conversations: async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return {
            ok: true,
            data: { items: [conversationDetails["of-conv-ava-1001"].summary], nextCursor: null },
          };
        },
      }),
    ),
  });
  const emptySource = createServerOnlyFansDataSource({
    transport: serviceTransport(
      OPERATOR,
      fakeBackend({
        conversations: async () => ({ ok: true, data: { items: [], nextCursor: null } }),
      }),
    ),
  });

  let selection = initialSelectionState();
  const older = requestConversations(selection, AVA);
  selection = older.state;
  const newer = requestConversations(selection, AVA);
  selection = newer.state;
  const newest = await emptySource.listConversations(AVA);
  check("the newer read answers empty", newest.status === "empty");
  selection = applyConversations(selection, AVA, newer.generation, newer.seq, newest).state;
  check("the newer read is the one on screen", selection.byAccount[AVA].conversations.status === "empty");

  const late = await slowSource.listConversations(AVA);
  check("the deliberately slow read does answer", late.status === "ready");
  selection = applyConversations(selection, AVA, older.generation, older.seq, late).state;
  check(
    "the late read of the same list is dropped",
    selection.byAccount[AVA].conversations.status === "empty",
    selection.byAccount[AVA].conversations.status,
  );

  // A response from a previous scope cannot be applied after a scope reset, even
  // though the counters restart.
  let scoped = initialSelectionState();
  const before = requestConversations(scoped, AVA);
  scoped = before.state;
  scoped = beginScope(scoped);
  const after = requestConversations(scoped, AVA);
  scoped = after.state;
  check(
    "a scope reset moves the generation on",
    before.generation !== after.generation,
    before.generation + " vs " + after.generation,
  );
  scoped = applyConversations(scoped, AVA, before.generation, before.seq, late).state;
  check(
    "so an answer from the previous scope is refused",
    scoped.byAccount[AVA].conversations.status === "loading",
  );

  // A stale read is reported as stale and carries the freshness that says so.
  let stale = initialSelectionState();
  const request = requestConversations(stale, AVA);
  stale = request.state;
  const staleState = {
    status: "stale",
    data: { items: [conversationDetails["of-conv-ava-1001"].summary], nextCursor: null },
    freshness: { asOf: "2026-10-17T09:00:00.000Z", maxAgeSeconds: 60, stale: true },
  } as unknown as RequestState<CursorPage<ConversationSummary>>;
  stale = applyConversations(stale, AVA, request.generation, request.seq, staleState).state;
  check("a stale list is reported as stale", stale.byAccount[AVA].conversations.status === "stale");
  check(
    "and it carries the freshness, so it cannot read as current",
    stale.byAccount[AVA].conversations.status === "stale" &&
      stale.byAccount[AVA].conversations.freshness.stale === true,
  );

  stale = selectConversation(stale, AVA, "of-conv-ava-1001");
  check(
    "a conversation selected inside its own account is selected",
    stale.byAccount[AVA].selectedConversationId === "of-conv-ava-1001",
  );
}

// ── 6. Backend failures and no fixture fallback ───────────────────────────

group("6. Failures are visible, and nothing falls back to fixtures");
{
  const notConfigured = await readAccounts(
    { auth: OPERATOR, backend: null },
    { creatorId: null, accountId: null },
  );
  check(
    "an unconfigured backend reports unavailable rather than empty",
    !notConfigured.ok && notConfigured.status === 503 && notConfigured.state === "unavailable",
  );

  const credentialRejected = await readAccounts(
    {
      auth: OPERATOR,
      backend: fakeBackend({
        accounts: async () => ({ ok: false, status: 401, code: "backend_401", error: "nope" }),
      }),
    },
    { creatorId: null, accountId: null },
  );
  check(
    "a rejected service credential is an operational problem, not a refusal of the operator",
    !credentialRejected.ok && credentialRejected.state === "unavailable",
  );

  const failed = await readAccounts(
    {
      auth: OPERATOR,
      backend: fakeBackend({
        accounts: async () => ({ ok: false, status: 500, code: "backend_error", error: "boom" }),
      }),
    },
    { creatorId: null, accountId: null },
  );
  check("a backend failure is an error, not an absence", !failed.ok && failed.state === "error");

  const unreachable = await readAccounts(
    {
      auth: OPERATOR,
      backend: fakeBackend({
        accounts: async () => ({ ok: false, status: 503, code: "backend_unavailable", error: "down" }),
      }),
    },
    { creatorId: null, accountId: null },
  );
  check("an unreachable backend is unavailable, not an error", !unreachable.ok && unreachable.state === "unavailable");

  // The frontend adapter maps each outcome onto its own request state.
  const fakeTransport = {
    kind: "fake" as const,
    readAccounts: async () => ({ outcome: "unavailable" as const, message: "no backend" }),
    readConversations: async () => ({ outcome: "failed" as const, message: "boom" }),
    readConversation: async () => ({ outcome: "denied" as const, message: "not yours" }),
  };
  const serverSource = createServerOnlyFansDataSource({ transport: fakeTransport });
  check("live reads are identified as live", serverSource.kind === "live");
  check("an unavailable transport maps to unavailable", (await serverSource.listAccounts()).status === "unavailable");
  check("a failed transport maps to an error", (await serverSource.listConversations(AVA)).status === "error");
  check("a denied transport maps to an error", (await serverSource.getConversation(AVA, "c")).status === "error");

  const emptyTransport = {
    kind: "fake" as const,
    readAccounts: async () => ({ outcome: "ok" as const, data: [] as OfAccount[] }),
    readConversations: async () => ({ outcome: "ok" as const, data: { items: [], nextCursor: null } }),
    readConversation: async () => ({
      outcome: "ok" as const,
      data: conversationDetails["of-conv-ava-1001"],
    }),
  };
  const emptySource = createServerOnlyFansDataSource({ transport: emptyTransport });
  check("an empty authorized list is empty, not unavailable", (await emptySource.listAccounts()).status === "empty");
  check(
    "and an empty page is empty rather than a zero-row table",
    (await emptySource.listConversations(AVA)).status === "empty",
  );

  const serverSourceModule = source("lib/onlyfans-preview/server-data-source.ts");
  check("the live adapter imports no fixtures", !/from "\.\/fixtures"/.test(serverSourceModule));
  check(
    "and it references no fixture module or fixture builder",
    !/fixtureAccounts|createFixtureOnlyFansDataSource|conversationsByAccount/.test(serverSourceModule),
  );

  const fixtureSource = createOnlyFansDataSource({
    mode: "fixture",
    viewer: { kind: "operator", label: "Operator", canManage: true, scopedAccountIds: [AVA] },
  });
  check("fixture mode still labels itself as sample data", fixtureSource.label === "Sample data");

  const env = process.env as unknown as Record<string, string | undefined>;
  const previous = env.NODE_ENV;
  let guarded = false;
  try {
    env.NODE_ENV = "production";
    createOnlyFansDataSource({
      mode: "fixture",
      viewer: { kind: "operator", label: "Operator", canManage: true, scopedAccountIds: [AVA] },
    });
  } catch (error) {
    guarded = error instanceof OnlyFansApiNotConfiguredError;
  } finally {
    if (previous === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previous;
  }
  check("a production build still refuses fixture data outright", guarded);

  // The real routes declare themselves as server reads, so a live route cannot
  // render fixtures by omission, and the mode has no default to forget.
  check(
    "the real inbox route reads from the server",
    /source="server"/.test(source("app/onlyfans/inbox/page.tsx")),
  );
  check(
    "the real accounts route reads from the server",
    /source="server"/.test(source("app/onlyfans/accounts/page.tsx")),
  );
  check(
    "the isolated preview reads fixtures",
    /source="fixture"/.test(source("preview/onlyfans/app/onlyfans/inbox/page.tsx")),
  );
  check(
    "and the source mode has no default to get wrong",
    /source: OnlyFansSourceMode;/.test(source("components/onlyfans-preview/OnlyFansWorkspace.tsx")),
  );
  check(
    "the live surfaces render no sample-data chrome",
    /showPreviewChrome = sourceMode === "fixture"/.test(
      source("components/onlyfans-preview/OnlyFansWorkspace.tsx"),
    ),
  );
}

// ── 7. The backend client, driven by a fake HTTP boundary ─────────────────

group("7. The backend client maps every answer honestly");
{
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const respond = (body: unknown, status = 200, contentType = "application/json") =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": contentType },
    });

  const backend = createHttpOnlyFansBackend({
    baseUrl: "https://onlyfans.internal/",
    token: "service-token",
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return respond({ schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION, accounts: [account(AVA)] });
    }) as unknown as typeof fetch,
  });

  const ok = await backend.listAccounts({ creatorId: CREATOR_AVA });
  check("a valid answer is returned", ok.ok && ok.data.length === 1);
  check(
    "the request is built from the documented path",
    calls[0].url === "https://onlyfans.internal/onlyfans/api/v1/accounts?creator=" + CREATOR_AVA,
    calls[0].url,
  );
  const headers = new Headers(calls[0].init?.headers);
  check("it sends its own scoped credential", headers.get("authorization") === "Bearer service-token");
  check("it sends no browser cookie", calls[0].init?.credentials === "omit");
  check("and never caches a private read", calls[0].init?.cache === "no-store");
  check(
    "and it states the schema version it speaks, because the service requires one",
    headers.get(ONLYFANS_SCHEMA_VERSION_HEADER) === ONLYFANS_PREVIEW_SCHEMA_VERSION,
    String(headers.get(ONLYFANS_SCHEMA_VERSION_HEADER)),
  );

  const withStatus = (status: number) =>
    createHttpOnlyFansBackend({
      baseUrl: "https://onlyfans.internal",
      token: "t",
      fetchImpl: (async () => respond({ error: "x" }, status)) as unknown as typeof fetch,
    });

  /** The status a result carries, whether it succeeded or failed. */
  const statusOf = (result: BackendResult<unknown>): number => (result.ok ? 200 : result.status);

  check(
    "a rejected service credential is passed through for the service to classify",
    statusOf(await withStatus(401).listAccounts({ creatorId: null })) === 401,
  );
  check(
    "403 is passed through as a refusal",
    statusOf(await withStatus(403).listAccounts({ creatorId: null })) === 403,
  );
  check(
    "404 is passed through as a refusal",
    statusOf(await withStatus(404).listAccounts({ creatorId: null })) === 404,
  );
  check(
    "500 is an error, not an absence",
    statusOf(await withStatus(500).listAccounts({ creatorId: null })) === 500,
  );
  check(
    "503 is unavailable",
    statusOf(await withStatus(503).listAccounts({ creatorId: null })) === 503,
  );

  const html = createHttpOnlyFansBackend({
    baseUrl: "https://onlyfans.internal",
    token: "t",
    fetchImpl: (async () => respond("<html>login</html>", 200, "text/html")) as unknown as typeof fetch,
  });
  const htmlResult = await html.listAccounts({ creatorId: null });
  check("an HTML answer is never parsed as data", !htmlResult.ok && htmlResult.status === 502);

  const broken = createHttpOnlyFansBackend({
    baseUrl: "https://onlyfans.internal",
    token: "t",
    fetchImpl: (async () =>
      respond({
        schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION,
        notAccounts: true,
      })) as unknown as typeof fetch,
  });
  check(
    "a correctly versioned but malformed envelope is reported as malformed",
    statusOf(await broken.listAccounts({ creatorId: null })) === 502,
  );
  // Order matters and is asserted rather than assumed: the version is checked
  // BEFORE the shape, so a wrong-version envelope is never reported as a
  // malformed one — the caller is told the contract disagreed, not that the
  // backend cannot speak.
  const versionFirst = createHttpOnlyFansBackend({
    baseUrl: "https://onlyfans.internal",
    token: "t",
    fetchImpl: (async () => respond({ notAccounts: true })) as unknown as typeof fetch,
  });
  check(
    "an unversioned malformed envelope is reported as a version mismatch",
    statusOf(await versionFirst.listAccounts({ creatorId: null })) === 500,
  );

  // ── The schema version, in both directions ────────────────────────────────
  //
  // These four are the end-to-end half of requirement 4 in the OF-B1 package.
  // A parser that shape-checked an answer and ignored its version would accept a
  // backend that kept the field names and changed their meaning, which is the
  // one failure the version exists to prevent.
  const unversioned = createHttpOnlyFansBackend({
    baseUrl: "https://onlyfans.internal",
    token: "t",
    fetchImpl: (async () => respond({ accounts: [account(AVA)] })) as unknown as typeof fetch,
  });
  const unversionedResult = await unversioned.listAccounts({ creatorId: null });
  check(
    "an answer with no schema version is refused, not shape-checked",
    statusOf(unversionedResult) === 500,
    JSON.stringify(unversionedResult),
  );
  check(
    "and the refusal names it as a version problem",
    !unversionedResult.ok && unversionedResult.code === "backend_schema_mismatch",
  );

  const futureVersion = createHttpOnlyFansBackend({
    baseUrl: "https://onlyfans.internal",
    token: "t",
    fetchImpl: (async () =>
      respond({ schemaVersion: "of-preview.v99", accounts: [account(AVA)] })) as unknown as typeof fetch,
  });
  const futureResult = await futureVersion.listAccounts({ creatorId: null });
  check(
    "an answer from an unimplemented version is refused",
    statusOf(futureResult) === 500 && !futureResult.ok && futureResult.code === "backend_schema_mismatch",
  );
  check(
    "and the operator is told which two versions disagreed",
    !futureResult.ok &&
      futureResult.error.includes("of-preview.v99") &&
      futureResult.error.includes(ONLYFANS_PREVIEW_SCHEMA_VERSION),
    !futureResult.ok ? futureResult.error : "",
  );

  // The consequence that matters for the UI: a version mismatch is an ERROR, not
  // `unavailable`. The backend is present and answering; it simply speaks a
  // contract this dashboard does not, and reporting that as "there is nothing to
  // read from" would hide a needed code change behind the wrong sentence.
  const mismatchedRead = await readAccounts(
    { auth: OPERATOR, backend: unversioned },
    { creatorId: null, accountId: null },
  );
  check(
    "so the read surfaces an error rather than a missing backend",
    !mismatchedRead.ok && mismatchedRead.state === "error",
    JSON.stringify(mismatchedRead),
  );
  check(
    "and never as an empty list of accounts",
    !mismatchedRead.ok && !("body" in mismatchedRead),
  );

  const exploding = createHttpOnlyFansBackend({
    baseUrl: "https://onlyfans.internal",
    token: "t",
    fetchImpl: (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch,
  });
  check(
    "an unreachable host is unavailable",
    statusOf(await exploding.listAccounts({ creatorId: null })) === 503,
  );

  const traversal = await backend.getConversation("../../etc", "x");
  check(
    "an id that is not an id is refused before it reaches the wire",
    !traversal.ok && traversal.status === 400,
  );

  // Configuration is all-or-nothing, and a malformed base URL disables the path
  // rather than being sent somewhere unintended.
  const env = process.env as unknown as Record<string, string | undefined>;
  const previousBase = env[ONLYFANS_API_BASE_ENV];
  const previousToken = env[ONLYFANS_API_TOKEN_ENV];
  try {
    delete env[ONLYFANS_API_BASE_ENV];
    delete env[ONLYFANS_API_TOKEN_ENV];
    check("no configuration means no backend", configuredOnlyFansBackend() === null);
    env[ONLYFANS_API_BASE_ENV] = "https://onlyfans.internal";
    check("a base URL without a credential is not configured", configuredOnlyFansBackend() === null);
    env[ONLYFANS_API_TOKEN_ENV] = "token";
    check("both together configure it", configuredOnlyFansBackend() !== null);
    env[ONLYFANS_API_BASE_ENV] = "not a url";
    check("a malformed base URL disables the live path", configuredOnlyFansBackend() === null);
  } finally {
    if (previousBase === undefined) delete env[ONLYFANS_API_BASE_ENV];
    else env[ONLYFANS_API_BASE_ENV] = previousBase;
    if (previousToken === undefined) delete env[ONLYFANS_API_TOKEN_ENV];
    else env[ONLYFANS_API_TOKEN_ENV] = previousToken;
  }
}

// ── 8. The dashboard transport over a fake HTTP boundary ──────────────────

group("8. The dashboard transport reads the handlers' answers, and only those");
{
  const reply = (body: unknown, status = 200, contentType = "application/json") =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": contentType },
    });

  const transport = createFetchOnlyFansTransport(
    (async (input: RequestInfo | URL) => {
      const url = String(input);
      const path = url.replace(/^.*\/api\/onlyfans/, "").replace(/\?.*$/, "");
      if (/^\/accounts$/.test(path)) return reply({ accounts: [account(AVA)] });
      if (/\/conversations$/.test(path)) return reply({ page: { items: [], nextCursor: null } });
      if (/\/conversations\/[^/]+$/.test(path)) {
        return reply({ conversation: conversationDetails["of-conv-ava-1001"] });
      }
      return reply({ error: "unexpected " + path }, 400);
    }) as unknown as typeof fetch,
    "/api/onlyfans",
  );

  const accounts = await transport.readAccounts({ creatorId: CREATOR_AVA, accountId: AVA });
  check("the transport reads the accounts envelope", accounts.outcome === "ok" && accounts.data[0].accountId === AVA);
  check(
    "the transport reads an empty page as ok rather than as a failure",
    (await transport.readConversations(AVA, null)).outcome === "ok",
  );
  check(
    "the transport reads the conversation envelope",
    (await transport.readConversation(AVA, "of-conv-ava-1001")).outcome === "ok",
  );

  const signIn = createFetchOnlyFansTransport(
    (async () =>
      reply({ ok: false, error: "Sign in to the dashboard to read OnlyFans data." }, 401)) as unknown as typeof fetch,
    "/api/onlyfans",
  );
  const denied = await signIn.readAccounts({});
  check(
    "a 401 is reported as denied with the server's message",
    denied.outcome === "denied" && /Sign in/.test(denied.message),
  );

  const offline = createFetchOnlyFansTransport(
    (async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch,
    "/api/onlyfans",
  );
  check(
    "a network failure is unavailable rather than a crash",
    (await offline.readAccounts({})).outcome === "unavailable",
  );

  const redirect = createFetchOnlyFansTransport(
    (async () => reply("<html>login</html>", 200, "text/html")) as unknown as typeof fetch,
    "/api/onlyfans",
  );
  check("a login redirect is never parsed as data", (await redirect.readAccounts({})).outcome === "unavailable");

  const wrongShape = createFetchOnlyFansTransport(
    (async () => reply({ accounts: "not an array" })) as unknown as typeof fetch,
    "/api/onlyfans",
  );
  check(
    "an envelope of the wrong shape is unavailable",
    (await wrongShape.readAccounts({})).outcome === "unavailable",
  );
}

console.log("\n" + checks + " checks, " + failures + " failed.");
if (failures > 0) {
  console.log(failures + " read-boundary check(s) failed.");
  process.exitCode = 1;
} else {
  console.log("OnlyFans read-boundary checks passed.");
}

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
