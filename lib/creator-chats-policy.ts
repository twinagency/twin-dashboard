// Creator accounts that may read their own fan chats at /creator/chats.
// Exact FLIRT creator_accounts ids only, never names or emails. Each entry
// must match the account's scoped clone in deployment/flirt-live-twin.cjs.
export const CREATOR_CHATS_ACCOUNTS: Readonly<Record<string, { cloneId: string; slug: string }>> = Object.freeze({
  "c9c6d09d-71e4-424d-9150-07147c9bd5d2": Object.freeze({ cloneId: "2e5eb05f-cc88-4ba6-870a-924948d4b09a", slug: "mrs-callace" }), // Mrs Callace
});
export const CREATOR_CHATS_CLONE_IDS: readonly string[] = Object.freeze(Object.values(CREATOR_CHATS_ACCOUNTS).map(a => a.cloneId));
export function creatorChatsClone(accountId: string | null | undefined) {
  return accountId && Object.prototype.hasOwnProperty.call(CREATOR_CHATS_ACCOUNTS, accountId) ? CREATOR_CHATS_ACCOUNTS[accountId] : null;
}
