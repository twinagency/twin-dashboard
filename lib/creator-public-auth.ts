import "server-only";
import { assertStartup } from "../deployment/flirt-environment.cjs";
import { publicAuthConfig } from "../deployment/flirt-public-auth.cjs";

// Called only by server pages. Pass validated public configuration to the
// recovery UI at request time, so Docker builds contain no project keys.
export function creatorPublicAuthConfig() {
  try {
    const ref = assertStartup("dashboard");
    const config = publicAuthConfig({
      ref,
      url: process.env.SUPABASE_URL,
      key: process.env.SUPABASE_PUBLISHABLE_KEY,
    });
    return { ref, url: config.url, key: config.key };
  } catch {
    return null;
  }
}
