// Shared fixtures for the W2 team-351 known-red tests (tests/known-red/W2-team-351-curl-capture-*.test.ts[x]).
// Every cookie, x_bc and static_param value is synthetic and generated per run (randomUUID), so nothing session shaped is committed.
import { randomUUID } from "node:crypto";

export const synthetic = () => "synthetic-" + randomUUID();

/** A capture that passes connectionCapture(value, owner) (lib/onlyfans-connections/contract.ts:44-59). */
export const capture = (owner: number) => ({
  headers: { user_id: String(owner), user_agent: "Mozilla/5.0 (synthetic)", x_bc: synthetic(), x_of_rev: "synthetic-rev" },
  signing: { rules: { static_param: synthetic(), start: "1", end: "2", checksum_indexes: Array.from({ length: 32 }, (_, i) => i % 40), checksum_constant: 7 } },
  cookies: [{ name: "sess", value: synthetic() }, { name: "auth_id", value: String(owner) }],
});
