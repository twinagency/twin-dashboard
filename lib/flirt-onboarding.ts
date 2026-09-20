/** Optional intake is restricted to FLIRT's isolated runtime, never a browser flag. */
export function flirtOnboardingOptional(env: Record<string, string | undefined> = process.env): boolean {
  return env.FLIRT_BACKEND_ENABLED === "true"
    && env.FLIRT_SUPABASE_PROJECT_REF === "lkmfwpqegjluirfusnaw";
}
