import { deferredClient } from "../deployment/deferred-client.cjs";
import { configuration, isLiveData } from "../deployment/flirt-live-twin.cjs";
import { getDashboardAccess } from "./dashboard-access";
import { assertStartup } from "../deployment/flirt-environment.cjs";
import { dashboardFetch } from "./agency-fetch";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only admin client (service key). NEVER import this into a client component.
// FLIRT branch: only the explicitly provisioned independent project is allowed.
let client: SupabaseClient | undefined;
let liveClient: SupabaseClient | undefined;

// Lazy so `next build` (which loads route modules to collect page data) doesn't
// need SUPABASE_URL/SUPABASE_SERVICE_KEY — they're only read at request time.
async function getClient(): Promise<SupabaseClient> {
  const access = await getDashboardAccess();
  if (isLiveData(access)) {
    assertStartup("dashboard");
    const { url, key } = configuration();
    return liveClient ??= createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: dashboardFetch },
    });
  }
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

export const supabaseAdmin = deferredClient<SupabaseClient>(getClient);
