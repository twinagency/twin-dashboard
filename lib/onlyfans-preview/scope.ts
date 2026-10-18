// The OnlyFans workspace scope, as it travels in the URL.
//
// The selected creator and the selected account live in the query string rather
// than only in component state, for one reason: a link from Accounts to the
// inbox has to open *that* account, and reloading or pressing Back has to land
// on the same place. Component state survives neither.
//
// These ids are a request, never a permission. `?account=` naming an account
// this session may not read selects nothing: the server's authorized account
// list is the only thing that decides, and the workspace reconciles the URL
// against the answer it actually received. That is why nothing here throws and
// nothing here authorizes — it parses, bounds and rebuilds.
//
// Pure functions only: no React, no router, no fetch. The workspace and the
// checks read the same code, so navigation cannot behave differently in a test
// than it does on screen.

export type WorkspaceScope = {
  /** Requested creator. Null means "every creator this session may read". */
  creatorId: string | null;
  /** Requested account. Null means no account has been chosen yet. */
  accountId: string | null;
};

export const EMPTY_WORKSPACE_SCOPE: WorkspaceScope = { creatorId: null, accountId: null };

export const SCOPE_CREATOR_PARAM = "creator";
export const SCOPE_ACCOUNT_PARAM = "account";

/**
 * Identifier shape, bounded.
 *
 * Backend ids are opaque strings, so this does not try to guess their format. It
 * rejects what cannot be an id: empty, over-long, or carrying anything that
 * would have to be escaped or interpreted. A rejected value becomes null — the
 * same as "not requested" — so a malformed URL selects nothing rather than
 * being forwarded to a backend.
 */
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

export function scopeId(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return ID_PATTERN.test(trimmed) ? trimmed : null;
}

export function parseWorkspaceScope(params: { get(name: string): string | null }): WorkspaceScope {
  return {
    creatorId: scopeId(params.get(SCOPE_CREATOR_PARAM)),
    accountId: scopeId(params.get(SCOPE_ACCOUNT_PARAM)),
  };
}

/** Only the parameters this module owns, and only when they are set. */
export function scopeQueryString(scope: WorkspaceScope): string {
  const params = new URLSearchParams();
  if (scope.creatorId) params.set(SCOPE_CREATOR_PARAM, scope.creatorId);
  if (scope.accountId) params.set(SCOPE_ACCOUNT_PARAM, scope.accountId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** The link Accounts -> inbox uses, so the inbox opens on the chosen account. */
export function workspaceHref(pathname: string, scope: WorkspaceScope): string {
  return pathname + scopeQueryString(scope);
}

export function sameScope(a: WorkspaceScope, b: WorkspaceScope): boolean {
  return a.creatorId === b.creatorId && a.accountId === b.accountId;
}

export function scopeWithAccount(scope: WorkspaceScope, accountId: string | null): WorkspaceScope {
  return { creatorId: scope.creatorId, accountId: scopeId(accountId) };
}

export function scopeWithCreator(scope: WorkspaceScope, creatorId: string | null): WorkspaceScope {
  const next = scopeId(creatorId);
  // A different creator invalidates the account that was selected under the
  // previous one. Carrying it across would ask the server for an account in the
  // wrong scope and rely on the refusal to clean up after us.
  return { creatorId: next, accountId: next === scope.creatorId ? scope.accountId : null };
}
