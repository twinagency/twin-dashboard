"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, signSession, constantTimeEqual } from "@/lib/session";

export async function login(_prevState: { error?: string } | undefined, fd: FormData) {
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
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
