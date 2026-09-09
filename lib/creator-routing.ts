export function isCreatorPublicPath(pathname: string | null | undefined): boolean {
  return pathname === "/creator/login" || pathname === "/creator/signup";
}

export function isCreatorAuthPath(pathname: string | null | undefined): boolean {
  return !!pathname && pathname.startsWith("/creator-auth/");
}

export function isCreatorPath(pathname: string | null | undefined): boolean {
  return !!pathname && pathname.startsWith("/creator");
}

export function safeCreatorNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/creator") || value.startsWith("/creator-auth") || value.startsWith("//")) return "/creator";
  return value;
}
