import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { bGate, bAnswer, bRefuse } from "./b-route";
import {
  configuredNativeReadBackend,
  configuredNativeControlBackend,
} from "./native-backend";
import { hash, object, parseNativeReadiness, text } from "./native";
import { readCommandJson } from "../command-json";
import { canonicalConfiguration } from "../configuration";
export async function accountControls(
  request: NextRequest,
  accountId: string,
  write = false,
) {
  const g = await bGate(request, accountId, write);
  if (!("ctx" in g)) return g;
  if (request.nextUrl.searchParams.size)
    return bRefuse(
      400,
      "This account control does not accept query parameters.",
    );
  if (!write) {
    const call = configuredNativeReadBackend(g.ctx.fetch);
    if (!call)
      return bRefuse(503, "The account read authority is unavailable.");
    const r = await call(g.accountId, "readiness");
    if (!r.ok)
      return bAnswer(
        { ok: false, outcome: r.outcome, error: r.error },
        r.status,
      );
    const ready = parseNativeReadiness(r.data.readiness);
    return ready
      ? bAnswer({ ok: true, accountId: g.accountId, readiness: ready })
      : bRefuse(503, "Current account controls could not be verified.");
  }
  let b: unknown;
  try {
    b = await readCommandJson(request, 2048);
  } catch {
    return bRefuse(400, "Invalid account control request.");
  }
  // A STOP is a brake: it may come without a fingerprint when the panel could not read state.
  const bare =
    object(b) &&
    b.action === "emergency_stop" &&
    Object.keys(b).sort().join(",") === "action,reason";
  if (
    !object(b) ||
    (!bare &&
      (Object.keys(b).sort().join(",") !==
        "action,expectedFingerprint,reason" ||
        !hash(b.expectedFingerprint))) ||
    !["pause", "emergency_stop", "resume"].includes(String(b.action)) ||
    !text(b.reason, 512) ||
    !b.reason.trim()
  )
    return bRefuse(400, "Invalid account control request.");
  const call = configuredNativeControlBackend(g.ctx.fetch);
  if (!call)
    return bRefuse(503, "The account control authority is unavailable.");
  if (bare) {
    // The backend checks a fingerprint on every control, so pin this STOP to the state as it is now.
    // Only the fingerprint is needed: a readiness body that fails the full parser still yields one.
    const read = configuredNativeReadBackend(g.ctx.fetch),
      now = read ? await read(g.accountId, "readiness") : null,
      r =
        now?.ok && object(now.data.readiness)
          ? now.data.readiness.accountControl
          : null,
      fingerprint = object(r) && hash(r.fingerprint) ? r.fingerprint : null;
    if (!fingerprint)
      return bRefuse(
        503,
        "Current account state could not be read, so the stop was not sent. Try again.",
      );
    b.expectedFingerprint = fingerprint;
  }
  const actor = g.ctx.actor!,
    commandKey = createHash("sha256")
      .update(canonicalConfiguration([actor, g.accountId, "control", b]))
      .digest("hex");
  const r = await call(g.accountId, "control", { ...b, actor, commandKey });
  return r.ok
    ? bAnswer({ ok: true, accountId: g.accountId, command: r.data.command })
    : bAnswer({ ok: false, outcome: r.outcome, error: r.error }, r.status);
}
