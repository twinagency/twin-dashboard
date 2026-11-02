"use server";

import { guardDashboardAction } from "@/lib/agency-management";

import { cookies } from "next/headers";
import { revokeOwnerSession } from "@/lib/owner-auth";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, signSession, constantTimeEqual } from "@/lib/session";

export async function login(_prevState: { error?: string } | undefined, fd: FormData) {
  await guardDashboardAction("app/login/actions.ts#login", [_prevState, fd]);
  const password = String(fd.get("password") ?? "");
  const expected = process.env.DASHBOARD_PASSWORD;
  const next = String(fd.get("next") ?? "/");

  if (!expected) {
    return { error: "DASHBOARD_PASSWORD is not configured on the server." };
  }
  if (!password || !constantTimeEqual(password, expected)) {
    return { error: "Wrong password." };
  }

  const token = await signSession();
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect(next.startsWith("/") ? next : "/");
}

export async function logout() {
  await guardDashboardAction("app/login/actions.ts#logout", []);
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!await revokeOwnerSession(token)) {
    // Keep the cookie available for a retry and make failure visible. A legacy
    // stateless token cannot honestly be described as revoked by cookie deletion.
    throw new Error("Sign out could not revoke this session. Please retry; legacy sessions require the server-session cutover.");
  }
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
