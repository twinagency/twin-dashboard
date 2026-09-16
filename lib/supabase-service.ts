import { createClient, type SupabaseClient } from "@supabase/supabase-js";
// Unscoped service access is restricted to identity resolution, validated
// server-side credential/reference lookups, scoped CRM activity reads, and
// the CRM mutation layer's scoped RPCs. Ordinary dashboard access uses
// ./supabase instead.
let client: SupabaseClient | undefined;
export function serviceClient(): SupabaseClient {
  return client ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
