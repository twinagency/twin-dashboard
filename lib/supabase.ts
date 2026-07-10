import { createClient } from "@supabase/supabase-js";

// Server-only admin client (service key). NEVER import this into a client component.
// HARD RULE: this points at "Allie AI New" only — never the old prod project.
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { auth: { persistSession: false } },
);
