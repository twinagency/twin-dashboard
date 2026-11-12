// KNOWN RED (W4 lib-analytics-data-plus4 F1 = lane-3 api-admin-plus1 O5, docs/review/W4/lib-analytics-data-plus4.md):
// the admin API network gate (lib/api-auth.ts checkNetwork/clientIp) is not "rightmost X-Forwarded-For entry".
// clientIp walks left past every private (10/8, 172.16/12, 192.168/16) hop, so a LAN caller's own leftmost entry
// decides ("127.0.0.1, 192.168.1.20" admitted), and when every entry is private the client-controlled Host header
// admits ("192.168.1.20" + Host: localhost). The key gate still applies; this is gate 2 only.
// Team's Claude owns the fix. Pure function, no network.
// Intended runner: init.sh's known-red loop (init.sh:54-56); not wired yet: orchestrator item.
import assert from "node:assert/strict";
import test from "node:test";
import { checkNetwork } from "../../lib/api-auth";

const gate = (xff: string | null, host: string | null) => checkNetwork({ xff, host, allowPublic: false });

test("control: a public rightmost entry is denied; a single loopback or Tailscale entry is admitted", () => {
  assert.equal(gate("203.0.113.9", "twin.example.com").ok, false);
  assert.equal(gate("127.0.0.1, 203.0.113.9", "twin.example.com").ok, false, "the forged leftmost loopback must not win");
  assert.equal(gate("127.0.0.1", "twin.example.com").ok, true);
  assert.equal(gate("100.64.1.2", "twin.example.com").ok, true);
});

test("F1: a LAN peer's forged leftmost loopback entry is not admitted", () => {
  assert.equal(gate("127.0.0.1, 192.168.1.20", "twin.example.com").ok, false,
    "rightmost entry is 192.168.1.20 (a LAN peer), not loopback");
});

test("F1: a private peer cannot get in by saying Host: localhost", () => {
  assert.equal(gate("192.168.1.20", "localhost").ok, false, "Host is client controlled");
});
