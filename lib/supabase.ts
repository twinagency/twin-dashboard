import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only admin client (service key). NEVER import this into a client component.
// HARD RULE: this points at "Allie AI New" only — never the old prod project.
let client: SupabaseClient | undefined;

// Lazy so `next build` (which loads route modules to collect page data) doesn't
// need SUPABASE_URL/SUPABASE_SERVICE_KEY — they're only read at request time.
function getClient(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
      { auth: { persistSession: false } },
    );
  }
  return client;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});
