"use strict";
const { publicAuthConfig } = require("./flirt-public-auth.cjs");

// This branch is a separate FLIRT installation. Never fall back to Twin.
const FORBIDDEN_PROJECTS = new Set([
  "aouaenqayfltoqrmpitg",
  "cnnsllgzskqkvdovyiiv",
]);
const TWIN_PUBLISHABLE_KEY = "sb_publishable_GaunWyo_PKF82PDziCc9mQ_B9_3O16a";

function fail(message) {
  // Configuration values and credentials must never appear in errors.
  throw new Error(`FLIRT configuration: ${message}`);
}

function parseUrl(value, field) {
  try { return new URL(value); } catch { fail(`${field} is invalid`); }
}

function assertDatabase(env = process.env) {
  const ref = env.FLIRT_SUPABASE_PROJECT_REF;
  if (!ref || !/^[a-z]{20}$/.test(ref) || FORBIDDEN_PROJECTS.has(ref)) {
    fail("set FLIRT_SUPABASE_PROJECT_REF to the new, separate FLIRT project");
  }
  const url = parseUrl(env.SUPABASE_URL, "SUPABASE_URL");
  if (url.protocol !== "https:" || url.hostname !== `${ref}.supabase.co`
    || url.port || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    fail("SUPABASE_URL must match the separate FLIRT project exactly");
  }
  const key = env.SUPABASE_SERVICE_KEY;
  if (!key) fail("SUPABASE_SERVICE_KEY is required");
  if (!key.startsWith("sb_secret_")) {
    // Legacy service-role JWTs embed their project ref. Validate it as well.
    let payload;
    try { payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8")); }
    catch { fail("SUPABASE_SERVICE_KEY must be a server secret or service-role JWT"); }
    if (payload?.ref !== ref || payload?.role !== "service_role") {
      fail("service-role key belongs to a different project or role");
    }
  }
  for (const field of ["SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]) {
    if (env[field] === TWIN_PUBLISHABLE_KEY) fail("replace the inherited Twin publishable key");
    if (env[field]?.startsWith("sb_secret_")) fail("publishable key fields cannot contain server secrets");
  }
  for (const field of ["NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL"]) {
    if (env[field] && env[field] !== url.origin && env[field] !== `${url.origin}/`) {
      fail("public Supabase URL differs from the FLIRT server project");
    }
  }
  if (env.SUPABASE_PUBLISHABLE_KEY) {
    publicAuthConfig({ ref, url: env.SUPABASE_URL, key: env.SUPABASE_PUBLISHABLE_KEY });
  }
  if (env.DATABASE_URL) {
    const db = parseUrl(env.DATABASE_URL, "DATABASE_URL");
    const user = decodeURIComponent(db.username);
    const direct = db.hostname === `db.${ref}.supabase.co` && user === "postgres";
    const pooler = /^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(db.hostname)
      && user === `postgres.${ref}`;
    if (!["postgres:", "postgresql:"].includes(db.protocol) || !(direct || pooler)
      || !db.password || db.pathname !== "/postgres" || db.hash) {
      fail("DATABASE_URL must target the separate FLIRT project");
    }
    const allowedParams = new Set(["sslmode", "uselibpqcompat", "pgbouncer", "connection_limit"]);
    for (const name of db.searchParams.keys()) {
      if (!allowedParams.has(name)) fail("DATABASE_URL contains an unsupported connection override");
    }
  }
  return ref;
}

function assertStartup(kind, env = process.env) {
  if (!["dashboard", "bot"].includes(kind)) fail("unknown runtime");
  if (env.FLIRT_BACKEND_ENABLED !== "true") fail("backend is disabled until FLIRT provisioning is complete");
  const ref = assertDatabase(env);
  if (kind === "dashboard") {
    const origin = parseUrl(env.DASHBOARD_PUBLIC_ORIGIN, "DASHBOARD_PUBLIC_ORIGIN");
    const local = env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(origin.hostname);
    if ((!local && origin.protocol !== "https:") || (local && !["http:", "https:"].includes(origin.protocol))
      || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/"
      || /(^|\.)(tgaiclone\.xyz|twinagency\.co)$/.test(origin.hostname)) {
      fail("DASHBOARD_PUBLIC_ORIGIN must be FLIRT's own origin");
    }
    for (const field of ["DASHBOARD_SESSION_SECRET", "CREATOR_SESSION_SECRET"]) {
      if (!env[field] || env[field].length < 32) fail(`${field} must contain at least 32 characters`);
    }
    if (env.DASHBOARD_SESSION_SECRET === env.CREATOR_SESSION_SECRET) {
      fail("creator and operator signing secrets must be different");
    }
    if (!env.DASHBOARD_PASSWORD || env.DASHBOARD_PASSWORD.length < 16) {
      fail("set a new DASHBOARD_PASSWORD of at least 16 characters");
    }
  }
  return ref;
}

function assertBotConfig(env = process.env) {
  // Importing pure offline tests is permitted. Any configured external service
  // requires the full independent backend, even when MOCK was left enabled.
  const networkFields = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "DATABASE_URL", "BOT_TOKEN",
    "OPENROUTER_API_KEY", "ELEVENLABS_API_KEY", "DEEPGRAM_API_KEY"];
  if (!["false", "0"].includes(env.MOCK) && !networkFields.some((field) => env[field])) return;
  assertStartup("bot", env);
}

module.exports = { assertDatabase, assertStartup, assertBotConfig };
