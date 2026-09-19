import { assertStartup } from "../deployment/flirt-environment.cjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
// Unscoped service access is restricted to identity resolution and validated
// server-side credential lookups. Dashboard reads use ./supabase instead.
let client: SupabaseClient | undefined;
export function serviceClient(): SupabaseClient {
  assertStartup("dashboard");
  return client ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

