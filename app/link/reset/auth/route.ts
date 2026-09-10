import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase-service";
import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";

const LYNQ_LOGIN_USER_ID = "6e6491b9-8db0-43f5-b04a-d4509318dac9";
const RESET_TOKEN_SHA256 = "0b9dbf2c257ed7d043d997503161f747f9afa649e075a353791ae50d0064f848";
const RESET_EXPIRES_AT = Date.parse("2026-09-10T04:30:00Z");

function validToken(token: string) {
  const supplied = createHash("sha256").update(token).digest();
  const expected = Buffer.from(RESET_TOKEN_SHA256, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req) || req.headers.has("next-action")) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const form = await req.formData();
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const fail = () => NextResponse.redirect(new URL(`/link/reset?token=${encodeURIComponent(token)}&error=1`, dashboardOrigin(req)), 303);
  if (Date.now() > RESET_EXPIRES_AT || !validToken(token) || password.length < 12 || password.length > 256) return fail();
  const { error } = await serviceClient().auth.admin.updateUserById(LYNQ_LOGIN_USER_ID, { password });
  if (error) return fail();
  return NextResponse.redirect(new URL("/link/reset?done=1", dashboardOrigin(req)), 303);
}
