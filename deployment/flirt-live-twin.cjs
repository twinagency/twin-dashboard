"use strict";
// Jesse's explicitly selected live creators. This grants no creator-login access.
const PROJECT = "aouaenqayfltoqrmpitg";
const ID = "66263f7f-77c6-4d9b-a828-e7c9d1ce3597";
const CLONES = Object.freeze([
  "0328e7b3-a1e5-465a-9a30-c9cf6519cba1", // Briana Redd
  "bfaf6235-6c3b-4369-8d5c-c7068b08bea2", // Toochi
  "2e5eb05f-cc88-4ba6-870a-924948d4b09a", // Mrs Callace
  "dd1869c2-d1e2-490f-9fae-45200232cc30", // Sania Mallory
  "e0464c19-d5b7-4154-ba46-a60a2ed2a8a3", // Allison Parker
  "4fff7866-c7e9-4af2-926a-36e727c0a77f", // Zoey Foxx
]);
function enabled(env = process.env) { return env.FLIRT_LIVE_TWIN_ENABLED === "true"; }
function identity() { return { id: ID, name: "FLIRT", cloneIds: [...CLONES], dataSource: "twin-live" }; }
function isLiveAccess(access) {
  return !!access && access.id === ID && access.dataSource === "twin-live"
    && Array.isArray(access.cloneIds) && access.cloneIds.length === CLONES.length
    && new Set(access.cloneIds).size === CLONES.length
    && access.cloneIds.every(id => CLONES.includes(id));
}
function configuration(env = process.env) {
  if (!enabled(env) || env.FLIRT_SUPABASE_PROJECT_REF !== "lkmfwpqegjluirfusnaw") throw new Error("FLIRT live connection is disabled");
  if (env.FLIRT_LIVE_TWIN_URL !== `https://${PROJECT}.supabase.co`) throw new Error("FLIRT live connection has an unexpected target");
  const key = env.FLIRT_LIVE_TWIN_SERVICE_KEY;
  if (!key || /[\r\n\x00]/.test(key)) throw new Error("FLIRT live connection credential is missing");
  if (!/^sb_secret_[A-Za-z0-9_-]{25,}$/.test(key)) {
    let payload;
    try { payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8")); } catch {}
    if (payload?.ref !== PROJECT || payload?.role !== "service_role") throw new Error("FLIRT live connection credential has an unexpected role or project");
  }
  return { url: env.FLIRT_LIVE_TWIN_URL, key };
}
module.exports = { PROJECT, ID, CLONES, enabled, identity, isLiveAccess, configuration };
