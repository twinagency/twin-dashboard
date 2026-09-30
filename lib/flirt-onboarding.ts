/** Optional intake is restricted to FLIRT's isolated runtime, never a browser flag. */
export function flirtOnboardingOptional(env: Record<string, string | undefined> = process.env): boolean {
  return env.FLIRT_BACKEND_ENABLED === "true"
    && env.FLIRT_SUPABASE_PROJECT_REF === "lkmfwpqegjluirfusnaw";
}

// Temporary presentation switch. Re-enable to restore FLIRT's existing voice step.
// Voice files, saved progress and upload handling are intentionally retained.
const FLIRT_VOICE_ONBOARDING_ENABLED = false;

export function creatorVoiceOnboardingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return !flirtOnboardingOptional(env) || FLIRT_VOICE_ONBOARDING_ENABLED;
}
