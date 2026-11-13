import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { bGate, bAnswer, bRefuse } from "./b-route";
import {
  configuredNativeReadBackend,
  configuredNativeControlBackend,
} from "./native-backend";
import { hash, object, parseNativeReadiness, readinessFingerprint, text } from "./native";
import { readCommandJson } from "../command-json";
import { canonicalConfiguration } from "../configuration";
const ACTIONS: readonly unknown[] = ["pause", "emergency_stop", "resume"];
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
  if (!object(b) || !ACTIONS.includes(b.action))
    return bRefuse(400, "Invalid account control request.");
  // A STOP is a brake. A fingerprint the client holds may be stale, and the backend refuses a stale one exactly when STOP is needed,
  // so any client fingerprint on a STOP is discarded and the route pins the one it reads now (below). One exact key set per action.
  const stop = b.action === "emergency_stop";
  if (stop) delete b.expectedFingerprint;
  if (
    Object.keys(b).sort().join(",") !==
      (stop ? "action,reason" : "action,expectedFingerprint,reason") ||
    (!stop && !hash(b.expectedFingerprint)) ||
    !text(b.reason, 512) ||
    !b.reason.trim()
  )
    return bRefuse(400, "Invalid account control request.");
  const call = configuredNativeControlBackend(g.ctx.fetch);
  if (!call)
    return bRefuse(503, "The account control authority is unavailable.");
  if (stop) {
    const read = configuredNativeReadBackend(g.ctx.fetch),
      now = read ? await read(g.accountId, "readiness") : null,
      fingerprint = now?.ok ? readinessFingerprint(now.data.readiness) : null;
    if (!fingerprint)
      return bRefuse(
        503,
        "Current account state could not be read, so the stop was not sent. Try again.",
      );
    b.expectedFingerprint = fingerprint;
  }
  // The key covers the pinned fingerprint. Every recorded control bumps the backend's control revision, which is part of that
  // fingerprint, so a STOP sent again after a recorded one is a new command (stops again), and one sent again after an unrecorded
  // one replays the same key.
  const actor = g.ctx.actor!,
    commandKey = createHash("sha256")
      .update(canonicalConfiguration([actor, g.accountId, "control", b]))
      .digest("hex");
  const r = await call(g.accountId, "control", { ...b, actor, commandKey });
  return r.ok
    ? bAnswer({ ok: true, accountId: g.accountId, command: r.data.command })
    : bAnswer({ ok: false, outcome: r.outcome, error: r.error }, r.status);
}
