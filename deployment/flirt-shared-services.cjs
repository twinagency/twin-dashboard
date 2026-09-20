"use strict";

// Optional Node preload for a read-only Docker secret. These are the only
// credentials FLIRT shares with Twin. Database, session and Telegram identity
// settings always come from the FLIRT environment, never this file.
const { readFileSync, statSync } = require("node:fs");
const { isAbsolute } = require("node:path");
const PROVIDER_KEYS = new Set([
  "OPENROUTER_API_KEY", "ELEVENLABS_API_KEY", "DEEPGRAM_API_KEY",
]);
const MAX_BYTES = 16 * 1024;

function loadSharedServices(env = process.env) {
  const path = env.FLIRT_SHARED_SERVICES_FILE;
  if (!path) return;
  const fail = () => { throw new Error("FLIRT shared services: supply a readable JSON object containing only the three supported provider key names with non-empty string values."); };
  let values;
  try {
    if (!isAbsolute(path)) fail();
    const info = statSync(path);
    if (!info.isFile() || info.size > MAX_BYTES) fail();
    values = JSON.parse(readFileSync(path, "utf8"));
  } catch { fail(); }
  if (!values || typeof values !== "object" || Array.isArray(values)) fail();
  const entries = Object.entries(values);
  if (entries.length === 0) fail();
  // Validate the whole file before changing any environment variable.
  for (const [key, value] of entries) {
    if (!PROVIDER_KEYS.has(key) || typeof value !== "string" || !value.trim()
      || /[\r\n\0]/.test(value)) fail();
  }
  // Explicit per-app values take precedence. No accounts or keys are created.
  for (const [key, value] of entries) {
    if (!env[key]?.trim()) env[key] = value.trim();
  }
}

module.exports = { loadSharedServices };
loadSharedServices();
