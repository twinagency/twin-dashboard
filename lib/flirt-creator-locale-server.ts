import "server-only";

import { cookies } from "next/headers";
import { flirtOnboardingOptional } from "./flirt-onboarding";
import { FLIRT_CREATOR_LOCALE_COOKIE, parseFlirtCreatorLocale, type FlirtCreatorLocale } from "./flirt-creator-locale";

export async function getFlirtCreatorLocale(): Promise<FlirtCreatorLocale> {
  if (!flirtOnboardingOptional()) return "en";
  return parseFlirtCreatorLocale((await cookies()).get(FLIRT_CREATOR_LOCALE_COOKIE)?.value) ?? "en";
}
