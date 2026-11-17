// Opt-in Flirt-style creator layout (Twin blue). Decided on the server from the
// VERIFIED creator account id, never from a cookie, header or query param.
// Unset or empty env = nobody gets it, so shipping this code changes nothing.
export function flirtLayoutEnabled(accountId: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (!accountId) return false;
  const ids = (env.CREATOR_FLIRT_LAYOUT_ACCOUNT_IDS ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return ids.includes(accountId.toLowerCase());
}
