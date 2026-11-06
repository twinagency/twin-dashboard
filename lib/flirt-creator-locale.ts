export type FlirtCreatorLocale = "en" | "pt-BR";

export const FLIRT_CREATOR_LOCALE_COOKIE = "flirt_creator_locale";

export function parseFlirtCreatorLocale(value: string | null | undefined): FlirtCreatorLocale | null {
  return value === "pt-BR" || value === "en" ? value : null;
}

export function flirtCreatorLocaleCookie(locale: FlirtCreatorLocale, secure: boolean) {
  return {
    name: FLIRT_CREATOR_LOCALE_COOKIE,
    value: locale,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
  };
}

export function flirtCreatorCopy(locale: FlirtCreatorLocale) {
  return (english: string, portuguese: string) => locale === "pt-BR" ? portuguese : english;
}
