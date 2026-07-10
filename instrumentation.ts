// Runs once on server startup. Same IPv6 fix as the bot's src/index.ts:
// this machine has dead IPv6 routing, so Node's fetch (used by supabase-js)
// otherwise hangs with ETIMEDOUT. Force IPv4 for all outbound calls.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const dns = await import("node:dns");
    const net = await import("node:net");
    dns.setDefaultResultOrder("ipv4first");
    net.setDefaultAutoSelectFamily(false);
  }
}
