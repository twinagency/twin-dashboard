export function isCreatorPublicPath(pathname: string | null | undefined): boolean {
  return pathname === "/creator/login" || pathname === "/creator/signup";
}

export function isCreatorAuthPath(pathname: string | null | undefined): boolean {
  return !!pathname && pathname.startsWith("/creator-auth/");
}

export function isCreatorPath(pathname: string | null | undefined): boolean {
  // A segment boundary matters: /creator-management is an internal operator
  // area, not part of the signed-in creator's six-page workspace.
  return pathname === "/creator" || !!pathname && pathname.startsWith("/creator/");
}

export function safeCreatorNext(value: string | null | undefined): string {
  if (!value || value.startsWith("//")) return "/creator";
  const path = value.split(/[?#]/, 1)[0];
  return isCreatorPath(path) ? value : "/creator";
}
