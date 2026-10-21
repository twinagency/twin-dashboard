import { cache } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./session";

export const isAuthed = cache(async (): Promise<boolean> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
});
