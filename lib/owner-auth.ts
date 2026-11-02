// Edge-safe, server-only credential verification. Never import into a client component.
const OWNER_TOKEN = /^owner_[a-f0-9]{64}$/;

async function ownerRpc(name: string, body: Record<string, string>): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return false;
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    return response.ok && (await response.json()) === true;
  } catch {
    // Database outages must fail closed; never log submitted credentials or tokens.
    return false;
  }
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

export async function authenticateOwner(username: string, password: string): Promise<string | null> {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(normalized) || !password || new TextEncoder().encode(password).length > 72) return null;
  const random = crypto.getRandomValues(new Uint8Array(32));
  const token = `owner_${Array.from(random, b => b.toString(16).padStart(2, "0")).join("")}`;
  const valid = await ownerRpc("dashboard_owner_login", {
    p_username: normalized, p_password: password, p_session_hash: await hashToken(token),
  });
  return valid ? token : null;
}

export async function verifyOwnerSession(token: string): Promise<boolean> {
  if (!OWNER_TOKEN.test(token)) return false;
  return ownerRpc("dashboard_owner_session_verify", { p_session_hash: await hashToken(token) });
}

// Password-admin sessions reuse the existing owner token store and verifier.
export async function issueAdminSession(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = `owner_${Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")}`;
  if (!await ownerRpc("dashboard_admin_session_create", { p_session_hash: await hashToken(token) })) {
    throw new Error("The session service is unavailable. Please try signing in again.");
  }
  return token;
}

export async function revokeOwnerSession(token: string | undefined | null): Promise<boolean> {
  if (!token) return true;
  if (!OWNER_TOKEN.test(token)) return false;
  return ownerRpc("dashboard_owner_session_revoke", { p_session_hash: await hashToken(token) });
}
