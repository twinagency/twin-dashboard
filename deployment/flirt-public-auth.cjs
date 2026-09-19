"use strict";

// Browser-safe configuration validation. Contains no server credentials.
function publicAuthConfig({ ref, url, key }) {
  const fail = () => { throw new Error("FLIRT account recovery is not configured yet."); };
  if (!/^[a-z]{20}$/.test(ref || "") || ["aouaenqayfltoqrmpitg", "cnnsllgzskqkvdovyiiv"].includes(ref)) fail();
  if (url !== `https://${ref}.supabase.co` && url !== `https://${ref}.supabase.co/`) fail();
  if (!key || key === "sb_publishable_GaunWyo_PKF82PDziCc9mQ_B9_3O16a") fail();
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    // Support legacy public anon JWTs, never service-role JWTs.
    let payload;
    try { payload = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); }
    catch { fail(); }
    if (payload?.ref !== ref || payload?.role !== "anon") fail();
  }
  return { url: `https://${ref}.supabase.co`, key, storageKey: `flirt-creator-auth-${ref}` };
}

module.exports = { publicAuthConfig };
