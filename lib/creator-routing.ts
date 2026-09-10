export function isCreatorPublicPath(pathname: string | null | undefined): boolean {
  return ["/creator/login", "/creator/signup", "/creator/forgot-password", "/creator/reset-password"].includes(pathname || "");
}
export function isCreatorAuthPath(pathname: string | null | undefined): boolean {
  return !!pathname && pathname.startsWith("/creator-auth/");
}
export function isCreatorPath(pathname: string | null | undefined): boolean {
  return pathname === "/creator" || !!pathname?.startsWith("/creator/");
}
export function safeCreatorNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/creator";
  try {
    const url = new URL(value, "https://creator.invalid");
    if (url.origin !== "https://creator.invalid" || !isCreatorPath(url.pathname) || isCreatorPublicPath(url.pathname)) return "/creator";
    return url.pathname + url.search;
  } catch { return "/creator"; }
}
