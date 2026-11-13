import { createHash, randomBytes } from "node:crypto";

// Creator invite codes for agency signup links.
//
// Only the sha256 hash is ever stored (`creator_agency_codes.code_hash`), so the
// plaintext exists exactly once, in the response to the admin who generated it.
// Do not add a plaintext column: the code is revocable, agency scoped and only
// mintable from an admin page, which is what makes showing it once acceptable.

// Unambiguous uppercase alphabet: 0/O/1/I/L are all excluded so a code read
// aloud, screenshotted or retyped cannot land on a different character.
// 31 symbols does not divide 256, so bytes at or above REJECT_AT are discarded
// rather than folded in with a biased modulo.
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 10;
const REJECT_AT = 256 - (256 % CODE_ALPHABET.length);

export const INVITE_CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function randomInviteCode(): string {
  let out = "";
  while (out.length < CODE_LENGTH) {
    for (const byte of randomBytes(CODE_LENGTH * 2)) {
      if (byte >= REJECT_AT) continue;
      out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (out.length === CODE_LENGTH) break;
    }
  }
  return out;
}

// Must stay byte for byte identical to the hashing in
// app/creator-auth/signup/route.ts: sha256 over the trimmed, uppercased code,
// lowercase hex. A mismatch here silently mints codes that can never redeem.
export function hashInviteCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase(), "utf8").digest("hex");
}

// A just-minted code reaches its page in this cookie, never in the redirect URL:
// a query string lands in browser history and access logs, and a hand-crafted
// ?created= would render as a freshly minted code. httpOnly, scoped to the one
// page that shows it, and gone after a minute.
export const INVITE_FLASH_COOKIE = "twin_invite_created";
export const inviteFlashCookie = (path: string) =>
  ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path, maxAge: 60 });

/** The invite URL an agency sends its creators. */
export function inviteUrl(origin: string, code: string): string {
  return `${origin}/creator/signup?code=${encodeURIComponent(code)}`;
}
