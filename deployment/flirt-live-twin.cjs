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
  "64d9532d-aac9-4e60-a48c-a3e5c53bb00a", // Johnny Coco (@johnnycocox)
  "3484f7d9-0cda-4f52-84de-e104c238ce5e", // Trashy (@trashybagqueen)
  "7c2e9452-1d4e-475c-86ef-07a797f52ce5", // Olivia Jade
  "7626a96d-809e-47f1-b96b-d2e3bc583328", // Amber Richardson (advoree)
  "4994b010-f976-4cd1-b053-d72986fb455d", // Luna Skyee (@lunaskyee11)
  "46c2ee84-f7a4-4e5e-a81a-bc8b742b1e7d", // Victoria Waldrip (@woahvickyyy)
]);
function enabled(env = process.env) { return env.FLIRT_LIVE_TWIN_ENABLED === "true"; }
function identity() { return { id: ID, name: "FLIRT", cloneIds: [...CLONES], dataSource: "twin-live" }; }
function isLiveAccess(access) {
  return !!access && access.id === ID && access.dataSource === "twin-live"
    && Array.isArray(access.cloneIds) && access.cloneIds.length === CLONES.length
    && new Set(access.cloneIds).size === CLONES.length
    && access.cloneIds.every(id => CLONES.includes(id));
}
// Exact creator accounts that may read ONE live Twin clone, read-only. Never match by name or email.
const SCOPED_CREATORS = Object.freeze({
  "22952fd9-0a82-4da2-a172-f1a0d1aa2c6d": Object.freeze({ cloneId: "7c2e9452-1d4e-475c-86ef-07a797f52ce5", name: "Olivia Jade", source: "twin" }), // Olivia Jade, her existing FLIRT login
  "c9c6d09d-71e4-424d-9150-07147c9bd5d2": Object.freeze({ cloneId: "2e5eb05f-cc88-4ba6-870a-924948d4b09a", name: "Mrs Callace" }), // Mrs Callace
  "eb46dd1c-2d5b-4a6e-a848-3154b5c7fc0a": Object.freeze({ cloneId: "0328e7b3-a1e5-465a-9a30-c9cf6519cba1", name: "Briana Redd" }), // Briana Redd
  "f003afbf-d57a-4a24-8376-234e2abfb4fb": Object.freeze({ cloneId: "3484f7d9-0cda-4f52-84de-e104c238ce5e", name: "trashy", source: "twin" }), // trashy, her own signup login (trashybagqueen)
  // Luna and Vicky keep uploading their own content (contentUploads), so earnings must not make their logins read-only for files.
  "032d8512-ac99-434a-abea-6b1ac5aa67fc": Object.freeze({ cloneId: "4994b010-f976-4cd1-b053-d72986fb455d", name: "Luna Skyee", source: "agency_invite", contentUploads: true }), // Luna Skyee
  "97721fb3-daf4-4fc5-b217-a0d7c9a27dca": Object.freeze({ cloneId: "46c2ee84-f7a4-4e5e-a81a-bc8b742b1e7d", name: "Victoria Waldrip", source: "agency_invite", contentUploads: true }), // Victoria Waldrip (Vicky)
});
// Additional creator-only records; all current scoped creators are also agency-assigned.
const SCOPED_ONLY_CLONES = Object.freeze([]);
function scopedCreator(accountId) { return Object.prototype.hasOwnProperty.call(SCOPED_CREATORS, accountId) ? SCOPED_CREATORS[accountId] : null; }
// Data routing only. Management and onboarding gates keep using isLiveAccess.
function isScopedLiveCreator(access) {
  const scoped = access && access.kind === "creator" ? scopedCreator(access.accountId) : null;
  return !!scoped && access.dataSource === "twin-live" && access.id === `creator:${access.accountId}`
    && Array.isArray(access.cloneIds) && access.cloneIds.length === 1 && access.cloneIds[0] === scoped.cloneId && (CLONES.includes(scoped.cloneId) || SCOPED_ONLY_CLONES.includes(scoped.cloneId));
}
function isLiveData(access) { return isLiveAccess(access) || isScopedLiveCreator(access); }
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
module.exports = { PROJECT, ID, CLONES, enabled, identity, isLiveAccess, scopedCreator, isScopedLiveCreator, isLiveData, configuration };


