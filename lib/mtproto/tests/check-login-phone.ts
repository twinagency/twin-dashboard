// lib/mtproto/tests/check-login-phone.ts
//
// Run: npm run test:login-phone
//
// Phone number + code login (alongside the existing QR flow, migration
// 166/172): requestTelegramConnection's connect_phone/reconnect_phone
// branch and submitTelegramCode, against the same in-memory FakeDb the rest
// of lib/mtproto/ uses. No network, no real Supabase project.
//
// Why this exists: QR-created sessions have been dying when the phone that
// scanned the QR logs out. A phone + code login is not approved by another
// device. The code travels the exact same RSA-OAEP path the 2-step
// verification password already used (see login-control.ts encryptForWorker)
// so these checks lean hard on "the code is never the plaintext anywhere
// outside the ciphertext round trip."

import { generateKeyPairSync, privateDecrypt, constants } from "node:crypto";
import {
  cancelTelegramConnectionRequest,
  requestTelegramConnection,
  submitTelegramCode,
  submitTelegramTwoFactorPassword,
  type LoginRequestView,
} from "../login-control";
import { __setMtDbForTest } from "../db";
import { FakeDb } from "./fake-db";

let passed = 0;
const failures: string[] = [];
const asyncChecks: { name: string; fn: () => Promise<void> }[] = [];
function acheck(name: string, fn: () => Promise<void>): void {
  asyncChecks.push({ name, fn });
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function eq(actual: unknown, expected: unknown, what: string): void {
  if (actual !== expected) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
async function rejects(p: Promise<unknown>, pattern?: RegExp): Promise<Error> {
  try {
    await p;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    if (pattern && !pattern.test(err.message)) throw new Error(`rejected with the wrong message: ${err.message}`);
    return err;
  }
  throw new Error("expected a rejection, but it resolved");
}

const CLONE_A = "11111111-1111-1111-1111-111111111111";
const PHONE = "+15551234567";
const CODE = "739284";
const PASSWORD = "hunter2-2fa";

/** A real RSA keypair, same shape as the one twin-userbot's
 *  generateLoginKeyPair() publishes, so encryptForWorker's real RSA-OAEP
 *  round trips against it. */
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const KEY_ID = "worker-key-1";

function decrypt(ciphertextBase64: string): string {
  return privateDecrypt(
    { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(ciphertextBase64, "base64"),
  ).toString("utf8");
}

function freshDb(): FakeDb {
  const db = new FakeDb();
  db.seed("clones", [{ id: CLONE_A, name: "Alpha", slug: "alpha", status: "active" }]);
  db.seed("app_settings", [
    { key: "mtproto_login_public_key", value: JSON.stringify({ keyId: KEY_ID, publicKey, updatedAt: new Date().toISOString() }) },
  ]);
  __setMtDbForTest(db);
  return db;
}
const eventsOf = (db: FakeDb, type: string) => db.rows("reengage_events").filter((e) => e.event_type === type);
const requestRow = (db: FakeDb, id: string) => db.rows("userbot_login_requests").find((r) => r.id === id);

// ── request creation ─────────────────────────────────────────────────────

acheck("rejects an unknown action", async () => {
  const db = freshDb();
  await rejects(requestTelegramConnection(CLONE_A, "hack" as never, "operator"), /invalid connection action/);
  assert(db.rows("userbot_login_requests").length === 0, "no row written");
});

acheck("connect_phone with no phone number is refused", async () => {
  freshDb();
  await rejects(requestTelegramConnection(CLONE_A, "connect_phone", "operator"), /phone number/i);
});

acheck("connect_phone with a garbage phone number is refused", async () => {
  freshDb();
  await rejects(requestTelegramConnection(CLONE_A, "connect_phone", "operator", "not a phone"), /phone number/i);
});

acheck("connect_phone with a valid phone number creates a pending request carrying it", async () => {
  const db = freshDb();
  const req = await requestTelegramConnection(CLONE_A, "connect_phone", "operator", PHONE);
  eq(req.action, "connect_phone", "action");
  eq(req.status, "pending", "status");
  eq(req.phone, PHONE, "phone echoed back on the view");
  const row = requestRow(db, req.id);
  eq(row?.phone, PHONE, "phone column on the row");
});

acheck("phone number formatting (spaces/dashes) is normalized before storage", async () => {
  const db = freshDb();
  const req = await requestTelegramConnection(CLONE_A, "connect_phone", "operator", "+1 (555) 123-4567");
  eq(req.phone, "+15551234567", "normalized phone");
  eq(requestRow(db, req.id)?.phone, "+15551234567", "normalized phone on the row");
});

acheck("a QR connect request never gets a phone column value", async () => {
  const db = freshDb();
  const req = await requestTelegramConnection(CLONE_A, "connect", "operator");
  eq(req.phone, null, "phone stays null for a QR request");
  eq(requestRow(db, req.id)?.phone ?? null, null, "row phone stays null");
});

acheck("a second connect_phone request while one is active reuses it (one active per clone)", async () => {
  const db = freshDb();
  const first = await requestTelegramConnection(CLONE_A, "connect_phone", "operator", PHONE);
  const second = await requestTelegramConnection(CLONE_A, "connect_phone", "operator", "+15559999999");
  eq(second.id, first.id, "same request id returned, not a duplicate");
  eq(db.rows("userbot_login_requests").length, 1, "only one row exists");
});

// ── submitting the code ──────────────────────────────────────────────────

function markCodeRequired(db: FakeDb, req: LoginRequestView): void {
  const row = requestRow(db, req.id);
  assert(row, "request row exists");
  row!.status = "code_required";
}

acheck("submitting a code when the request is not asking for one is refused", async () => {
  const db = freshDb();
  const req = await requestTelegramConnection(CLONE_A, "connect_phone", "operator", PHONE);
  // Still "pending" — worker has not claimed it yet.
  await rejects(submitTelegramCode(req.id, CODE, "operator"), /not asking for a code/);
  eq(requestRow(db, req.id)?.password_ciphertext ?? null, null, "nothing was written");
});

acheck("a non-numeric or badly-shaped code is refused before any encryption happens", async () => {
  const db = freshDb();
  const req = await requestTelegramConnection(CLONE_A, "connect_phone", "operator", PHONE);
  markCodeRequired(db, req);
  for (const bad of ["", "abcde", "12", "1234567890123", "12x34"]) {
    await rejects(submitTelegramCode(req.id, bad, "operator"), /numeric code/);
  }
  eq(requestRow(db, req.id)?.password_ciphertext ?? null, null, "still nothing written after all the bad attempts");
});

acheck("phone login happy path: code is RSA-encrypted under the worker key, never stored plaintext", async () => {
  const db = freshDb();
  const req = await requestTelegramConnection(CLONE_A, "connect_phone", "operator", PHONE);
  markCodeRequired(db, req);

  const updated = await submitTelegramCode(req.id, CODE, "operator");
  const row = requestRow(db, req.id);
  assert(row, "row still exists");

  assert(typeof row!.password_ciphertext === "string" && row!.password_ciphertext.length > 0, "ciphertext was written");
  eq(row!.password_key_id, KEY_ID, "key id recorded so the worker knows which private key to use");
  assert(!String(row!.password_ciphertext).includes(CODE), "ciphertext does not contain the raw code as a substring");
  eq(decrypt(row!.password_ciphertext), CODE, "the worker's private key decrypts back to exactly the submitted code");
  assert(typeof updated.message === "string" && !updated.message.includes(CODE), "status message never echoes the code");

  const submitted = eventsOf(db, "session_event").filter((e) => e.detail?.action === "dashboard_code_submitted");
  eq(submitted.length, 1, "one event logged");
  eq(JSON.stringify(submitted[0].detail).includes(CODE), false, "the logged event detail never contains the plaintext code");
});

acheck("submitting a code twice: the second call finds it already consumed and is refused", async () => {
  const db = freshDb();
  const req = await requestTelegramConnection(CLONE_A, "connect_phone", "operator", PHONE);
  markCodeRequired(db, req);
  await submitTelegramCode(req.id, CODE, "operator");
  // The worker consumes password_ciphertext and moves status to "processing"
  // once it picks the code up; simulate that here rather than re-asserting
  // status_required forever.
  const row = requestRow(db, req.id);
  row!.status = "processing";
  await rejects(submitTelegramCode(req.id, "999999", "operator"), /not asking for a code/);
});

acheck("cancelling a code_required request clears the ciphertext, same as password_required", async () => {
  const db = freshDb();
  const req = await requestTelegramConnection(CLONE_A, "connect_phone", "operator", PHONE);
  markCodeRequired(db, req);
  await submitTelegramCode(req.id, CODE, "operator");
  // The worker would move to "processing"; force back to an active status to
  // exercise cancel's own status gate the way the dashboard would see it
  // mid-flight.
  const row = requestRow(db, req.id);
  row!.status = "code_required";
  row!.password_ciphertext = "still-here";
  row!.password_key_id = KEY_ID;
  await cancelTelegramConnectionRequest(req.id, "operator");
  const after = requestRow(db, req.id);
  eq(after?.status, "cancelled", "cancelled");
  eq(after?.password_ciphertext ?? null, null, "ciphertext cleared on cancel");
  eq(after?.password_key_id ?? null, null, "key id cleared on cancel");
});

// ── shared crypto path also still serves the 2FA password unmodified ────

acheck("the 2-step verification password still uses the same encrypted path (regression)", async () => {
  const db = freshDb();
  const req = await requestTelegramConnection(CLONE_A, "connect", "operator");
  const row = requestRow(db, req.id);
  row!.status = "password_required";
  await submitTelegramTwoFactorPassword(req.id, PASSWORD, "operator");
  const after = requestRow(db, req.id);
  assert(typeof after!.password_ciphertext === "string" && after!.password_ciphertext.length > 0, "password ciphertext written");
  eq(decrypt(after!.password_ciphertext), PASSWORD, "decrypts back to the password");
  assert(!String(after!.password_ciphertext).includes(PASSWORD), "ciphertext does not contain the raw password");
});

// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  for (const c of asyncChecks) {
    try {
      await c.fn();
      passed++;
    } catch (e) {
      failures.push(`${c.name}\n      ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      __setMtDbForTest(null);
    }
  }

  const total = passed + failures.length;
  if (failures.length) {
    console.error(`\n  ${failures.length} of ${total} CHECKS FAILED\n`);
    for (const f of failures) console.error(`  ✗ ${f}\n`);
    process.exit(1);
  }
  console.log(`\n  ALL ${total} CHECKS PASSED (lib/mtproto phone login)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
