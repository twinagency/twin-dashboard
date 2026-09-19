// Synthetic configuration for intercepted offline route tests only.
// Tests must replace global fetch before invoking database-backed behaviour.
export function configureFlirtOfflineEnv(): void {
  Object.assign(process.env, {
    FLIRT_BACKEND_ENABLED: "true",
    FLIRT_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
    SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    SUPABASE_SERVICE_KEY: "sb_secret_synthetic_test_only",
    DASHBOARD_PUBLIC_ORIGIN: "https://dashboard.flirt.example",
    DASHBOARD_SESSION_SECRET: "synthetic-operator-secret-for-offline-checks-only",
    CREATOR_SESSION_SECRET: "synthetic-creator-secret-for-offline-checks-only",
    DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD || "synthetic-admin-password",
  });
}
