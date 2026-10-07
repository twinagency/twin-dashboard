import { configuration, isLiveData } from "../deployment/flirt-live-twin.cjs";
import type { AgencyIdentity } from "./agency-identity";
import { assertStartup } from "../deployment/flirt-environment.cjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { creatorStorageFetch } from "./creator-storage-fetch";
// Unscoped service access is restricted to identity resolution and validated
// server-side credential lookups. Dashboard reads use ./supabase instead.
let client: SupabaseClient | undefined;
export function serviceClient(): SupabaseClient {
  assertStartup("dashboard");
  return client ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: creatorStorageFetch },
  });
}


// Only server-side, previously verified creator-scoped ownership/credential checks.
let liveClient: SupabaseClient | undefined;
export function serviceClientForAccess(access: AgencyIdentity | null): SupabaseClient {
  if (!isLiveData(access)) return serviceClient();
  assertStartup("dashboard");
  const { url, key } = configuration();
  return liveClient ??= createClient(url, key, {auth: {persistSession: false, autoRefreshToken: false}});
}
