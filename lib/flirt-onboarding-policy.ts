// Exact operator routes only. This never opens the general agency admin area.
export function flirtOperatorAgencyPath(path: string): boolean {
  return ["/agency/clone-scope", "/agency/creator-invites", "/agency/creator-invites/manage", "/agency/creators", "/agency/creators/link", "/agency/creators/manage"].includes(path)
    || /^\/agency\/creators\/[0-9a-f-]{36}$/i.test(path);
}
