import { assertStartup } from "../deployment/flirt-environment.cjs";
import { dashboardFetch } from "./agency-fetch";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only admin client (service key). NEVER import this into a client component.
// FLIRT branch: only the explicitly provisioned independent project is allowed.
let client: SupabaseClient | undefined;

// Lazy so `next build` (which loads route modules to collect page data) doesn't
// need SUPABASE_URL/SUPABASE_SERVICE_KEY — they're only read at request time.
function getClient(): SupabaseClient {
  if (!client) {
    assertStartup("dashboard");
    client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: dashboardFetch } },
    );
  }
  return client;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});


